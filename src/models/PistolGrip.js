import * as T from 'three';
import {measurePalm,palmWorldPosition} from './PalmGripFrames.js';

// Pistol contacts use the glove surface, not the wrist joint. This is scoped to
// first-person holding/firing; authored magazine/reload motion stays independent.
export function pistolGripFrame(rig,side){
 rig.pistolPalmFrames??={};
 if(rig.pistolPalmFrames[side])return rig.pistolPalmFrames[side];
 const sample=measurePalm(rig,side),normal=new T.Vector3(side==='Right'?-1:1,0,0);
 const along=new T.Vector3(0,side==='Right'?.12:.05,-1).normalize();
 const rotation=new T.Quaternion().setFromRotationMatrix(new T.Matrix4().makeBasis(along.clone().cross(normal).normalize(),along,normal)).multiply(sample.frame.clone().invert());
 return rig.pistolPalmFrames[side]={sample,rotation};
}
export function fitPistolPalm(rig,side,model,pole,rotation,offset=new T.Vector3()){
 const {sample}=pistolGripFrame(rig,side),hand=rig.bones[side+'Hand'];
 const contact=new T.Vector3(side==='Right'?.0175:-.044,-.038,side==='Right'?.016:.008);
 const point=model.localToWorld(contact).add(offset),wrist=point.clone().sub(sample.point.clone().multiply(hand.getWorldScale(new T.Vector3())).applyQuaternion(rotation));
 let error=0;
 for(let i=0;i<3;i++){
  rig.solveIK(rig.bones[side+'Arm'],rig.bones[side+'ForeArm'],hand,wrist,pole);
  rig.setWorldRotation(hand,rotation);rig.object.updateMatrixWorld(true);
  const residual=point.clone().sub(palmWorldPosition(sample));error=residual.length();if(error<.0007)break;wrist.add(residual);
 }
 return error;
}

export function orientPistolSleeve(rig,side,reference){
 const {sample}=pistolGripFrame(rig,side),hand=rig.bones[side+'Hand'],forearm=rig.bones[side+'ForeArm'];
 const rotation=forearm.getWorldQuaternion(new T.Quaternion()),axis=hand.getWorldPosition(new T.Vector3()).sub(forearm.getWorldPosition(new T.Vector3())).normalize();
 const dorsal=sample.normal.clone().negate().applyQuaternion(rig.rest.get(hand).quaternion).applyQuaternion(rotation);
 const up=new T.Vector3(0,1,0).applyQuaternion(reference.getWorldQuaternion(new T.Quaternion()));
 const project=v=>v.addScaledVector(axis,-v.dot(axis)).normalize();project(dorsal);project(up);
 const angle=Math.atan2(axis.dot(dorsal.clone().cross(up)),T.MathUtils.clamp(dorsal.dot(up),-1,1));
 rotation.premultiply(new T.Quaternion().setFromAxisAngle(axis,angle));
 const upper=rig.bones[side+'Arm'],upperRotation=upper.getWorldQuaternion(new T.Quaternion());
 const upperAxis=forearm.getWorldPosition(new T.Vector3()).sub(upper.getWorldPosition(new T.Vector3())).normalize();
 const desired=rotation.clone().multiply(rig.rest.get(forearm).quaternion.clone().invert());
 const flatten=v=>v.addScaledVector(upperAxis,-v.dot(upperAxis)).normalize();
 const from=flatten(new T.Vector3(0,0,1).applyQuaternion(upperRotation)),to=flatten(new T.Vector3(0,0,1).applyQuaternion(desired));
 const roll=Math.atan2(upperAxis.dot(from.clone().cross(to)),T.MathUtils.clamp(from.dot(to),-1,1));
 upperRotation.premultiply(new T.Quaternion().setFromAxisAngle(upperAxis,roll));rig.setWorldRotation(upper,upperRotation);rig.setWorldRotation(forearm,rotation);
}
