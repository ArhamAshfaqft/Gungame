import {resolveAnimationFit,mixFits} from './AnimationEdits.js';
import * as T from 'three';

// Legacy maps remain the ready pose, preserving older presets and integrations.
export function fullBodyPose(library, slot, stance = 'hip', legacy = false) {
    if (stance === 'fire' && library.thirdPersonFire?.[slot]) return library.thirdPersonFire[slot];
    if (stance === 'aim' && library.thirdPersonAim?.[slot]) return library.thirdPersonAim[slot];
    return {weapon:library.thirdPerson[slot],Left:library.thirdPersonGrips[slot],Right:library.thirdPersonRightGrips[slot]};
}
function vector(a,b,t,rotation=false) {
    if (!rotation) return a.map((n,i)=>n+(b[i]-n)*t);
    const q=new T.Quaternion().setFromEuler(new T.Euler(...a)).slerp(new T.Quaternion().setFromEuler(new T.Euler(...b)),t);
    const e=new T.Euler().setFromQuaternion(q);return[e.x,e.y,e.z];
}
function contact(a,b,t) {
    if(a&&b)return{weaponPoint:vector(a.weaponPoint,b.weaponPoint,t),palmPoint:vector(a.palmPoint,b.palmPoint,t)};
    if(a)return{...a,weight:1-t};if(b)return{...b,weight:t};return null;
}
export function blendFullBodyPose(library,slot,amount=0,legacy=false) {
    const t=T.MathUtils.clamp(amount,0,1),a=fullBodyPose(library,slot,'hip',legacy),b=fullBodyPose(library,slot,'aim',legacy);
    if(t===0)return a;if(t===1)return b;
    const out={};
    for(const part of ['weapon','Left','Right']){
        const hand={};out[part]=hand;
        for(const field of ['position','rotation'])hand[field]=vector(a[part][field],b[part][field],t,field==='rotation');
        if(part==='weapon')continue;
        for(const field of ['shoulder','elbowTarget','shoulderRotation','elbowRotation','handRotation','thumbRotation'])hand[field]=vector(a[part][field]||[0,0,0],b[part][field]||[0,0,0],t,field.endsWith('Rotation'));
        hand.fingers=Object.fromEntries(Object.keys(a[part].fingers).map(f=>[f,vector(a[part].fingers[f],b[part].fingers[f],t)]));
        hand.contact=contact(a[part].contact,b[part].contact,t);
    }
    return out;
}
export function applyFullBodyPose(rig,library,slot,amount=0,context=null) {
    let fit=blendFullBodyPose(library,slot,amount);
    const readyState=context?.isFiring?'fire':(context?.state||'hip');
    const edits=library.animationEdits,clip=context?.clip||'idle';
    const hasEdits=context&&(edits?.[`${slot}|${clip}|${readyState}`]||edits?.[`${slot}|${clip}|aim`]||edits?.[`${slot}|*|${readyState}`]||edits?.[`${slot}|*|aim`]);
    if(context?.isFiring&&!hasEdits)fit=mixFits(fullBodyPose(library,slot,'fire'),fullBodyPose(library,slot,'aim'),amount);
    if(hasEdits){
        const a=resolveAnimationFit(library,slot,context.clip||'idle',readyState,context.time||0,fullBodyPose(library,slot,readyState));
        const b=resolveAnimationFit(library,slot,context.clip||'idle','aim',context.time||0,fullBodyPose(library,slot,'aim'));
        fit=mixFits(a,b,amount);
        fit.pinTrigger=(amount>.5?b:a).pinTrigger;
        fit.supportIK=(amount>.5?b:a).supportIK;fit.crouchAssist=(amount>.5?b:a).crouchAssist;
    }
    rig.pinTriggerToWeapon=fit.pinTrigger;rig.thirdPersonBody=fit.body;rig.poseSupportIK=fit.supportIK;rig.poseCrouchAssist=fit.crouchAssist;
    rig.thirdPersonPlacements={[slot]:fit.weapon};rig.thirdPersonGrips={[slot]:fit.Left};rig.thirdPersonRightGrips={[slot]:fit.Right};
    return fit;
}
