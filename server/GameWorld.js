import {chooseSide} from '../src/multiplayer/TeamSelection.js';
import {teamSpawn} from '../src/multiplayer/TeamSpawns.js';
import * as T from 'three';
import {VillaMap} from '../src/world/VillaMap.js';
import {Arena} from '../src/world/Arena.js';
import {TrainingRoom} from '../src/world/TrainingRoom.js';
import {SurfaceDamage} from '../src/world/SurfaceDamage.js';
import {MovementController} from '../src/player/MovementController.js';
import {Throwables,GRENADES} from '../src/weapons/Throwables.js';
import {WEAPONS,createAmmoStores,environmentalDamage} from '../src/weapons/WeaponProfiles.js';
import {projectileEnergy,transportEnergy} from '../src/world/PhysicalMaterials.js';
import {hasLineOfSight,flashExposure} from '../src/weapons/CombatQueries.js';
import {WorldSync} from '../src/multiplayer/WorldSync.js';
import {STEP,applyInput,movementState,withWorldSeed,safeName} from '../src/multiplayer/Protocol.js';
import {runOperation} from '../src/environment/GeometryJobs.js';

export class GameWorld{
 constructor(mapId='training',emit=()=>{}){
  this.mapId=mapId;this.emit=emit;this.scene=new T.Scene();this.players=new Map();this.projectiles=[];this.smokes=[];this.time=0;this.teamScores=[0,0];this.spawnIndex=0;this.nextGrenade=0;
  withWorldSeed(()=>{if(mapId==='villa'){this.map=new VillaMap(this.scene);this.room=this.map;}else{this.map=new Arena(this.scene);this.room=new TrainingRoom(this.scene,this.map.colliders,{concreteColor:this.map.concreteColor,concreteNormal:this.map.concreteNormal});}});
  this.sync=new WorldSync(this.scene,this.map,this.room);this.surface=new SurfaceDamage(this.scene,this.map.colliders);this.room.surfaceDamage=this.surface;
  // The server keeps structural physics and collision, not visual particle work.
  this.surface.emit=()=>{};if(this.room.emitPanelDebris)this.room.emitPanelDebris=()=>{};
  this.surface.hit=(...args)=>{const steps=this.surface.hitSteps(...args);let step=steps.next();while(!step.done){const op=step.value;if(op.kind==='sever')op.colliders=this.map.colliders;step=steps.next(op.kind==='mark'||op.kind==='floorMark'?false:runOperation(op));}this.surface.consumeSeveredStub(args[0].object);return step.value;};
 }
 addPlayer(id,name,side='auto'){
  const camera=new T.PerspectiveCamera(85,1,.02,500),movement=new MovementController(camera,null,{input:false});movement.footstepsFromAnimation=true;
  const {team,spectator}=chooseSide(this.players.values(),side);
  const p={id,name:safeName(name),team,spectator,damageSeq:0,camera,movement,hp:100,kills:0,deaths:0,ammo:createAmmoStores(),slot:'primary',queue:[],lastSeq:0,ack:0,actionAck:0,nextFire:0,fireUntil:0,reload:null,pin:null,counts:{frag:2,flash:2,smoke:2},lastInputTime:this.time,spawnIndex:this.spawnIndex++};
  this.players.set(id,p);this.respawn(p);if(spectator){p.hp=0;p.movement.isDisabled=true;}return p;
 }
 respawn(p){
  const m=p.movement,{position:spawn,yaw}=teamSpawn(this.mapId,p.team,this.players.values(),p);
  m.resetInput();m.position.set(spawn[0],spawn[1]+m.standHeight,spawn[2]);m.velocity.set(0,0,0);m.yaw=yaw;m.pitch=0;m.isGrounded=true;m.isDisabled=false;m.isCrouching=false;m.currentHeight=m.standHeight;m.update(0,this.map.colliders,this.map.jumpPads);
  p.hp=100;p.ammo=createAmmoStores();p.counts={frag:2,flash:2,smoke:2};p.reload=null;p.pin=null;p.respawnAt=0;p.queue=[];p.ack=p.lastSeq;
 }
 enqueue(p,inputs){for(const data of inputs){if(data.seq<=p.lastSeq||data.seq>p.lastSeq+600)continue;p.lastSeq=data.seq;p.queue.push(data);}if(p.queue.length>12)p.queue.splice(0,p.queue.length-12);p.lastInputTime=this.time;}
 action(p,data){
  if(p.spectator)return;
  if(!data||!Number.isSafeInteger(data.seq)||data.seq<=p.actionAck||data.seq>p.actionAck+1000)return;
  p.actionAck=data.seq;if(p.hp<=0)return;
  if(data.kind==='reload'){
   const slot=WEAPONS[data.slot]?data.slot:p.slot,ammo=p.ammo[slot];if(p.reload||ammo.ammo>=WEAPONS[slot].magazine||ammo.reserve<=0)return;
   p.slot=slot;p.reload={slot,end:this.time+WEAPONS[slot].reloadTime};return;
  }
  if(data.kind==='pin'){
   if(!GRENADES[data.type]||p.pin||p.counts[data.type]<=0)return;p.reload=null;p.counts[data.type]--;p.pin={type:data.type,time:this.time};return;
  }
  if(data.kind==='throw'){
   if(!p.pin||this.time-p.pin.time<.3)return;
   this.launch(p,data.mode==='low'?'low':'high');return;
  }
  if(data.kind==='door'){
   this.room.interact(p.movement.position);return;
  }
  if(data.kind==='fire'){
   if(!WEAPONS[data.slot]||p.reload||p.pin||this.time+.018<p.nextFire||p.ammo[data.slot].ammo<=0)return;
   const m=p.movement;if(m.isSprinting||m.isSliding||m.sprintRecovery>0)return;
   if(!Number.isFinite(data.yaw)||Math.abs(data.yaw)>1e6||!Number.isFinite(data.pitch)||Math.abs(data.pitch)>Math.PI/2)return;
   p.slot=data.slot;m.yaw=data.yaw;m.pitch=data.pitch;m.isAiming=!!data.aiming;m.sprintInterruptTimer=.25;
   p.ammo[p.slot].ammo--;p.nextFire=this.time+WEAPONS[p.slot].interval;p.fireUntil=this.time+.12;m.update(0,this.map.colliders,this.map.jumpPads);this.fire(p);
  }
 }
 fire(p){
  const profile=WEAPONS[p.slot],m=p.movement,origin=p.camera.position.clone();
  const moving=m.getSpeed()>.5,spread=m.isAiming?(moving?.0012:.00045):m.isCrouching?.014:moving?.035:.022;
  const direction=new T.Vector3((Math.random()-.5)*spread,(Math.random()-.5)*spread,-1).normalize().applyEuler(new T.Euler(m.pitch,m.yaw,0,'YXZ'));
  const ray=new T.Raycaster(origin,direction,0,profile.range),objects=[];this.scene.updateMatrixWorld(true);
  this.scene.traverseVisible(o=>{if(o.isMesh&&o.userData.isShootable)objects.push(o)});
  const hits=ray.intersectObjects(objects,false);
  for(const other of this.players.values())if(other!==p&&other.hp>0){
   const feet=other.movement.position.y-other.movement.currentHeight,height=other.movement.currentHeight+.16,lean=new T.Vector3(Math.cos(other.movement.yaw),0,-Math.sin(other.movement.yaw)).multiplyScalar(other.movement.leanOffset*.5),body=other.movement.position.clone().add(lean),headCenter=other.camera.position;
   for(const [head,min,max] of [[false,new T.Vector3(body.x-.27,feet,body.z-.27),new T.Vector3(body.x+.27,feet+height-.3,body.z+.27)],[true,headCenter.clone().add(new T.Vector3(-.19,-.14,-.19)),headCenter.clone().add(new T.Vector3(.19,.19,.19))]]){
    const point=ray.ray.intersectBox(new T.Box3(min,max),new T.Vector3());if(point&&point.distanceTo(origin)<=profile.range)hits.push({player:other,head,point,distance:point.distanceTo(origin)});
   }
  }
  hits.sort((a,b)=>a.distance-b.distance);let multiplier=1,penetrations=0,energy=null,lastDistance=0,end=origin.clone().addScaledVector(direction,profile.range),hitPlayer=null;const seen=new Set(),impacts=[];
  for(const hit of hits){
   const key=hit.player||hit.object;if(seen.has(key))continue;seen.add(key);end.copy(hit.point);
   if(hit.player){if(hit.player.team!==p.team){const damage=Math.round((hit.head?profile.headDamage:profile.bodyDamage)*multiplier);this.damage(hit.player,damage,p,{slot:p.slot,headshot:hit.head});hitPlayer={id:hit.player.id,damage,head:hit.head};}break;}
   const atHit=energy===null?projectileEnergy(p.slot,hit.distance):transportEnergy(p.slot,energy,hit.distance-lastDistance),mesh=hit.object;let breakable=null;for(let o=mesh;o;o=o.parent)breakable||=o.userData.breakable;
   const water=!!(mesh.userData.waterBody||mesh.userData.waterSystem);
   const submerged=!water&&this.map.liquids?.bodies.some(body=>Math.abs(hit.point.x-body.x)<=body.width/2&&Math.abs(hit.point.z-body.z)<=body.depth/2&&hit.point.y>=body.bottom-.03&&hit.point.y<body.level);
   impacts.push({id:mesh.userData.netWorldId,point:hit.point.toArray(),normal:hit.face?.normal.clone().applyNormalMatrix(new T.Matrix3().getNormalMatrix(mesh.matrixWorld)).normalize().toArray()||direction.clone().negate().toArray(),surface:water?'water':mesh.userData.physicalMaterial||mesh.userData.surface||'concrete',strength:profile.bodyDamage*multiplier,submerged:!!submerged});
   let response;if(breakable?.takeBulletHit){
    const normal=hit.face?.normal.clone().applyNormalMatrix(new T.Matrix3().getNormalMatrix(mesh.matrixWorld)).normalize();
    response=breakable.takeBulletHit(hit,Math.round(environmentalDamage(p.slot,hit.distance,profile.bodyDamage*multiplier,normal?Math.abs(normal.dot(direction)):1)),direction,{slot:p.slot,distance:hit.distance,multiplier,energy:atHit});
   }else response=this.surface.hit(hit,p.slot,direction,{distance:hit.distance,damage:profile.bodyDamage*multiplier,energy:atHit});
   if(response?.penetrates&&penetrations++<4&&multiplier>.08){multiplier*=response.damageMultiplier??1;energy=response.remainingEnergy??atHit*.8;lastDistance=hit.distance;end.copy(origin).addScaledVector(direction,profile.range);continue;}break;
  }
  this.emit('shot',{id:p.id,slot:p.slot,from:origin.toArray(),to:end.toArray(),hit:hitPlayer,impacts});
 }
 damage(p,amount,attacker,cause={}){if(p.hp<=0)return;const before=p.hp;p.hp=Math.max(0,p.hp-amount);p.damageSeq++;this.emit('damaged',{id:p.id,seq:p.damageSeq,hp:p.hp,amount:before-p.hp,by:attacker?.id||null,source:attacker?.movement.position.toArray()||null,slot:cause.slot||null});if(!p.hp){p.deaths++;p.respawnAt=this.time+3;p.reload=null;p.movement.isDisabled=true;p.movement.resetInput();if(attacker&&attacker!==p&&attacker.team!==p.team){attacker.kills++;this.teamScores[attacker.team]++;}this.emit('eliminated',{id:p.id,name:p.name,by:attacker?.id||null,byName:attacker?.name||'Environment',slot:cause.slot||null,headshot:!!cause.headshot});}}
 launch(p,mode){
  const proxy={camera:p.camera,movement:p.movement,colliders:this.map.colliders};const {position,velocity}=Throwables.prototype.launchParameters.call(proxy,mode);
  const projectile={id:String(this.nextGrenade++),owner:p.id,type:p.pin.type,position,velocity,age:this.time-p.pin.time,mesh:new T.Object3D(),bounceCooldown:0,resting:false};this.projectiles.push(projectile);p.pin=null;
 }
 detonate(type,position,owner){
  if(type==='frag'){
   const targets=[];for(const p of this.players.values()){const center=p.movement.position.clone().add(new T.Vector3(0,-.5,0)),distance=center.distanceTo(position);if(p.hp>0&&distance<6&&hasLineOfSight(this.scene,position,center))targets.push([p,Math.round(160*(1-distance/6))]);}
   if(this.room.damageExplosion)this.room.damageExplosion(position,6);else{
    for(const pane of this.room.glassPanes||[])if(!pane.userData.shattered&&pane.getWorldPosition(new T.Vector3()).distanceTo(position)<6)this.room.shatterGlass(pane,{point:pane.getWorldPosition(new T.Vector3())},new T.Vector3(0,1,0));
    const point=this.room.doorMesh?.localToWorld(new T.Vector3(.56,1.1,0));if(point&&point.distanceTo(position)<6&&hasLineOfSight(this.scene,position,point,new Set([this.room.doorMesh])))this.room.hitDoor({point},Math.max(40,650*(1-point.distanceTo(position)/6)),point.clone().sub(position).normalize());
   }
   for(const [p,damage] of targets)this.damage(p,damage,this.players.get(owner),{slot:'frag'});
  }
  if(type==='smoke')this.smokes.push({id:'s'+this.nextGrenade++,position:position.toArray(),started:this.time});
  this.emit('detonate',{type,position:position.toArray(),owner});
 }
 step(){
  this.time+=STEP;
  for(const p of this.players.values()){
   if(p.spectator)continue;
   const m=p.movement;if(p.hp<=0){if(this.time>=p.respawnAt)this.respawn(p);continue;}
   const input=p.queue.shift();if(input){applyInput(m,input);if(p.slot!==input.slot)p.reload=null;p.slot=input.slot;p.ack=input.seq;}else if(this.time-p.lastInputTime>.15)for(const key of Object.keys(m.keys))m.keys[key]=false;
   m.isReloading=!!p.reload;m.update(STEP,this.map.colliders,this.map.jumpPads);
   if(p.reload&&this.time>=p.reload.end){const a=p.ammo[p.reload.slot],needed=Math.min(WEAPONS[p.reload.slot].magazine-a.ammo,a.reserve);a.ammo+=needed;a.reserve-=needed;p.reload=null;}
   if(p.pin&&this.time-p.pin.time>=6){const type=p.pin.type;p.pin=null;this.detonate(type,m.position.clone().add(new T.Vector3(0,-.25,0)),p.id);}
  }
  const contacts=[...this.players.values()].filter(p=>p.hp>0).map(p=>({position:p.movement.position,height:p.movement.currentHeight,speed:p.movement.getSpeed()}));
  this.room.update(STEP,contacts[0]?.position||new T.Vector3(100,1.65,100),{height:contacts[0]?.height||1.65,speed:contacts[0]?.speed||0,players:contacts});this.smokes=this.smokes.filter(s=>this.time-s.started<14);
  for(const projectile of [...this.projectiles]){projectile.age+=STEP;projectile.bounceCooldown-=STEP;if(!projectile.resting)Throwables.prototype.integrate.call({colliders:this.map.colliders,room:this.room,bounceSound(){}},projectile,STEP);if(projectile.age>=6){this.projectiles.splice(this.projectiles.indexOf(projectile),1);this.detonate(projectile.type,projectile.position,projectile.owner);}}
 }
 snapshot(){return{time:this.time,scores:this.teamScores,smokes:this.smokes,players:[...this.players.values()].map(p=>({id:p.id,name:p.name,team:p.team,spectator:p.spectator,damageSeq:p.damageSeq,respawnRemaining:!p.spectator&&p.hp<=0?Math.max(0,p.respawnAt-this.time):0,hp:p.hp,kills:p.kills,deaths:p.deaths,ack:p.ack,actionAck:p.actionAck,movement:movementState(p.movement),slot:p.slot,ammo:p.ammo,counts:p.counts,reload:p.reload?{slot:p.reload.slot,remaining:Math.max(0,p.reload.end-this.time),duration:WEAPONS[p.reload.slot].reloadTime}:null,firing:p.fireUntil>this.time,grenade:p.pin?.type||null})),grenades:this.projectiles.map(p=>({id:p.id,type:p.type,position:p.position.toArray()}))};}
 dispose(){this.room.destruction?.dispose();this.scene.traverse(o=>{o.geometry?.dispose();for(const m of Array.isArray(o.material)?o.material:o.material?[o.material]:[])m.dispose();});this.players.clear();}
}
