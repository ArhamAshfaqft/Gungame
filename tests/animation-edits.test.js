import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyLibrary,validateLibrary} from '../src/studio/PoseLibrary.js';
import {fullBodyPose,applyFullBodyPose} from '../src/studio/FullBodyPoses.js';
import {ensureAnimationEdit,sampleAnimationEdit,animationKey} from '../src/studio/AnimationEdits.js';
import {samplePeekPose,emptyPeekPose} from '../src/studio/PeekPoses.js';
import {editedViewPose,editedThrowablePose,viewPoseContext} from '../src/studio/ViewPoseEdits.js';

test('old saves inherit ready into firing while preserving manual poses and independent peek states',()=>{
    const old=emptyLibrary();delete old.animationEdits;delete old.thirdPersonFire;
    for(const slot of ['primary','pistol','assault'])delete old.poses[`${slot}:fire`];
    old.poses['assault:hip'].Right.position[1]=.04;
    old.thirdPerson.assault.position[1]=-.08;
    old.peekPoses['assault:crouch:left:hip'].Right.elbow[1]=-.04;
    delete old.peekPoses['assault:crouch:left:fire'];
    const before=JSON.stringify(old),library=validateLibrary(old);
    assert.equal(library.poses['assault:fire'].Right.position[1],.04);
    assert.equal(library.thirdPersonFire.assault.weapon.position[1],-.08);
    library.poses['assault:fire'].Right.position[1]=.1;
    assert.equal(library.poses['assault:hip'].Right.position[1],.04);
    assert.equal(library.peekPoses['assault:crouch:left:fire'].Right.elbow[1],-.04);
    assert.equal(JSON.stringify(old),before);
    assert.deepEqual(validateLibrary(library),library);
});
test('clip, state and weapon presets are independent; runtime samples matching firing, ADS and keyframes',()=>{
    const library=emptyLibrary(),fallback=fullBodyPose(library,'assault');
    const edit=ensureAnimationEdit(library,'assault','runBack','fire',fallback);
    edit.pose.Left.elbowTarget[1]=-.1;edit.pose.Right.thumbRotation[0]=.3;
    const end=structuredClone(edit.pose);end.weapon.position[1]=.1;end.body.Head.rotation[1]=.4;
    edit.keyframes=[{time:1,pose:end}];
    const sample=sampleAnimationEdit(edit,.5);
    assert.equal(sample.weapon.position[1],.05);assert.ok(Math.abs(sample.body.Head.rotation[1]-.2)<1e-9);
    const rig={};applyFullBodyPose(rig,library,'assault',0,{clip:'runBack',time:.5,isFiring:true});
    assert.equal(rig.thirdPersonPlacements.assault.position[1],.05);
    assert.equal(rig.thirdPersonGrips.assault.elbowTarget[1],-.1);
    applyFullBodyPose(rig,library,'assault',1,{clip:'runBack',time:.5,isFiring:true});
    assert.equal(rig.thirdPersonPlacements.assault.position[1],0);
    applyFullBodyPose(rig,library,'assault',0,{clip:'walkBack',time:.5,isFiring:true});
    assert.equal(rig.thirdPersonPlacements.assault.position[1],0);
    assert.equal(fullBodyPose(library,'primary').Left.elbowTarget[1],0);
    const clean=validateLibrary(library);assert.deepEqual(clean.animationEdits,library.animationEdits);
});
test('firing crouched peek selects its own settings and transitions into ADS',()=>{
    const library=emptyLibrary();library.peekPoses['assault:crouch:right:fire'].weapon.position[1]=.1;
    const firing=samplePeekPose(library.peekPoses,'assault',{isCrouching:true,lean:1,isFiring:true,adsProgress:0});
    assert.equal(firing.weapon.position[1],.1);
    assert.equal(samplePeekPose(library.peekPoses,'assault',{isCrouching:true,lean:1,isFiring:false}).weapon.position[1],0);
    assert.equal(samplePeekPose(library.peekPoses,'assault',{isCrouching:true,lean:1,isFiring:true,adsProgress:1}).weapon.position[1],0);
});
test('invalid timeline coordinates, duplicate times and unknown clip keys are rejected',()=>{
    const library=emptyLibrary(),edit=ensureAnimationEdit(library,'assault','idle','aim',fullBodyPose(library,'assault','aim'));
    edit.keyframes=[{time:.4,pose:structuredClone(edit.pose)},{time:.4,pose:structuredClone(edit.pose)}];
    assert.throws(()=>validateLibrary(library),/Duplicate/);
    edit.keyframes=[];edit.pose.Right.elbowRotation[0]=NaN;assert.throws(()=>validateLibrary(library),/coordinate/);
    edit.pose.Right.elbowRotation[0]=0;library.animationEdits[animationKey('assault','invalid|key','aim')]=edit;assert.throws(()=>validateLibrary(library),/selection/);
});

