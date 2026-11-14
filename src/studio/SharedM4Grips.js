import * as T from 'three';
import {applyFullBodyPose} from './FullBodyPoses.js';

// Add one weapon-specific grip correction to the unchanged sniper presentation.
export function offsetM4Grip(base, offset) {
    if(!offset)return base;
    const result=structuredClone(base);
    for(const field of ['position','shoulder','elbowTarget','rotation','shoulderRotation','elbowRotation','handRotation','thumbRotation']){
        const a=base[field]||[0,0,0],b=offset[field]||[0,0,0];
        if(field==='rotation'||field.endsWith('Rotation')){
            const q=new T.Quaternion().setFromEuler(new T.Euler(...a)).multiply(new T.Quaternion().setFromEuler(new T.Euler(...b)));
            const e=new T.Euler().setFromQuaternion(q);result[field]=[e.x,e.y,e.z];
        }else result[field]=a.map((v,i)=>v+b[i]);
    }
    for(const finger of Object.keys(base.fingers))result.fingers[finger]=base.fingers[finger].map((v,i)=>v+(offset.fingers?.[finger]?.[i]||0));
    if(offset.contact)result.contact=structuredClone(offset.contact);
    return result;
}
export function applySniperM4Pose(rig,library,slot='primary',amount=0,context=null){
    const fit=applyFullBodyPose(rig,library,'primary',amount,context);
    // Reload and other released-hand actions retain their original animation.
    if(/reload|throw|hit/i.test(context?.clip||''))return fit;
    const out={...fit,Left:offsetM4Grip(fit.Left,library.m4SharedGrips?.Left),Right:offsetM4Grip(fit.Right,library.m4SharedGrips?.Right)};
    rig.thirdPersonGrips={primary:out.Left};rig.thirdPersonRightGrips={primary:out.Right};
    return out;
}
