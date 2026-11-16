import test from 'node:test';import assert from 'node:assert/strict';import * as T from 'three';
import {VillaMap} from '../src/world/VillaMap.js';import {MovementController} from '../src/player/MovementController.js';import {sweepSphere} from '../src/weapons/CombatQueries.js';import {soundEngine} from '../src/audio/SoundEngine.js';
soundEngine.playDoorOpen=()=>{};
const make=()=>new VillaMap(new T.Scene());

test('ordinary villa doors have domestic proportions and wide entrances use paired leaves',()=>{
 const m=make(),doors=m.panels.filter(p=>p.isDoor);assert.ok(doors.length>20);assert.ok(doors.every(p=>p.width<=1.45));assert.ok(doors.some(p=>p.partner));
 for(const d of doors.filter(p=>p.partner)){assert.equal(d.partner.partner,d);assert.equal(d.width,d.partner.width);}
});

test('a door pushes away from the actor on either side and paired doors open together',()=>{
 const m=make(),d=m.panels.find(p=>p.isDoor&&!p.partner),front=d.group.localToWorld(new T.Vector3(.5,1,1));
 d.toggle(front);d.update(2);assert.ok(d.group.rotation.y>d.baseRotation+1.5);
 d.toggle();d.update(2);const back=d.group.localToWorld(new T.Vector3(.5,1,-1));d.toggle(back);d.update(2);assert.ok(d.group.rotation.y<d.baseRotation-1.5);
 const pair=m.panels.find(p=>p.partner),actor=pair.group.localToWorld(new T.Vector3(.5,1,1));pair.toggle(actor);assert.ok(pair.open&&pair.partner.open);assert.equal(pair.swingSign*pair.partner.swingSign,-1);
});

test('player and grenade collision ignore empty corners of a rotated door enclosing box',()=>{
 const m=make(),d=m.panels.find(p=>p.partner);d.swingSign=1;d.open=true;d.openAmount=.48;d.group.rotation.y=d.baseRotation+.785;d.syncCollision();
 const box=d.collisionBoxes[0],local=new T.Vector3(d.width+.5,1.65,.6),position=d.group.localToWorld(local);
 const p=Object.create(MovementController.prototype);Object.assign(p,{position:position.clone(),velocity:new T.Vector3(),currentHeight:1.65,isGrounded:true});
 p.resolveBoxCollision(box,0);assert.ok(p.position.distanceTo(position)<1e-6);
 assert.equal(sweepSphere(position,position.clone().add(new T.Vector3(0,-.1,0)),.06,[box]),null);
});

test('pool surface is non-solid and its basin has real depth and an escape staircase',()=>{
 const m=make(),surface=m.waterAreas.find(a=>a.minZ<-20);assert.equal(surface.surface,3.4);assert.ok(m.rubbleFloor(new T.Vector3(-8,5,-21))<2.3);
 const water=[];m.scene.traverse(o=>{if(o.userData.water)water.push(o)});assert.ok(water.length>=2);assert.ok(water.every(o=>!o.userData.collider&&o.userData.isShootable),'water accepts impact rays while remaining non-solid');
 assert.ok(m.colliders.some(b=>b.min.x<-8&&b.max.x>-8&&Math.abs(b.max.y-3.2)<.01&&b.min.z<-17));
});

test('wellness pavilion has independent indoor and courtyard connections, kitchen has a service bypass',()=>{
 const m=make();assert.match(m.location(new T.Vector3(-18,5.05,-5)),/Wellness/);
 assert.ok(m.wallSpecs.some(w=>w.axis==='x'&&w.coord===-14&&w.base===3.4&&w.openings.some(o=>o.kind==='open'&&o.at===-5)));
 assert.ok(m.panels.some(p=>p.name==='Wellness courtyard door'));
 assert.ok(m.wallSpecs.some(w=>w.axis==='z'&&w.coord===-1.5&&w.base===3.4&&w.openings.some(o=>o.at===9.7)));
});

