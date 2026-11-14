import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyLibrary} from '../src/studio/PoseLibrary.js';
import {ensureAnimationEdit} from '../src/studio/AnimationEdits.js';
import {copyHandGripsToStates} from '../src/studio/CopyHandGrips.js';

test('copies both complete grips across states without replacing placements or timelines',()=>{
    const l=emptyLibrary(),source=structuredClone(l.poses['pistol:hip']);
    source.Left.handRotation=[.1,.2,.3];source.Right.fingers.Index=[.2,.3,.4];
    source.Left.position=[.024,-.001,.041];
    const aim=ensureAnimationEdit(l,'pistol','view_idle','aim',l.poses['pistol:aim']);
    aim.pose.weapon.position=[.1,.02,.03];aim.supportIK=false;
    aim.keyframes=[{time:1,pose:structuredClone(aim.pose)}];
    const before=structuredClone(l),timeline=structuredClone(aim.keyframes);
    copyHandGripsToStates(l,'pistol','view_idle',source,['hip','fire','aim']);
    for(const state of ['hip','fire','aim'])for(const side of ['Left','Right'])assert.deepEqual(l.animationEdits[`pistol|view_idle|${state}`].pose[side],source[side]);
    assert.deepEqual(aim.pose.weapon,before.animationEdits['pistol|view_idle|aim'].pose.weapon);
    assert.deepEqual(aim.keyframes,timeline);assert.equal(aim.supportIK,false);
    assert.deepEqual(l.poses,before.poses);assert.deepEqual(l.reloadTimelines,before.reloadTimelines);
    l.animationEdits['pistol|view_idle|aim'].pose.Left.position[0]=.5;
    assert.equal(l.animationEdits['pistol|view_idle|hip'].pose.Left.position[0],.024);
    assert.equal(source.Left.position[0],.024);
});
