import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyLibrary} from '../src/studio/PoseLibrary.js';
import {ensureAnimationEdit} from '../src/studio/AnimationEdits.js';
import {editedViewPose} from '../src/studio/ViewPoseEdits.js';
import {inheritedViewEdit} from '../src/studio/ViewPoseInheritance.js';

test('movement inherits saved idle grips and ADS placement, with explicit action overrides preserved',()=>{
    const l=emptyLibrary();
    for(const state of ['hip','fire','aim']){
        const e=ensureAnimationEdit(l,'pistol','view_idle',state,l.poses[`pistol:${state}`]);
        e.pose.Left.handRotation=[.1,.2,.3];e.pose.Right.fingers.Index=[.2,.3,.4];
        if(state==='aim')e.pose.weapon.position[1]=-.038;
    }
    const w={activeSlot:'pistol',poseLibrary:l,adsProgress:1,studioPoseAction:'walk',movement:{getSpeed:()=>0}};
    for(const action of ['idle','walk','crouch','sprint','fire','bolt','peekLeft','crouchPeekRight']){
        w.studioPoseAction=action;
        assert.deepEqual(editedViewPose(w),l.animationEdits['pistol|view_idle|aim'].pose,action);
        assert.equal(inheritedViewEdit(l,'pistol','view_'+action,'hip'),l.animationEdits['pistol|view_idle|hip']);
    }
    const walk=ensureAnimationEdit(l,'pistol','view_walk','aim',l.poses['pistol:aim']);
    walk.pose.weapon.position[1]=.012;
    w.studioPoseAction='walk';assert.equal(editedViewPose(w).weapon.position[1],.012);
    w.studioPoseAction='reload';assert.deepEqual(editedViewPose(w),l.animationEdits['pistol|view_idle|aim'].pose);
    w.studioPoseAction='draw';assert.equal(editedViewPose(w),null);
    assert.equal(inheritedViewEdit(l,'primary','view_walk','hip'),null);
});

test('sniper newer idle grips override stale all-action defaults and carry into ADS without moving the scope',()=>{
 const l=emptyLibrary();
 const old=ensureAnimationEdit(l,'primary','view_all','hip',l.poses['primary:hip']);
 old.pose.Right.position=[.1,0,0];
 const idle=ensureAnimationEdit(l,'primary','view_idle','hip',l.poses['primary:hip']);
 idle.pose.Right.position=[-.03,.045,-.067];idle.pose.Left.handRotation=[.1,.2,.3];
 const w={activeSlot:'primary',poseLibrary:l,adsProgress:0,studioPoseAction:'idle',movement:{getSpeed:()=>0}};
 const before=JSON.stringify(l);
 for(const action of ['idle','walk','sprint','crouch']){
  w.studioPoseAction=action;
  assert.deepEqual(editedViewPose(w).Right,idle.pose.Right,action);
  w.adsProgress=1;
  assert.deepEqual(editedViewPose(w).Right,idle.pose.Right,action+' ADS');
  assert.deepEqual(editedViewPose(w).weapon,l.poses['primary:aim'].weapon,'scope placement preserved');
  w.adsProgress=0;
 }
 assert.equal(JSON.stringify(l),before,'saved adjustments are never rewritten');
});
