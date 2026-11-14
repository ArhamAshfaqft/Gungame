import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {emptyLibrary,validateLibrary} from '../src/studio/PoseLibrary.js';
import {gripEditTarget,nudgeGrip,setGripCurl,resetGripStep,copyHandFit,sightAlignment} from '../src/studio/GripSetup.js';

test('guided hand edits stay isolated by weapon, hand, stance and view, with bounded moves',()=>{
 const library=emptyLibrary(),sniper=structuredClone(library.poses['primary:hip']),pistol=structuredClone(library.poses['pistol:aim']);
 const hand=gripEditTarget(library,'assault','hip','Right');nudgeGrip(hand,'position',1,.005);
 assert.deepEqual(hand.position,[0,.005,0]);assert.deepEqual(library.poses['assault:aim'].Right.position,[0,0,0]);assert.deepEqual(library.thirdPersonRightGrips.assault.position,[0,0,0]);
 nudgeGrip(hand,'position',0,10);assert.equal(hand.position[0],.6);
 const body=gripEditTarget(library,'assault','hip','Left',true);nudgeGrip(body,'position',2,-.01);assert.deepEqual(library.thirdPersonGrips.assault.position,[0,0,-.01]);
 assert.deepEqual(library.poses['primary:hip'],sniper);assert.deepEqual(library.poses['pistol:aim'],pistol);assert.doesNotThrow(()=>validateLibrary(library));
});

test('simple curls preserve individual finger corrections and do not accumulate while dragging',()=>{
 const target=emptyLibrary().poses['assault:hip'].Right;target.fingers.Middle=[.1,.2,.3];const base=structuredClone(target);
 setGripCurl(target,base,.2);const first=structuredClone(target.fingers);setGripCurl(target,base,.2);assert.deepEqual(target.fingers,first);
 assert.deepEqual(target.fingers.Index,[0,0,0]);assert.deepEqual(target.fingers.Thumb,[0,0,0]);assert.ok(target.fingers.Middle[1]>.2);
 setGripCurl(target,base,-.2,{thumb:true});assert.ok(target.fingers.Thumb[1]<0);assert.deepEqual(target.fingers.Middle,first.Middle);
 setGripCurl(target,base,.3,{trigger:true});assert.ok(target.fingers.Index[1]>0);assert.deepEqual(target.fingers.Middle,first.Middle);
});

test('copy and reset affect only the explicitly selected hand and preserve framing',()=>{
 const library=emptyLibrary();library.poses['assault:hip'].Right.position=[.1,.02,.03];library.poses['assault:aim'].weapon.position=[.01,.02,.03];library.poses['assault:aim'].Left.position=[.2,0,0];
 copyHandFit(library,'assault','hip','Right');assert.deepEqual(library.poses['assault:aim'].Right.position,[.1,.02,.03]);assert.notEqual(library.poses['assault:aim'].Right,library.poses['assault:hip'].Right);
 resetGripStep(library,'assault','aim','Right');assert.deepEqual(library.poses['assault:aim'].Right.position,[0,0,0]);assert.deepEqual(library.poses['assault:aim'].weapon.position,[.01,.02,.03]);assert.deepEqual(library.poses['assault:aim'].Left.position,[.2,0,0]);
});

test('one-click sight alignment centres both sights while retaining the existing eye-relief offset',()=>{
 const rear=new T.Vector3(.03,.13,-.02),front=new T.Vector3(.04,.14,-.5),base=[0,-.13,-.35],pose=sightAlignment(rear,front,base,[.02,.01,.08]);
 const q=new T.Quaternion().setFromEuler(new T.Euler(...pose.rotation)),offset=new T.Vector3().fromArray(base).add(new T.Vector3().fromArray(pose.position));
 for(const p of [rear,front]){const aligned=p.clone().applyQuaternion(q).add(offset);assert.ok(Math.abs(aligned.x)<1e-10&&Math.abs(aligned.y)<1e-10);}
 assert.equal(pose.position[2],.08);assert.throws(()=>sightAlignment(rear,rear,base),/overlap/);
});

test('every finger can be curled independently and arm targets remain bounded through save migration',()=>{
 const library=emptyLibrary(),hand=library.poses['assault:hip'].Right,base=structuredClone(hand);
 for(const finger of ['Thumb','Index','Middle','Ring','Pinky']){
  const target=structuredClone(base);setGripCurl(target,base,.3,{finger});
  for(const other of Object.keys(target.fingers))assert.equal(target.fingers[other].some(n=>n!==0),other===finger);
 }
 assert.throws(()=>setGripCurl(hand,base,.3,{finger:'Unknown'}),/Unknown/);
 nudgeGrip(hand,'elbowTarget',0,2);assert.equal(hand.elbowTarget[0],.6);nudgeGrip(hand,'shoulder',1,-2);assert.equal(hand.shoulder[1],-.6);
 library.thirdPersonGrips.assault.elbowTarget=[.1,.2,.3];library.thirdPersonGrips.assault.shoulderRotation=[.2,0,0];
 const saved=validateLibrary(library);assert.deepEqual(saved.poses['assault:hip'].Right.elbowTarget,hand.elbowTarget);assert.deepEqual(saved.thirdPersonGrips.assault.elbowTarget,[.1,.2,.3]);
 delete library.poses['assault:hip'].Right.elbowTarget;for(const field of ['shoulder','elbowTarget','shoulderRotation','elbowRotation'])delete library.thirdPersonGrips.assault[field];
 const old=validateLibrary(library);assert.deepEqual(old.poses['assault:hip'].Right.elbowTarget,[0,0,0]);assert.deepEqual(old.thirdPersonGrips.assault.shoulderRotation,[0,0,0]);
});