test('first-person reload and crouched-peek edits stay separate from full-body defaults and play in the matching state',()=>{
    const library=emptyLibrary(),fit=library.poses['assault:aim'];
    const edit=ensureAnimationEdit(library,'assault','view_reload','aim',fit);
    edit.pose.weapon.position[1]=-.1;
    const end=structuredClone(edit.pose);end.Right.elbow[1]=-.2;
    edit.keyframes=[{time:1,pose:end}];
    ensureAnimationEdit(library,'assault','*','aim',fullBodyPose(library,'assault','aim')).pose.weapon.position[1]=.4;
    const w={activeSlot:'assault',poseLibrary:library,adsProgress:1,overrideFire:false,isReloading:true,reloadProgress:.5,reloadDuration:1,profile:{reloadTime:1},movement:{getSpeed:()=>0}};
    const pose=editedViewPose(w,fit);assert.equal(pose.weapon.position[1],-.1);assert.equal(pose.Right.elbow[1],-.1);
    w.isReloading=false;assert.equal(editedViewPose(w,fit),null,'full-body wildcard cannot override first person');
    w.movement.isCrouching=true;w.movement.effectiveLean=-1;
    assert.equal(viewPoseContext(w).clip,'view_crouchPeekLeft');
    const clean=validateLibrary(library);assert.deepEqual(clean.animationEdits,library.animationEdits);
});
test('throwable first-person actions use their own animation entries',()=>{
    const library=emptyLibrary(),fit=library.poses['frag:pin'];
    ensureAnimationEdit(library,'frag','view_pin','pin',fit).pose.item.position[0]=.04;
    const w={poseLibrary:library,equipment:{held:{type:'frag'}},pinProgress:.5};
    assert.equal(editedThrowablePose(w,fit).item.position[0],.04);
    w.equipment.held.type='smoke';assert.equal(editedThrowablePose(w,fit),null);
    assert.deepEqual(validateLibrary(library).animationEdits,library.animationEdits);
});

test('frozen-moment peek corrections interpolate at the captured time and stay isolated by direction/state',()=>{
    const library=emptyLibrary(),pose=emptyPeekPose(),key='assault:crouch:right:aim';pose.Left.elbow[1]=-.1;
    library.peekTimelines[key]=[{time:.5,pose}];
    const sample=samplePeekPose(library.peekPoses,'assault',{lean:1,isCrouching:true,adsProgress:1,animationTime:.25},library.peekTimelines);
    assert.equal(sample.Left.elbow[1],-.05);
    assert.equal(samplePeekPose(library.peekPoses,'assault',{lean:-1,isCrouching:true,adsProgress:1,animationTime:.5},library.peekTimelines).Left.elbow[1],0);
    assert.equal(samplePeekPose(library.peekPoses,'assault',{lean:1,isCrouching:true,adsProgress:0,animationTime:.5},library.peekTimelines).Left.elbow[1],0);
    assert.deepEqual(validateLibrary(library),library);
    library.peekTimelines[key].push({time:.5,pose});assert.throws(()=>validateLibrary(library),/Duplicate peek/);
});
