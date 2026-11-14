import * as T from 'three';
import {emptyLibrary,FINGERS} from './PoseLibrary.js';
import {fullBodyPose} from './FullBodyPoses.js';

export const GRIP_STEPS=['Frame the weapon','Trigger hand','Support hand','Aim & check','Try it & save'];
export function gripEditTarget(library,slot,stance,part,third=false){
 if(third)return fullBodyPose(library,slot,stance)[part];
 return library.poses[`${slot}:${stance}`][part];
}
export function nudgeGrip(target,field,axis,amount){
 const limit=['position','shoulder','elbowTarget'].includes(field)?.6:Math.PI;
 target[field][axis]=T.MathUtils.clamp(target[field][axis]+amount,-limit,limit);
}
export function setGripCurl(target,baseline,amount,{thumb=false,trigger=false,finger=null}={}){
 if(finger&&!FINGERS.includes(finger))throw Error('Unknown finger.');
 const names=finger?[finger]:thumb?['Thumb']:trigger?['Index']:FINGERS.filter(f=>f!=='Thumb'&&f!=='Index');
 for(const finger of names)for(let joint=0;joint<3;joint++)target.fingers[finger][joint]=T.MathUtils.clamp(baseline.fingers[finger][joint]+amount*(joint===1?1:.7),-1.6,1.6);
}
export function resetGripStep(library,slot,stance,part,third=false){
 const defaults=emptyLibrary();if(third&&defaults.weaponHolding?.[slot])defaults.weaponHolding[slot].enabled=!!library.weaponHolding?.[slot]?.enabled;const target=gripEditTarget(library,slot,stance,part,third),source=gripEditTarget(defaults,slot,stance,part,third);
 Object.assign(target,structuredClone(source));
}
export function copyHandFit(library,slot,stance,part){
 if(!['Left','Right'].includes(part))return;
 library.poses[`${slot}:${stance==='aim'?'hip':'aim'}`][part]=structuredClone(library.poses[`${slot}:${stance}`][part]);
}
// Sight anchors are expressed in weapon-group coordinates. Preserve the user's
// eye relief, while placing the sight line at the centre of the aiming camera.
export function sightAlignment(rear,front,baseAim,oldPosition=[0,0,0]){
 const direction=front.clone().sub(rear);if(direction.lengthSq()<1e-10)throw Error('Sight anchors overlap.');
 const q=new T.Quaternion().setFromUnitVectors(direction.normalize(),new T.Vector3(0,0,-1));
 const aligned=rear.clone().applyQuaternion(q),angles=new T.Euler().setFromQuaternion(q);
 return {position:[T.MathUtils.clamp(-aligned.x-baseAim[0],-.6,.6),T.MathUtils.clamp(-aligned.y-baseAim[1],-.6,.6),oldPosition[2]],rotation:[angles.x,angles.y,angles.z]};
}
