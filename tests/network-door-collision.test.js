import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {MovementController} from '../src/player/MovementController.js';

test('a swinging fractured door cannot ratchet the capsule up its low pieces',()=>{
 for(const floor of [0,3.4,6.8])for(const height of [1.65,1.0]){
  const p=new MovementController(new T.PerspectiveCamera(),null,{input:false});p.currentHeight=height;p.isGrounded=true;
  for(let frame=0;frame<100;frame++){
   const group=new T.Group();group.position.y=floor;group.rotation.y=Math.sin(frame*.21)*1.5;group.updateMatrixWorld(true);
   p.position.copy(group.localToWorld(new T.Vector3(.5,height,.02)));p.velocity.set(0,-.1,0);
   // The first cell is low enough to trigger the ordinary stair step rule.
   for(const top of [.28,.6,1,1.5,2.3]){
    const box=new T.Box3();box.doorGroup=group;box.doorBounds=new T.Box3(new T.Vector3(0,top-.28,-.09),new T.Vector3(1,top,.09));
    p.resolveBoxCollision(box,floor);
    assert.ok(Math.abs(p.position.y-(floor+height))<1e-7,'hinged collision is horizontal only');
   }
  }
 }
});

test('replicated matrix-only doors never lift a running player onto the door top',()=>{
 for(const floor of [3.7,7.4,0])for(const angle of [0,.3,.8,1.5,-1.2]){
  const group=new T.Group();group.matrixAutoUpdate=false;
  group.matrix.compose(new T.Vector3(2,floor,-4),new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),angle),new T.Vector3(1,1,1));group.updateMatrixWorld(true);
  const box=new T.Box3();box.doorGroup=group;box.doorBounds=new T.Box3(new T.Vector3(0,0,-.09),new T.Vector3(1,2.4,.09));
  const p=new MovementController(new T.PerspectiveCamera(),null,{input:false});p.isGrounded=true;
  p.position.copy(group.localToWorld(new T.Vector3(.5,p.currentHeight,.02)));
  p.velocity.set(0,0,-7).applyAxisAngle(new T.Vector3(0,1,0),angle);
  p.resolveBoxCollision(box,floor);
  assert.ok(Math.abs(p.position.y-floor-p.currentHeight)<1e-7,`floor ${floor}, swing ${angle}: door collision lifted player to ${p.position.y}`);
  const local=group.worldToLocal(p.position.clone());assert.ok(Math.abs(local.z)>=.5399,'push sideways out of the leaf');
  const velocity=p.velocity.clone().applyAxisAngle(new T.Vector3(0,1,0),-angle);assert.ok(Math.abs(velocity.z)<1e-7,'remove velocity into the leaf in its actual rotated frame');
 }
});

test('parented door collision uses world height and rotation instead of local fields',()=>{
 const parent=new T.Group(),group=new T.Group();parent.position.set(5,7.4,8);parent.rotation.y=.7;group.position.set(1,0,2);group.rotation.y=-.3;parent.add(group);parent.updateMatrixWorld(true);
 const box=new T.Box3();box.doorGroup=group;box.doorBounds=new T.Box3(new T.Vector3(0,0,-.09),new T.Vector3(1,2.4,.09));
 const p=new MovementController(new T.PerspectiveCamera(),null,{input:false});p.isGrounded=true;p.position.copy(group.localToWorld(new T.Vector3(.5,p.currentHeight,.02)));
 const rotation=group.getWorldQuaternion(new T.Quaternion());p.velocity.set(0,0,-7).applyQuaternion(rotation);
 p.resolveBoxCollision(box,7.4);assert.ok(Math.abs(p.position.y-7.4-p.currentHeight)<1e-7);
 assert.ok(Math.abs(p.velocity.clone().applyQuaternion(rotation.invert()).z)<1e-7);
});


test('low fallen door remnants can be stepped over without disabling tall debris collision',()=>{
 for(const floor of [0,3.4,6.8])for(const height of [1.65,1.05])for(const detached of [false,true]){
  const p=new MovementController(new T.PerspectiveCamera(),null,{input:false});p.currentHeight=height;p.position.set(0,floor+height,0);p.velocity.set(0,-.01,-2);p.isGrounded=true;
  const box=new T.Box3(new T.Vector3(-.6,floor,-.4),new T.Vector3(.6,floor+.12,.4));
  box.supportMesh={userData:{breakable:{isDoor:true,detachedEnvironment:detached}}};
  p.resolveBoxCollision(box,floor);
  if(detached){assert.ok(Math.abs(p.position.y-floor-height-.12)<1e-7);assert.equal(p.position.z,0,'step over the fallen leaf instead of being pushed out');}
  else{assert.equal(p.position.y,floor+height);assert.ok(Math.abs(p.position.z)>=.849,'attached door remnants stay blocking');}
 }
 const p=new MovementController(new T.PerspectiveCamera(),null,{input:false});p.position.set(0,1.65,0);p.isGrounded=true;
 const tall=new T.Box3(new T.Vector3(-.6,0,-.4),new T.Vector3(.6,.9,.4));tall.supportMesh={userData:{breakable:{isDoor:true,detachedEnvironment:true}}};
 p.resolveBoxCollision(tall,0);assert.equal(p.position.y,1.65);assert.ok(Math.abs(p.position.z)>=.849,'large upright remnants cannot be climbed as a low step');
});
