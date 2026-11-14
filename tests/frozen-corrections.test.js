import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyLibrary} from '../src/studio/PoseLibrary.js';
import {propagateFrozenBase} from '../src/studio/FrozenCorrections.js';
import {emptyPeekPose} from '../src/studio/PeekPoses.js';
import {ensureAnimationEdit} from '../src/studio/AnimationEdits.js';
import {fullBodyPose} from '../src/studio/FullBodyPoses.js';

test('whole-pose corrections update matching peek keys without accumulating during a slider drag',()=>{
    const before=emptyLibrary(),key='assault:crouch:right:aim',pose=emptyPeekPose();pose.Left.elbow[1]=-.05;
    before.peekTimelines[key]=[{time:.25,pose}];
    const after=structuredClone(before),context={slot:'assault',posture:'crouch',side:'right',state:'aim'};
    after.peekPoses[key].Left.elbow[1]=-.01;propagateFrozenBase(before,after,context);
    assert.ok(Math.abs(after.peekTimelines[key][0].pose.Left.elbow[1]+.06)<1e-9);
    after.peekPoses[key].Left.elbow[1]=-.02;propagateFrozenBase(before,after,context);
    assert.ok(Math.abs(after.peekTimelines[key][0].pose.Left.elbow[1]+.07)<1e-9);
    propagateFrozenBase(before,after,context);assert.ok(Math.abs(after.peekTimelines[key][0].pose.Left.elbow[1]+.07)<1e-9);
    assert.deepEqual(before.peekTimelines[key][0].pose,pose);
    assert.equal(after.peekPoses['assault:crouch:left:aim'].Left.elbow[1],0);
});
test('whole-animation correction preserves palm markers and independent frame edits',()=>{
    const before=emptyLibrary(),edit=ensureAnimationEdit(before,'assault','runBack','aim',fullBodyPose(before,'assault','aim'));
    edit.pose.Left.contact={weaponPoint:[.01,0,0],palmPoint:[0,4,1]};
    const frame=structuredClone(edit.pose);frame.Right.handRotation[0]=.1;edit.keyframes=[{time:.2,pose:frame}];
    const after=structuredClone(before),context={slot:'assault',clip:'runBack',state:'aim',side:null};
    after.animationEdits['assault|runBack|aim'].pose.weapon.position[1]=.03;
    propagateFrozenBase(before,after,context);
    const result=after.animationEdits['assault|runBack|aim'].keyframes[0].pose;
    assert.equal(result.weapon.position[1],.03);assert.equal(result.Right.handRotation[0],.1);
    assert.deepEqual(result.Left.contact,edit.pose.Left.contact);
});
