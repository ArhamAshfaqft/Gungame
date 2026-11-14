import {resolveAnimationFit,mixFits,animationKey,sampleAnimationEdit} from './AnimationEdits.js';
import {inheritedViewEdit,sampleInheritedViewFit} from './ViewPoseInheritance.js';
export function viewPoseContext(weapon){
    if(weapon.studioPoseAction)return {clip:'view_'+weapon.studioPoseAction,time:weapon.studioPoseTime||0};
    const m=weapon.movement,lean=m.effectiveLean||0;
    const action=weapon.isReloading?'reload':weapon.switchTimer>0?'draw'
        :Math.abs(lean)>.05?(m.isCrouching?'crouchPeek':'peek')+(lean<0?'Left':'Right')
        :m.isSprinting?'sprint':m.isCrouching?'crouch':m.getSpeed()>.15?'walk'
        :weapon.fireActionRemaining>0?'fire':weapon.boltActive?'bolt':'idle';
    let time=(weapon.viewPoseTime||0)%1;
    if(action==='reload')time=(weapon.reloadProgress||0)*(weapon.reloadDuration||weapon.profile.reloadTime);
    if(action==='fire')time=Math.max(0,(weapon.profile.fireActionTime||.18)-weapon.fireActionRemaining);
    if(action==='draw')time=Math.max(0,.28-weapon.switchTimer);
    return {clip:'view_'+action,time};
}
export function editedViewPose(weapon,fallback){
    const library=weapon.poseLibrary,slot=weapon.activeSlot;let {clip,time}=viewPoseContext(weapon);
    const state=weapon.overrideFire?'fire':'hip';
    const aEdit=inheritedViewEdit(library,slot,clip,state);
    const bEdit=inheritedViewEdit(library,slot,clip,'aim');
    if(!aEdit&&!bEdit)return null;
    const a=sampleInheritedViewFit(library,slot,clip,state,time);
    const b=sampleInheritedViewFit(library,slot,clip,'aim',time);
    return mixFits(a,b,weapon.adsProgress||0);
}
export function editedThrowablePose(weapon,fallback){
    const slot=weapon.equipment?.held?.type||'frag';
    const state=weapon.studioPoseState||(weapon.utilityTimer>0?weapon.throwMode:weapon.pinProgress>0&&weapon.pinProgress<1?'pin':'hold');
    const action=weapon.studioPoseAction||(weapon.grenadeDrawRemaining>0?'draw':state==='hold'?'idle':state);
    const clip='view_'+action,library=weapon.poseLibrary;
    const time=weapon.studioPoseTime??(state==='pin'?(weapon.pinProgress||0)*.35:weapon.utilityTimer>0?(weapon.throwProgress||0)*.7:0);
    const exact=library.animationEdits?.[animationKey(slot,clip,state)],all=library.animationEdits?.[animationKey(slot,'view_all',state)];
    if(!exact&&!all)return null;
    return resolveAnimationFit({animationEdits:{[animationKey(slot,clip,state)]:exact||all}},slot,clip,state,time,fallback);
}
