import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyLibrary,validateLibrary} from '../src/studio/PoseLibrary.js';

test('existing frag poses and animation timelines transfer once to both canisters, preserving firearms',()=>{
 const library=emptyLibrary();delete library.sharedThrowableAnimations;
 library.poses['frag:hold'].Right.position=[.02,.03,-.1];
 library.poses['frag:high'].Right.handRotation=[.1,.2,.3];
 library.thirdPerson.frag.position=[.01,.02,.03];
 const firearms=structuredClone(Object.fromEntries(Object.entries(library.poses).filter(([key])=>/^(primary|pistol|assault):/.test(key))));
 const result=validateLibrary(library);
 for(const slot of ['flash','smoke']){
  for(const state of ['hold','pin','high','low'])assert.deepEqual(result.poses[`${slot}:${state}`],result.poses[`frag:${state}`]);
  assert.deepEqual(result.thirdPerson[slot],result.thirdPerson.frag);
 }
 assert.deepEqual(Object.fromEntries(Object.entries(result.poses).filter(([key])=>/^(primary|pistol|assault):/.test(key))),firearms);
 result.poses['smoke:hold'].Right.position[0]=.12;
 assert.equal(validateLibrary(result).poses['smoke:hold'].Right.position[0],.12,'later Studio adjustments are retained');
 assert.equal(result.poses['frag:hold'].Right.position[0],.02,'copied poses do not share mutable references');
});
