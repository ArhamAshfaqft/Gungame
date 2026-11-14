import {SniperWeapon} from '../src/weapons/SniperWeapon.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {GameWorld} from '../server/GameWorld.js';
import {MovementController} from '../src/player/MovementController.js';
import {resolvePlayerContacts} from '../src/multiplayer/PlayerContacts.js';
import {footstepSurface,remoteFootstepMix} from '../src/multiplayer/Footsteps.js';
import {Throwables} from '../src/weapons/Throwables.js';
import {soundEngine} from '../src/audio/SoundEngine.js';
const V=(...a)=>new T.Vector3(...a);
for(const name of ['playDoorOpen','playDoorBreak','playWoodHit','playUtility'])soundEngine[name]=()=>{};

test('authoritative players block both teams without standing on heads or blocking separate floors',()=>{
 const w=new GameWorld('training');try{
  const a=w.addPlayer('a','a','red'),b=w.addPlayer('b','b','blue');a.movement.position.set(-3,1.65,32);b.movement.position.set(-3,1.65,30);
  for(let i=0;i<90;i++){w.enqueue(a,[{seq:i+1,keys:{forward:true},yaw:0,pitch:0,slot:'primary'}]);w.step();assert.ok(a.movement.position.distanceTo(b.movement.position)>=.899);assert.ok(Math.abs(a.movement.position.y-1.65)<.01);}
  assert.ok(a.movement.position.z>b.movement.position.z,'cannot pass through a standing opponent');
  a.movement.position.set(0,5.05,0);b.movement.position.set(0,1.65,0);resolvePlayerContacts(a.movement,w.players.values(),a.id);assert.deepEqual(a.movement.position.toArray(),[0,5.05,0]);
 }finally{w.dispose();}
});

test('stacked low collision cells and detached doors cannot staircase a player onto another floor',()=>{
 const m=new MovementController(new T.PerspectiveCamera(),null,{input:false});m.position.set(0,5.05,0);m.velocity.set(0,-.01,0);m.isGrounded=true;
 for(const top of [3.8,4.2,4.6,5,5.4,5.8,6.2,6.6])m.resolveBoxCollision(new T.Box3(V(-1,3.4,-1),V(1,top,1)),3.4);
 assert.ok(m.position.y<=5.45+.0001,'one move can rise only one step from its original feet');
 m.position.set(0,5.05,0);const door=new T.Box3(V(-1,3.4,-.05),V(1,3.8,.05));door.supportMesh={userData:{breakable:{isDoor:true}}};m.resolveBoxCollision(door,3.4);assert.equal(m.position.y,5.05);
});

test('replicated doors keep handles hidden and render the final state after repeated reversals',()=>{
 const server=new GameWorld('villa'),client=new GameWorld('villa');try{
  const door=server.map.panels.find(p=>p.isDoor&&p.group.position.y>6),other=client.sync.meshes.get(door.mesh.userData.netWorldId).userData.breakable;
  for(let k=0;k<8;k++){door.toggle();for(let i=0;i<6;i++)door.update(1/60);client.sync.apply(server.sync.collect(),{interpolate:true});for(let i=0;i<3;i++)client.sync.presentation.update(1/60);assert.equal(other.open,door.open);}
  client.sync.presentation.update(.2);assert.ok(other.group.quaternion.angleTo(door.group.quaternion)<.00001);
  door.destroyed=true;door.mesh.visible=false;door.handle.visible=true;
  client.sync.apply(server.sync.collect());assert.equal(other.handle.visible,false,'hidden leaves cannot leave floating handles');
  client.sync.apply(server.sync.snapshot());assert.equal(other.handle.visible,false,'late joins retain hidden handle');
 }finally{server.dispose();client.dispose();}
});

test('slope guards block falls along the whole flight, allow passage below and remain within collider budget',()=>{
 const w=new GameWorld('villa');try{
  assert.ok(w.map.colliders.length<1400);
  const guards=w.map.colliders.filter(b=>b.stairRail);assert.ok(guards.length>=8);
  for(const box of guards)for(const t of [.1,.5,.9]){
   const r=box.stairRail,z=r.z+r.length*(.5-t),surface=r.base+r.rise*t,m=new MovementController(new T.PerspectiveCamera(),null,{input:false});m.position.set(box.min.x-.1,surface+1.65,z);m.velocity.x=2;m.resolveBoxCollision(box,surface);assert.ok(m.position.x<=box.min.x-.449||m.position.x>=box.max.x+.449);assert.equal(m.position.y,surface+1.65);
   m.position.set(box.min.x,surface-.1,z);m.resolveBoxCollision(box,surface-1.75);assert.equal(m.position.x,box.min.x,'railing does not block a lower storey');
  }
 }finally{w.dispose();}
});