test('all villa seating faces its authored table or focal point',()=>{
 const m=make();assert.ok(m.seatingSpecs.length>20);
 for(const s of m.seatingSpecs){const forward=new T.Vector3(0,0,1).applyQuaternion(s.object.getWorldQuaternion(new T.Quaternion()));const towards=new T.Vector3(s.tx-s.x,0,s.tz-s.z).normalize();assert.ok(forward.dot(towards)>.999,`${s.type} at ${s.x},${s.z} faces away from its focal point`);}
});

test('top-floor stairwell lips are guarded and stair-side corridors have useful clearance',()=>{
 const m=make();for(const x of [0,11.5])assert.ok(m.colliders.some(b=>b.stairGuard&&b.min.y===6.8&&b.min.z<-1&&b.max.z> -1&&b.min.x<x&&b.max.x>x));
 assert.ok(m.wallSpecs.some(w=>w.axis==='x'&&w.coord===2.7));
 assert.ok(2.7-1.3>=1.39);assert.ok(14-12.55>=1.44);
 assert.ok(!m.wallSpecs.some(w=>w.axis==='x'&&w.coord===9&&w.base===3.4&&w.to===-4.7),'no pantry fin projects into the kitchen');
});


test('touching the kitchen bottle rack from either side cannot lift the player upstairs',()=>{
 const map=make();
 for(const side of [-1,1])for(const crouched of [false,true]){
  const p=new MovementController(new T.PerspectiveCamera(),null,{input:false});
  p.currentHeight=crouched?p.crouchHeight:p.standHeight;p.isCrouching=crouched;p.keys.crouch=crouched;
  p.position.set(side<0?8.9:11.5,3.4+p.currentHeight,-9.5);p.isGrounded=true;p.isLocked=true;p.keys[side<0?'left':'right']=true;
  const initialFeet=p.position.y-p.currentHeight;let highestFeet=initialFeet;
  for(let frame=0;frame<180;frame++){p.update(1/60,map.colliders);highestFeet=Math.max(highestFeet,p.position.y-p.currentHeight);}
  assert.ok(highestFeet<=initialFeet+.05,`rack lifted player by ${highestFeet-initialFeet}m from side ${side}`);
 }
});


test('both internal stairs reach every finished landing without jumping',()=>{
 const map=make();
 for(const base of [0,3.4])for(const x of [0,11.5])for(const crouched of [false,true]){
  const p=new MovementController(new T.PerspectiveCamera(),null,{input:false});p.currentHeight=crouched?p.crouchHeight:p.standHeight;p.isCrouching=crouched;
  p.position.set(x,base+p.currentHeight,-.5);p.yaw=0;p.isGrounded=true;p.keys.forward=true;
  for(let frame=0;frame<400&&p.position.z>-9;frame++)p.update(1/60,map.colliders);
  assert.ok(p.position.z<-9,`stair ${x} from ${base} snagged before the landing`);
  assert.ok(Math.abs(p.position.y-p.currentHeight-base-3.4)<.03,'feet reach the finished landing height');
 }
});


test('pool-side lawns have continuous raised ground up to the perimeter without filling the pool',()=>{
 const map=make();
 for(let x=-24.5;x<=30.5;x+=1)for(let z=-34.5;z<=-11.5;z+=1){
  if(x>=-11.75&&x<=-4.25&&z>=-23.25&&z<=-16.75)continue;
  assert.ok(map.colliders.some(b=>!b.ramp&&b.min.x<=x&&b.max.x>=x&&b.min.z<=z&&b.max.z>=z&&b.min.y<=0.01&&b.max.y>=3.15),`unsupported terrace foundation at ${x},${z}`);
 }
 assert.ok(!map.colliders.some(b=>b.containsPoint(new T.Vector3(-8,2.7,-20))),'pool basin remains open beneath the water');
 for(const x of [-23.5,29.8]){
  const p=new MovementController(new T.PerspectiveCamera(),null,{input:false});p.position.set(x,3.4+p.currentHeight,-27);p.yaw=0;p.isGrounded=true;p.keys.forward=true;
  for(let i=0;i<120;i++){p.update(1/60,map.colliders);assert.ok(p.position.y-p.currentHeight>=3.14,'walking beside the lawn cannot drop to the lower courtyard');}
 }
});
