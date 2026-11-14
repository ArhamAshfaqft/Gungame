import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {GameWorld} from '../server/GameWorld.js';
import {SniperWeapon} from '../src/weapons/SniperWeapon.js';
import {WEAPONS} from '../src/weapons/WeaponProfiles.js';
import {renderedAim} from '../src/multiplayer/RenderedAim.js';
import {MovementController} from '../src/player/MovementController.js';

test('sniper sends the displayed aim before recoil, including elevated, lowered and rolled views',()=>{
 const events=[],world=new GameWorld('training',(kind,data)=>events.push({kind,data}));
 try{
  const p=world.addPlayer('shooter','Shooter'),target=world.addPlayer('target','Target');
  for(const elevation of [-.3,0,.3]){
   p.movement.position.set(-3,10,32);p.movement.velocity.set(0,0,0);p.movement.pitch=elevation;p.movement.yaw=-Math.PI/2;p.movement.isAiming=true;p.movement.update(0,world.map.colliders);
   p.camera.rotation.z=.2;
   const displayed=p.camera.getWorldDirection(new T.Vector3());let sent;
   const weapon={movement:p.movement,camera:p.camera,activeSlot:'primary',profile:WEAPONS.primary,magAmmo:5,canShoot:true,fireCooldown:0,fireRate:.85,fireActionRemaining:0,recoilPos:new T.Vector3(),recoilRot:new T.Euler(),isAiming:true,performRaycast(){sent=renderedAim(this.camera)}};
   SniperWeapon.prototype.shoot.call(weapon);
   assert.ok(Math.abs(p.movement.pitch-sent.pitch-.045)<1e-8,'recoil belongs to the following frame');
   const actual=new T.Vector3(0,0,-1).applyEuler(new T.Euler(sent.pitch,sent.yaw,0,'YXZ'));
   assert.ok(actual.distanceTo(displayed)<1e-8);
   // An actual authoritative ray hits the target head at the displayed centre.
   const point=p.camera.position.clone().addScaledVector(displayed,6);
   target.camera.position.copy(point);target.movement.position.copy(point);target.movement.currentHeight=1.65;target.hp=100;
   p.movement.yaw=sent.yaw;p.movement.pitch=sent.pitch;p.movement.isAiming=true;
   const original=Math.random;Math.random=()=>.5;try{world.fire(p)}finally{Math.random=original}
   assert.equal(target.hp,0,JSON.stringify({elevation,sent,point:point.toArray(),shot:events.at(-1)}));
  }
 }finally{world.dispose();}
});

for(const map of ['villa','training'])test(`${map} doors interpolate every frame, with authoritative collision and exact late joins`,()=>{
 const server=new GameWorld(map),client=new GameWorld(map);
 try{
  const door=map==='villa'?server.map.panels.find(p=>p.isDoor):server.room.door;
  const mesh=map==='villa'?door.mesh:server.room.doorMesh,id=mesh.userData.netWorldId;
  const other=client.sync.meshes.get(id),object=map==='villa'?other.userData.breakable.group:client.room.doorHinge;
  const before=object.quaternion.clone();
  if(map==='villa')door.toggle();else door.open=true;
  for(let i=0;i<6;i++){if(map==='villa')door.update(1/60);else server.room.update(1/60,new T.Vector3(99,1.65,99));}
  const entries=server.sync.collect(),entry=entries.find(e=>e.id===id);assert.ok(entry);
  if(map==='villa'){assert.ok(entry.panelMotion);assert.equal(entry.panel,undefined,'motion never repeats fracture ranges');assert.equal(entry.geometry,undefined);}
  client.sync.apply(entries,{interpolate:true});assert.ok(object.quaternion.angleTo(before)<1e-6,'packet arrival does not snap the visible hinge');
  const serverObject=map==='villa'?door.group:server.room.doorHinge,target=serverObject.quaternion.clone();
  const serverBoxes=server.map.colliders.filter(b=>b.supportMesh===mesh||b.villaPanel?.mesh===mesh),clientBoxes=client.map.colliders.filter(b=>b.supportMesh===other||b.villaPanel?.mesh===other);
  assert.deepEqual(clientBoxes.map(b=>[b.min.toArray(),b.max.toArray()]),serverBoxes.map(b=>[b.min.toArray(),b.max.toArray()]));
  if(clientBoxes[0]?.doorGroup)assert.notEqual(clientBoxes[0].doorGroup,object);
  if(map==='villa'){
   const source=serverBoxes[0],copy=clientBoxes[0],height=source.doorGroup.getWorldPosition(new T.Vector3()).y;
   const point=source.doorGroup.localToWorld(new T.Vector3(door.width/2,1.65,.02));
   const states=[source,copy].map(box=>{
    const movement=new MovementController(new T.PerspectiveCamera(),null,{input:false});movement.position.copy(point);movement.isGrounded=true;
    movement.velocity.set(0,0,-7).applyQuaternion(source.doorGroup.getWorldQuaternion(new T.Quaternion()));
    movement.resolveBoxCollision(box,height);return movement;
   });
   assert.ok(states[0].position.distanceTo(states[1].position)<1e-7,'server and smoothed client resolve the same door collision');
   assert.ok(states[0].velocity.distanceTo(states[1].velocity)<1e-7);
  }
  let last=object.quaternion.clone();
  for(let i=0;i<6;i++){client.sync.presentation.update(1/60);assert.ok(object.quaternion.angleTo(last)>1e-5,'each display frame advances');last.copy(object.quaternion);}
  assert.ok(object.quaternion.angleTo(target)<1e-6);
  client.sync.apply(server.sync.snapshot());assert.ok(object.quaternion.angleTo(target)<1e-6,'late join applies final state immediately');
  assert.equal(client.sync.presentation.motions.size,0);
 }finally{server.dispose();client.dispose();}
});

test('chase crosshair target resolves to the same point from the eye for authoritative fire',()=>{
 const camera=new T.PerspectiveCamera(70,1,.01,200);camera.position.set(.45,1.8,2);camera.lookAt(0,1.6,-8);camera.updateMatrixWorld(true);
 const target=new T.Mesh(new T.BoxGeometry(3,3,.2));target.position.set(0,1.6,-8);target.updateMatrixWorld(true);
 const ray=new T.Raycaster();ray.setFromCamera(new T.Vector2(),camera);const point=ray.intersectObject(target)[0].point;
 const eye=new T.Vector3(0,1.6,0),aim=renderedAim(camera,eye,[target],160);
 const direction=new T.Vector3(0,0,-1).applyEuler(new T.Euler(aim.pitch,aim.yaw,0,'YXZ'));
 assert.ok(new T.Ray(eye,direction).distanceToPoint(point)<1e-6);
});
