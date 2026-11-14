import {connectBrowserRoom} from './BrowserRoom.js';
import {DamageFeedback} from './DamageFeedback.js';
import {SpectatorView} from './SpectatorView.js';
import {Client} from '@colyseus/sdk';
import * as T from 'three';
import {PROTOCOL,STEP,readInput,applyInput,restoreMovement,movementState,connectionProblem} from './Protocol.js';
import {RemotePlayer} from './RemotePlayer.js';
import {createGrenadeModel} from '../models/GrenadeModel.js';
import {soundEngine} from '../audio/SoundEngine.js';
import {projectSurfaceMark} from '../world/SurfaceDecal.js';
import {FrameWorkQueue} from '../environment/FrameWorkQueue.js';
import {SmokeCloud,smokeBounds} from '../weapons/SmokeCloud.js';
import {PredictionCamera} from './PredictionCamera.js';
import {renderedAim} from './RenderedAim.js';
import {applyLiquidState} from './LiquidSync.js';
import {playMaterialEffect,waterImpact} from './MaterialEffects.js';
import {ProjectilePresentation} from './ProjectilePresentation.js';

export class NetworkSession{
 constructor(game,world,status){this.game=game;this.world=world;this.status=status;this.active=true;this.connected=false;this.remotes=new Map();this.grenades=new Map();this.pending=[];this.batch=[];this.seq=0;this.actionSeq=0;this.accumulator=0;this.chain=Promise.resolve();this.wasDead=false;this.ping=0;this.own=null;this.effects=new FrameWorkQueue(2);}
 async connect(address,code,options){
  this.status('Connecting to the host…');if(options.browserHost){this.room=await connectBrowserRoom(code,options);}else{const url=new URL(address);if(!['http:','https:','ws:','wss:'].includes(url.protocol)||url.username||url.password)throw Error('Use the host’s http:// address.');
  const client=new Client(url.href),request=code?client.joinById(code.toUpperCase(),{...options,protocol:PROTOCOL}):client.create('private',{...options,protocol:PROTOCOL});
  let timeout;const timer=new Promise((_,reject)=>{timeout=setTimeout(()=>reject(Error('Cannot reach the host. Check the address, server window and Wi-Fi.')),15000);});
  try{this.room=await Promise.race([request,timer]);}catch(error){request.then(room=>room.leave()).catch(()=>{});throw connectionProblem(error,url.href);}finally{clearTimeout(timeout);}}
  const room=this.room;this.id=room.sessionId;this.code=room.roomId;this.damageFeedback=new DamageFeedback(this.game);this.spectator=new SpectatorView(this.game,this);
  room.onMessage('welcome',()=>{});
  room.onMessage('latencyProbe',nonce=>room.send('latencyReply',nonce));
  room.onMessage('networkStats',stats=>{this.networkStats=stats;});
  room.onMessage('world',packet=>{this.chain=this.chain.then(async()=>{
   const bytes=packet.bytes instanceof Uint8Array?packet.bytes:new Uint8Array(packet.bytes.data||packet.bytes);
   const decoded=await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text();if(this.closed)return;
   const entries=JSON.parse(decoded);let started=performance.now();
   for(const entry of entries){this.world.apply([entry],{interpolate:!packet.initial,onEffect:packet.initial?null:effect=>this.materialEffect(effect)});if(performance.now()-started>3){await new Promise(requestAnimationFrame);started=performance.now();}}
   if(packet.initial){this.connected=true;this.status(`Connected · Room ${this.code} · ${this.game.mapId==='villa'?'Villa':'Training range'}`);this.onReady?.();}
  }).catch(e=>this.fail('World sync failed: '+e.message));});
  room.onMessage('snapshot',data=>this.snapshot(data));
  room.onMessage('liquid',data=>applyLiquidState(this.game.arena.liquids,data));
  room.onMessage('shot',data=>this.shot(data));
  room.onMessage('detonate',data=>{if(data.type==='smoke'){const eq=this.game.equipment;if(data.owner===this.id&&eq.held?.armed)eq.stow(true);soundEngine.playUtility('smoke',new T.Vector3().fromArray(data.position));return;}const eq=this.game.equipment;if(data.owner===this.id&&eq.held?.armed)eq.stow(true);eq.networkReceiving=true;try{eq.detonate(data.type,new T.Vector3().fromArray(data.position));}finally{eq.networkReceiving=false;}});
  room.onMessage('damaged',data=>{if(data.id===this.id)this.damageFeedback.hit(data);});
  room.onMessage('eliminated',data=>{const roster=this.lastSnapshot?.players||[];const victim=data.name||roster.find(p=>p.id===data.id)?.name||'Opponent',killer=data.byName||roster.find(p=>p.id===data.by)?.name||'Environment';this.game.hud.addKillFeedEntry(victim,!!data.headshot,data.slot,killer);});
  room.onMessage('problem',message=>this.fail(message));room.onMessage('pong',sent=>{this.ping=Math.round(performance.now()-sent);});
  room.onError((code,message)=>this.fail(`Connection error ${code}: ${message}`));room.onLeave(()=>this.fail(options.browserHost?'The host disconnected. Ask your friend to create a new room.':'Disconnected. Rejoin the room while the host’s server is running.'));
  const g=this.game;
  g.weapon.network=this;g.equipment.network=this;
  // Server snapshots own structural physics. Clients retain liquids and effects.
  if(g.arena.environment)g.arena.environment.update=()=>{};
  for(const floor of g.arena.timberFloors||[])floor.update=()=>{};
  for(const panel of g.arena.panels||[])panel.update=()=>{};
  if(g.arena.id!=='villa'){g.room.update=(_dt,position)=>{g.room.canInteract=!g.room.door.destroyed&&position.distanceTo(g.room.doorMesh.getWorldPosition(new T.Vector3()))<2.3;};}
  if(g.room.interact){g.room.interact=()=>{this.action({kind:'door'});return true;};}
  window.addEventListener('keydown',e=>{if(this.active&&['KeyP','KeyB','KeyH'].includes(e.code)){e.preventDefault();e.stopImmediatePropagation();}},true);
  window.addEventListener('pagehide',()=>room.leave(),{once:true});
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&this.connected){g.movement.resetInput();g.weapon.triggerHeld=false;this.accumulator=0;this.presentation?.reset(g.movement.position);}});
  room.send('ready',{layout:this.world.layout});
  this.pingTimer=setInterval(()=>{if(this.connected)room.send('ping',performance.now());},2000);
 }
 fail(message){this.closed=true;this.connected=false;this.damageFeedback?.hide();this.spectator?.hide();this.effects.dispose();clearInterval(this.pingTimer);this.game.movement.resetInput();this.game.weapon.triggerHeld=false;document.exitPointerLock?.();this.game.startScreen.classList.remove('hidden');this.status(message+' Refresh this page to rejoin.',true);this.onFailure?.();}
 action(data){if(this.connected)this.room.send('action',{...data,seq:++this.actionSeq});}
 fire(weapon){
  const camera=weapon.aimingCamera?.()||weapon.camera,targets=[];
  if(camera!==weapon.camera){this.game.scene.updateMatrixWorld(true);this.game.scene.traverseVisible(o=>{if(o.isMesh&&(o.userData.isShootable||o.userData.isAimTarget))targets.push(o);});}
  const aim=renderedAim(camera,camera!==weapon.camera?weapon.camera.getWorldPosition(new T.Vector3()):null,targets,weapon.profile?.range||160);
  this.action({kind:'fire',slot:weapon.activeSlot,...aim,aiming:weapon.isAiming});
 }
 reload(weapon){this.action({kind:'reload',slot:weapon.activeSlot});}
 materialEffect(effect){
  this.materialSounds??=new Map();const now=performance.now(),last=this.materialSounds.get(effect.id);
  if(last!==undefined&&now-last<150)return;
  for(const [id,time] of this.materialSounds)if(now-time>1000)this.materialSounds.delete(id);
  this.materialSounds.set(effect.id,now);playMaterialEffect(effect);
  if(effect.kind==='glassBreak')this.game.surfaceDamage.emit('glass',new T.Vector3().fromArray(effect.position),new T.Vector3(0,1,0),14,.025);
 }
 pin(type){this.action({kind:'pin',type});}
 spawn(type,mode){this.action({kind:'throw',type,mode});const mesh=createGrenadeModel(type);return{type,mesh,position:mesh.position,velocity:new T.Vector3(),age:0};}
 step(delta){
  if(!this.connected||!this.own||this.own.spectator||this.own.hp<=0)return;const g=this.game,m=g.movement;this.accumulator=Math.min(this.accumulator+delta,.1);
  this.presentation??=new PredictionCamera(m.camera);this.presentation.restore();
  while(this.accumulator>=STEP){this.accumulator-=STEP;const input=readInput(m,g.weapon,++this.seq);if(!m.isDisabled)m.update(STEP,g.arena.colliders,g.arena.jumpPads);this.presentation.tick(m.position);this.pending.push({input,state:movementState(m)});this.batch.push(input);if(this.pending.length>180)this.pending.shift();}
  this.presentation.render(this.accumulator/STEP,m);
  if(this.batch.length>=2){this.room.send('input',this.batch.splice(0,6));}
 }
 snapshot(data){
  this.lastSnapshot=data;const ids=new Set();const g=this.game;
  for(const p of data.players){if(p.id===this.id){this.reconcile(p);this.own=p;continue;}if(p.spectator)continue;ids.add(p.id);let remote=this.remotes.get(p.id);if(!remote){remote=new RemotePlayer(g,p.id);this.remotes.set(p.id,remote);}remote.push(p,data.time);}
  for(const [id,remote] of this.remotes)if(!ids.has(id)){remote.dispose();this.remotes.delete(id);}
  const alive=new Set();for(const p of data.grenades){alive.add(p.id);let mesh=this.grenades.get(p.id);if(!mesh){mesh=createGrenadeModel(p.type);mesh.getObjectByName('SafetyPin').visible=false;mesh.userData.projectilePresentation=new ProjectilePresentation(mesh);g.scene.add(mesh);this.grenades.set(p.id,mesh);}mesh.userData.projectilePresentation.push(p.position);}
  for(const [id,mesh] of this.grenades)if(!alive.has(id)){g.scene.remove(mesh);this.grenades.delete(id);}
  this.smokes??=new Map();const smokeIds=new Set();for(const smoke of data.smokes||[]){smokeIds.add(smoke.id);if(!this.smokes.has(smoke.id)){const position=new T.Vector3().fromArray(smoke.position),cloud=new SmokeCloud(g.scene,position,smokeBounds(g.room,position));cloud.age=Math.max(0,data.time-smoke.started);this.smokes.set(smoke.id,cloud);g.equipment.clouds.push(cloud);}}
  for(const [id,cloud] of this.smokes)if(!smokeIds.has(id)){cloud.dispose(g.scene);g.equipment.clouds=g.equipment.clouds.filter(c=>c!==cloud);this.smokes.delete(id);}
  const own=this.own;if(own){const team=own.team===0?'defenders':'attackers';g.hud.setMatchState({defendersScore:data.scores[0],attackersScore:data.scores[1],seconds:Math.floor(data.time),round:1,playerTeam:team,defenders:data.players.filter(p=>p.team===0).sort(p=>p.id===this.id?-1:1).map(p=>({alive:p.hp>0})),attackers:data.players.filter(p=>p.team===1).sort(p=>p.id===this.id?-1:1).map(p=>({alive:p.hp>0}))});}
 }
 reconcile(p){
  const g=this.game,m=g.movement,w=g.weapon,eq=g.equipment,dead=p.hp<=0,ack=this.pending.find(c=>c.input.seq===p.ack),previous=this.own;
  if(this.wasDead&&!dead){eq.respawnPlayer();this.pending=[];this.batch=[];}
  if(!previous||dead||this.wasDead!==dead||!ack||new T.Vector3().fromArray(ack.state.position).distanceTo(new T.Vector3().fromArray(p.movement.position))>.025){
   this.presentation?.restore();
   const yaw=m.yaw,pitch=m.pitch,liveKeys={...m.keys},crouching=m.isCrouching;restoreMovement(m,p.movement);
   const remaining=this.pending.filter(c=>c.input.seq>p.ack);
   if(!dead&&remaining.length<=30)for(const c of remaining){applyInput(m,c.input);m.update(STEP,g.arena.colliders,g.arena.jumpPads);c.state=movementState(m);}
   if(previous){m.yaw=yaw;m.pitch=pitch;Object.assign(m.keys,liveKeys);m.isCrouching=crouching;}m.update(0,g.arena.colliders,g.arena.jumpPads);
   if(this.wasDead!==dead)this.presentation?.reset(m.position);else this.presentation?.correct(m.position);
  }
  this.pending=this.pending.filter(c=>c.input.seq>p.ack);m.isDisabled=dead;
  if(previous&&p.hp<previous.hp&&p.damageSeq>this.damageFeedback.seq)this.damageFeedback.hit({seq:p.damageSeq,hp:p.hp,amount:previous.hp-p.hp});
  this.damageFeedback.sync(p.hp,p.spectator);
  if(!this.wasDead&&dead){m.resetInput();w.cancelReload();eq.stow(true);soundEngine.stopWeaponSounds();this.pending=[];this.batch=[];}
  eq.playerHealth=p.hp;eq.respawnTimer=0;eq.counts={...p.counts};this.wasDead=dead;
  if(dead){w.triggerHeld=false;w.isAiming=false;}
  if(p.actionAck>=this.actionSeq){for(const [slot,store] of Object.entries(p.ammo)){w.ammoStores[slot].ammo=store.ammo;w.ammoStores[slot].reserve=store.reserve;}
   if(p.reload&&p.reload.slot===w.activeSlot){w.isReloading=true;w.reloadDuration=p.reload.duration;w.reloadRemaining=p.reload.remaining;w.reloadProgress=1-p.reload.remaining/p.reload.duration;}else if(w.isReloading){w.cancelReload();}
  }
 }
 shot(data){
  const g=this.game,from=new T.Vector3().fromArray(data.from),to=new T.Vector3().fromArray(data.to);const remote=this.remotes.get(data.id),muzzle=data.id===this.id?(g.weapon.visualMuzzlePosition?.(data.slot)||null):remote?.view.muzzlePosition(data.slot);g.weapon.createBulletTracer(muzzle||from,to,data.id===this.id?data.slot:null);
  if(data.id!==this.id){const remote=this.remotes.get(data.id);if(remote)remote.w.fireActionRemaining=.1;soundEngine.playRemoteShot(data.slot,from);}
  if(data.id===this.id&&data.hit){window.__triggerHitmarker?.(data.hit.head,data.hit.damage,to);soundEngine.playHitmarker(data.hit.head);}
  for(const impact of data.impacts||[])this.effects.push(()=>{
   const mesh=this.world.meshes.get(impact.id);if(waterImpact(mesh,impact)||impact.submerged)return;if(!mesh?.visible)return;const fx=g.surfaceDamage,point=new T.Vector3().fromArray(impact.point),normal=new T.Vector3().fromArray(impact.normal),kind=impact.surface==='ceramic'?'glass':['wood','metal','glass'].includes(impact.surface)?impact.surface:'concrete';
   fx.emit(kind,point,normal,6,.02);fx.emit('dust',point,normal,4,.03);
   if(kind==='glass')return;if(kind==='wood')soundEngine.playWoodHit();else soundEngine.playImpact(point);mesh.updateWorldMatrix(true,false);const q=new T.Quaternion().setFromUnitVectors(new T.Vector3(0,0,1),normal),decal=new T.Mesh(new T.BufferGeometry(),fx.markMaterials[kind]);
   const entry={mesh,decal,local:mesh.worldToLocal(point),rotation:mesh.getWorldQuaternion(new T.Quaternion()).invert().multiply(q),size:new T.Vector3(.035,.035,.035),life:fx.markLife};
   if(projectSurfaceMark(entry)){fx.marks.push(entry);if(fx.marks.length>192){const old=fx.marks.shift();old.removed=true;old.decal.removeFromParent();old.decal.geometry.dispose();}}else decal.geometry.dispose();
  });
 }
 update(delta){this.damageFeedback?.update(delta);this.game.scoreboard?.update();this.world.presentation?.update(delta);for(const mesh of this.grenades.values())mesh.userData.projectilePresentation.update();for(const remote of this.remotes.values())remote.update(delta);
  soundEngine.combat.listener={position:this.game.movement.position,yaw:this.game.movement.yaw};
  // Hide practice bots even if their asynchronous asset loading finishes later.
  for(const bot of this.game.botManager.bots)bot.model.visible=false;
  if(this.connected&&!this.game.movement.isLocked){this.game.weapon.triggerHeld=false;this.game.weapon.update(delta);this.game.equipment.update(delta);this.game.room.update(delta,this.game.movement.position);this.game.surfaceDamage.update(delta);this.game.hud.update(this.game.movement,this.game.weapon,this.game.room,this.game.equipment);}
 }
}