test('cooked network grenades stay visible beyond a delayed local fuse and early throws are queued',()=>{
 const previousWindow=globalThis.window;globalThis.window=new EventTarget();
 try{
  class Weapon extends SniperWeapon{loadAssets(){}setupInput(){}}
  const scene=new T.Scene(),camera=new T.PerspectiveCamera();camera.position.set(0,1.65,0);
  const movement={position:camera.position,velocity:V(0,0,0),mouseDelta:new T.Vector2(),currentFov:85,standHeight:1.65,isLocked:true,isGrounded:true,sprintRecovery:0,requestWeaponReady(){},resetInput(){},getSpeed(){return 0;}};
  const weapon=new Weapon(scene,camera,movement),eq=new Throwables(scene,camera,movement,weapon);eq.network={pin(){}};
  assert.equal(eq.select('frag'),true);assert.equal(eq.pullPin(),true);for(let i=0;i<390;i++)eq.update(1/60);
  assert.ok(eq.held?.armed,'local clock cannot hide a still-live authoritative grenade');assert.equal(weapon.grenadeEquipped,true);
 }finally{globalThis.window=previousWindow;}
 const w=new GameWorld('training');try{const p=w.addPlayer('a','a');w.action(p,{seq:1,kind:'pin',type:'frag'});w.action(p,{seq:2,kind:'throw',mode:'low'});assert.equal(w.projectiles.length,0);for(let i=0;i<20;i++)w.step();assert.equal(w.projectiles.length,1);assert.equal(p.pin,null);assert.equal(p.counts.frag,1);}finally{w.dispose();}
});

test('remote steps fade with distance, pan with listener heading and reflect the surface',()=>{
 const listener={position:V(0,1.65,0),yaw:0},near=remoteFootstepMix('run','wood',V(2,0,0),listener),far=remoteFootstepMix('run','wood',V(20,0,0),listener);
 assert.ok(near.volume>far.volume*10);assert.ok(near.pan>0);assert.ok(remoteFootstepMix('run','wood',V(-2,0,0),listener).pan<0);listener.yaw=Math.PI;assert.ok(remoteFootstepMix('run','wood',V(2,0,0),listener).pan<0);
 assert.ok(remoteFootstepMix('run','carpet',V(2,0,0),listener).frequency<remoteFootstepMix('run','metal',V(2,0,0),listener).frequency);assert.equal(remoteFootstepMix('run','wood',V(40,0,0),listener).volume,0);
 const m={position:V(0,1.65,0),currentHeight:1.65,isWading:false},map={colliders:[Object.assign(new T.Box3(V(-2,-.2,-2),V(2,0,2)),{supportMesh:{userData:{physicalMaterial:'wood'}}})],rugSpecs:[]};assert.equal(footstepSurface(map,m),'wood');map.rugSpecs.push({x:0,y:0,z:0,w:2,d:2});assert.equal(footstepSurface(map,m),'carpet');m.isWading=true;assert.equal(footstepSurface(map,m),'water');
});

test('standing and blocked players emit no remote footfalls, walking emits authoritative position events',()=>{
 const events=[],w=new GameWorld('training',(type,data)=>events.push({type,data}));try{const p=w.addPlayer('a','a');for(let i=0;i<60;i++)w.step();assert.ok(!events.some(e=>e.type==='footstep'));for(let i=0;i<80;i++){w.enqueue(p,[{seq:i+1,keys:{forward:true},yaw:0,pitch:0,slot:'primary'}]);w.step();}const steps=events.filter(e=>e.type==='footstep');assert.ok(steps.length>=2);assert.ok(steps.every(e=>e.data.id==='a'&&e.data.position.length===3&&e.data.surface));}finally{w.dispose();}
});

test('distant replicated doors do not perform local-space collision transforms during prediction',()=>{
 const m=new MovementController(new T.PerspectiveCamera(),null,{input:false}),colliders=[];m.position.set(0,1.65,0);let transforms=0;
 for(let i=0;i<100;i++){const group=new T.Group();group.position.set(50+i,0,50);group.updateMatrixWorld(true);const convert=group.worldToLocal;group.worldToLocal=function(...args){transforms++;return convert.apply(this,args);};const b=new T.Box3(V(50+i,0,50),V(51+i,2.3,50.1));b.doorGroup=group;b.doorBounds=new T.Box3(V(0,0,-.05),V(1,2.3,.05));colliders.push(b);}
 for(let i=0;i<30;i++)m.update(1/60,colliders,[]);assert.equal(transforms,0);assert.ok(Math.abs(m.position.y-1.65)<.00001);
});
