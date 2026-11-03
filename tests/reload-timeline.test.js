import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {defaultReloadSequence,validateReloadSequence,sampleReloadSequence,addTimelinePose,applySequenceMechanics} from '../src/studio/ReloadTimeline.js';
import {emptyLibrary,validateLibrary} from '../src/studio/PoseLibrary.js';
test('reload timelines migrate old libraries and preserve all saved holding poses',()=>{
 const library=emptyLibrary();library.poses['pistol:aim'].Right.handRotation=[.1,.2,.3];delete library.reloadSequence;
 const migrated=validateLibrary(library);assert.deepEqual(migrated.poses,library.poses);assert.deepEqual(migrated.reloadSequence,defaultReloadSequence());
 assert.deepEqual(validateLibrary(JSON.parse(JSON.stringify(migrated))),migrated);
});
test('timeline interpolation is continuous at keys and clamps endpoints',()=>{
 const seq=defaultReloadSequence();assert.deepEqual(sampleReloadSequence(seq,-1),seq.keys[0]);assert.deepEqual(sampleReloadSequence(seq,10),seq.keys.at(-1));
 for(const k of seq.keys.slice(1,-1)){const a=sampleReloadSequence(seq,k.time-1e-6),b=sampleReloadSequence(seq,k.time+1e-6);for(let i=0;i<3;i++)assert.ok(Math.abs(a.pose.Left.position[i]-b.pose.Left.position[i])<1e-5);}
 const base=emptyLibrary().poses['pistol:hip'];base.Right.position=[.1,0,0];const before=structuredClone(base);const offset=seq.keys[2].pose;const result=addTimelinePose(base,offset);assert.deepEqual(base,before);assert.equal(result.Right.position[0],.1);
});
test('timeline rejects missing ammo markers, duplicate times, NaN and missing endpoints',()=>{
 for(const mutate of [s=>s.events=[],s=>s.keys[1].time=0,s=>s.keys[0].pose.Left.position[0]=NaN,s=>s.keys.pop(),s=>s.duration=0]){const seq=defaultReloadSequence();mutate(seq);assert.throws(()=>validateReloadSequence(seq));}
});
test('magazine attachment follows wrist world position through scaled weapon parents and resets',()=>{
 const root=new THREE.Group(),model=new THREE.Group(),magazine=new THREE.Group(),slide=new THREE.Group(),hand=new THREE.Group();root.add(model,hand);model.scale.setScalar(1.2);hand.scale.setScalar(.01);model.add(magazine,slide);hand.position.set(.2,.3,.1);
 model.userData.reloadParts={magazine,magazineRest:new THREE.Vector3(),slide,slideRest:new THREE.Vector3()};const sample=defaultReloadSequence().keys[0];sample.magazine.attachment='leftHand';sample.magazine.handPosition=[.01,0,0];applySequenceMechanics(model,{object:root,bones:{LeftHand:hand}},sample);root.updateMatrixWorld(true);assert.ok(magazine.getWorldPosition(new THREE.Vector3()).distanceTo(new THREE.Vector3(.21,.3,.1))<1e-6);
 sample.magazine.attachment='weapon';applySequenceMechanics(model,null,sample);assert.ok(magazine.position.length()<1e-6);
});
