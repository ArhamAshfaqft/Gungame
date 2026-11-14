import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyLibrary,validateLibrary} from '../src/studio/PoseLibrary.js';
import {applyFullBodyPose} from '../src/studio/FullBodyPoses.js';
import {applySniperM4Pose} from '../src/studio/SharedM4Grips.js';

test('one saved M4 hand adjustment follows sniper holding states and clips without changing the source library',()=>{
 const library=emptyLibrary();library.m4SharedGrips.Left.position=[.02,-.01,.03];library.m4SharedGrips.Right.handRotation=[.1,0,0];
 const saved=validateLibrary(JSON.parse(JSON.stringify(library))),before=JSON.stringify(saved);
 for(const clip of ['idle','runBack','rifleCrouchIdle','rifleRunReady'])for(const amount of [0,.5,1])for(const isFiring of [false,true]){
  const context={clip,time:.2,isFiring},base=applyFullBodyPose({},saved,'primary',amount,context),rig={};
  const fit=applySniperM4Pose(rig,saved,'primary',amount,context);
  assert.deepEqual(fit.weapon,base.weapon);assert.deepEqual(fit.Left.position,[.02,-.01,.03]);assert.ok(Math.abs(fit.Right.handRotation[0]-.1)<1e-8);
  assert.equal(rig.thirdPersonGrips.primary,fit.Left);
 }
 assert.equal(JSON.stringify(saved),before);
});
test('M4 shared grips do not override released-hand reload poses',()=>{
 const library=emptyLibrary();library.m4SharedGrips.Left.position=[.1,0,0];
 const context={clip:'reload',time:.5};assert.deepEqual(applySniperM4Pose({},library,'primary',0,context),applyFullBodyPose({},library,'primary',0,context));
});
