import * as THREE from 'three';
export const PEEK_SLOTS=['primary','pistol','frag','flash','smoke'];
export const PEEK_BODY=['Spine','Spine1','Spine2','Neck','Head'];
export const PEEK_FINGERS=['Thumb','Index','Middle','Ring','Pinky'];
export const peekKey=(slot,posture,side,stance)=>`${slot}:${posture}:${side}:${stance}`;
const vec=()=>[0,0,0];
export function emptyPeekPose(){
 const hand=()=>({position:vec(),rotation:vec(),clavicleRotation:vec(),shoulderRotation:vec(),elbowRotation:vec(),handRotation:vec(),elbow:vec(),fingers:Object.fromEntries(PEEK_FINGERS.map(f=>[f,vec()]))});
 return {strength:1,body:Object.fromEntries(PEEK_BODY.map(b=>[b,vec()])),weapon:{position:vec(),rotation:vec()},Left:hand(),Right:hand()};
}
export function emptyPeekLibrary(){return Object.fromEntries(PEEK_SLOTS.flatMap(slot=>['stand','crouch'].flatMap(posture=>['left','right'].flatMap(side=>['hip','aim'].map(stance=>[peekKey(slot,posture,side,stance),emptyPeekPose()])))));}
export function validatePeekLibrary(input){
 const clean=emptyPeekLibrary();if(input==null)return clean;
 for(const [key,pose] of Object.entries(clean)){
  const source=input[key];if(!source)continue;
  if(!Number.isFinite(source.strength)||source.strength<0||source.strength>1.5)throw Error('Peek strength must be between 0 and 150%.');pose.strength=source.strength;
  function copy(target,from,path=''){
   for(const field of Object.keys(target)){
    if(Array.isArray(target[field])){const vector=from?.[field],limit=(field==='position'||field==='elbow')?.6:path==='fingers'?1.6:Math.PI;
     if(!Array.isArray(vector)||vector.length!==3||vector.some(n=>!Number.isFinite(n)||Math.abs(n)>limit))throw Error('Invalid peek pose coordinate.');target[field]=[...vector];
    }else copy(target[field],from?.[field],field);
   }
  }
  for(const part of ['body','weapon','Left','Right'])copy(pose[part],source[part],part);
 }return clean;
}
export function samplePeekPose(library,slot,state){
 const lean=Number.isFinite(state.lean)?THREE.MathUtils.clamp(state.lean,-1,1):0;
 if(!library||!lean||state.isGrounded===false||state.isSliding)return null;
 const posture=state.isCrouching?'crouch':'stand',side=lean<0?'left':'right';
 const a=library[peekKey(slot,posture,side,'hip')],b=library[peekKey(slot,posture,side,'aim')];if(!a||!b)return null;
 const t=THREE.MathUtils.clamp(state.adsProgress??(state.isAiming?1:0),0,1),weight=Math.abs(lean);
 const mix=(x,y)=>Array.isArray(x)?x.map((n,i)=>(n+(y[i]-n)*t)*weight):Object.fromEntries(Object.keys(x).map(k=>[k,mix(x[k],y[k])]));
 return {strength:a.strength+(b.strength-a.strength)*t,body:mix(a.body,b.body),weapon:mix(a.weapon,b.weapon),Left:mix(a.Left,b.Left),Right:mix(a.Right,b.Right)};
}
export function applyPeekHands(rig,model,peek){
 if(!peek)return;
 for(const side of ['Left','Right']){
  const pose=peek[side],hand=rig.bones[side+'Hand'],upper=rig.bones[side+'Arm'];
  const rotation=hand.getWorldQuaternion(new THREE.Quaternion()).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(...pose.rotation)));
  const target=hand.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3().fromArray(pose.position).applyQuaternion(model.getWorldQuaternion(new THREE.Quaternion())));
  const pole=rig.bones[side+'ForeArm'].getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3().fromArray(pose.elbow).applyQuaternion(rig.object.getWorldQuaternion(new THREE.Quaternion())));
  if(pose.position.some(n=>n!==0)||pose.elbow.some(n=>n!==0))rig.solveIK(upper,rig.bones[side+'ForeArm'],hand,target,pole);
  rig.setWorldRotation(hand,rotation);
  for(const [name,field] of [['Shoulder','clavicleRotation'],['Arm','shoulderRotation'],['ForeArm','elbowRotation'],['Hand','handRotation']])rig.bones[side+name]?.quaternion.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(...pose[field])));
  for(const [finger,angles] of Object.entries(pose.fingers))angles.forEach((angle,i)=>rig.rotate(`${side}Hand${finger}${i+1}`,angle));
  rig.bones[side+'Shoulder'].updateMatrixWorld(true);
 }
}
// Ready carry is a presentation layer, independent of the artist's saved ADS
// peek offsets. Rotate the pistol shoulder chain down instead of reusing aim idle.
export function applyPistolReady(rig,state={}){
 const weight=state.readyWeight??(state.isAiming?0:1-(state.adsProgress||0));
 if(weight<=0)return;
 rig.object.updateMatrixWorld(true);
 const axis=new THREE.Vector3(1,0,0).applyQuaternion(rig.object.getWorldQuaternion(new THREE.Quaternion()));
 const lower=new THREE.Quaternion().setFromAxisAngle(axis,weight*.6);
 for(const side of ['Right','Left']){
  const arm=rig.bones[side+'Arm'];rig.setWorldRotation(arm,lower.clone().multiply(arm.getWorldQuaternion(new THREE.Quaternion())));
 }
 rig.object.updateMatrixWorld(true);
}
