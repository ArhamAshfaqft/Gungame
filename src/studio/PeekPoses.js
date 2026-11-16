import * as THREE from 'three';
export const PEEK_SLOTS=['primary','pistol','assault','frag','flash','smoke'];
export const PEEK_BODY=['Hips','Spine','Spine1','Spine2','Neck','Head','LeftUpLeg','RightUpLeg','LeftLeg','RightLeg','LeftFoot','RightFoot'];
export const PEEK_FINGERS=['Thumb','Index','Middle','Ring','Pinky'];
export const peekKey=(slot,posture,side,stance)=>`${slot}:${posture}:${side}:${stance}`;
const vec=()=>[0,0,0];
export function emptyPeekPose(){
 const hand=()=>({position:vec(),rotation:vec(),shoulder:vec(),thumbRotation:vec(),clavicleRotation:vec(),shoulderRotation:vec(),elbowRotation:vec(),handRotation:vec(),elbow:vec(),fingers:Object.fromEntries(PEEK_FINGERS.map(f=>[f,vec()]))});
 return {strength:1,body:Object.fromEntries(PEEK_BODY.map(b=>[b,vec()])),bodyPosition:Object.fromEntries(PEEK_BODY.map(b=>[b,vec()])),weapon:{position:vec(),rotation:vec()},Left:hand(),Right:hand()};
}
export function emptyPeekLibrary(){return Object.fromEntries(PEEK_SLOTS.flatMap(slot=>['stand','crouch'].flatMap(posture=>['left','right'].flatMap(side=>['hip','fire','aim'].map(stance=>[peekKey(slot,posture,side,stance),emptyPeekPose()])))));}
export function validatePeekLibrary(input){
 const clean=emptyPeekLibrary();if(input==null)return clean;
 for(const [key,pose] of Object.entries(clean)){
  const source=input[key]||(key.endsWith(':fire')?input[key.replace(':fire',':hip')]:null);if(!source)continue;
  if(!Number.isFinite(source.strength)||source.strength<0||source.strength>1.5)throw Error('Peek strength must be between 0 and 150%.');pose.strength=source.strength;
  function copy(target,from,path=''){
   for(const field of Object.keys(target)){
    if(Array.isArray(target[field])){const vector=from?.[field];if(vector===undefined)continue;const limit=(['position','elbow','shoulder'].includes(field)||path==='bodyPosition')?.6:path==='fingers'?1.6:Math.PI;
     if(!Array.isArray(vector)||vector.length!==3||vector.some(n=>!Number.isFinite(n)||Math.abs(n)>limit))throw Error('Invalid peek pose coordinate.');target[field]=[...vector];
    }else copy(target[field],from?.[field],field);
   }
  }
  for(const part of ['body','bodyPosition','weapon','Left','Right'])copy(pose[part],source[part],part);
 }return clean;
}
export function validatePeekTimelines(input){
 const out={};if(input==null)return out;
 if(typeof input!=='object'||Array.isArray(input)||Object.keys(input).length>144)throw Error('Invalid peek timelines.');
 const allowed=emptyPeekLibrary();
 for(const [key,frames] of Object.entries(input)){
  if(!allowed[key]||!Array.isArray(frames)||frames.length>240)throw Error('Invalid peek timeline.');
  out[key]=frames.map(frame=>{
   if(!Number.isFinite(frame.time)||frame.time<0||frame.time>300)throw Error('Invalid peek keyframe time.');
   return {time:frame.time,pose:validatePeekLibrary({[key]:frame.pose})[key]};
  }).sort((a,b)=>a.time-b.time);
  if(out[key].some((f,i)=>i&&f.time===out[key][i-1].time))throw Error('Duplicate peek keyframe.');
 }return out;
}
export function samplePeekKey(library,timelines,key,time=0){
 const base=library[key],keys=timelines?.[key];if(!keys?.length)return base;
 const frames=keys[0].time>0?[{time:0,pose:base},...keys]:keys;
 if(time<=frames[0].time)return frames[0].pose;
 for(let i=1;i<frames.length;i++)if(time<=frames[i].time){
  const t=(time-frames[i-1].time)/(frames[i].time-frames[i-1].time);
  const mix=(a,b)=>typeof a==='number'?a+(b-a)*t:Array.isArray(a)?a.map((n,j)=>n+(b[j]-n)*t):Object.fromEntries(Object.keys(a).map(k=>[k,mix(a[k],b[k])]));
  return mix(frames[i-1].pose,frames[i].pose);
 }return frames.at(-1).pose;
}
export function samplePeekPose(library,slot,state,timelines){
 const lean=Number.isFinite(state.lean)?THREE.MathUtils.clamp(state.lean,-1,1):0;
 if(!library||!lean||state.isGrounded===false||state.isSliding)return null;
 const posture=state.isCrouching?'crouch':'stand',side=lean<0?'left':'right';
 const a=samplePeekKey(library,timelines,peekKey(slot,posture,side,state.isFiring?'fire':'hip'),state.animationTime||0),b=samplePeekKey(library,timelines,peekKey(slot,posture,side,'aim'),state.animationTime||0);if(!a||!b)return null;
 const t=THREE.MathUtils.clamp(state.adsProgress??(state.isAiming?1:0),0,1),weight=Math.abs(lean);
 const mix=(x,y)=>Array.isArray(x)?x.map((n,i)=>(n+(y[i]-n)*t)*weight):Object.fromEntries(Object.keys(x).map(k=>[k,mix(x[k],y[k])]));
 return {strength:a.strength+(b.strength-a.strength)*t,body:mix(a.body,b.body),bodyPosition:mix(a.bodyPosition,b.bodyPosition),weapon:mix(a.weapon,b.weapon),Left:mix(a.Left,b.Left),Right:mix(a.Right,b.Right)};
}
export function applyPeekHands(rig,model,peek){
 if(!peek)return;
 for(const side of ['Left','Right']){
  const pose=peek[side],hand=rig.bones[side+'Hand'],upper=rig.bones[side+'Arm'];
  if(pose.shoulder?.some(n=>n!==0)){const delta=new THREE.Vector3().fromArray(pose.shoulder).applyQuaternion(rig.object.getWorldQuaternion(new THREE.Quaternion()));const desired=upper.getWorldPosition(new THREE.Vector3()).add(delta);upper.position.copy(upper.parent.worldToLocal(desired));upper.updateMatrixWorld(true);}
  const rotation=hand.getWorldQuaternion(new THREE.Quaternion()).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(...pose.rotation)));
  const target=hand.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3().fromArray(pose.position).applyQuaternion(model.getWorldQuaternion(new THREE.Quaternion())));
  const pole=rig.bones[side+'ForeArm'].getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3().fromArray(pose.elbow).applyQuaternion(rig.object.getWorldQuaternion(new THREE.Quaternion())));
  if(pose.position.some(n=>n!==0)||pose.elbow.some(n=>n!==0))rig.solveIK(upper,rig.bones[side+'ForeArm'],hand,target,pole);
  rig.setWorldRotation(hand,rotation);
  for(const [name,field] of [['Shoulder','clavicleRotation'],['Arm','shoulderRotation'],['ForeArm','elbowRotation'],['Hand','handRotation']])rig.bones[side+name]?.quaternion.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(...pose[field])));
  for(const [finger,angles] of Object.entries(pose.fingers))angles.forEach((angle,i)=>rig.rotate(`${side}Hand${finger}${i+1}`,angle));
  if(pose.thumbRotation)rig.bones[side+'HandThumb1'].quaternion.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(...pose.thumbRotation)));
  rig.bones[side+'Shoulder'].updateMatrixWorld(true);
 }
}
// The crouch clip supplies hips and legs. Its folded arm pose is unsuitable for
// leaning with a rifle, so blend toward the authored ready/aim upper-body poses.
export function applyCrouchedRiflePeek(rig,state={}){
 const postureAction=rig.refinedPeek&&/^rifle(StandToCrouch|CrouchToStand)$/.test(rig.animator?.current||'');
 let carry=state.isCrouching?1:0;
 if(postureAction){
  const action=rig.animator.actions.get(rig.animator.current),duration=rig.animator.clips.get(rig.animator.current).duration;
  const progress=THREE.MathUtils.smoothstep(action.time/duration,0,1);
  carry=rig.animator.current==='rifleStandToCrouch'?progress:1-progress;
 }
 if(rig.refinedPeek){
  if(!postureAction&&state.delta>0)carry=THREE.MathUtils.damp(rig.crouchCarryWeight??carry,carry,8,state.delta);
  if(carry<.001)carry=0;
  rig.crouchCarryWeight=carry;
 }
 if(rig.poseCrouchAssist===false||rig.animatedKind!=='rifle'||(!state.isCrouching&&!postureAction&&!(rig.refinedPeek&&carry>0))||state.isGrounded===false||state.isSliding||state.isReloading||(rig.refinedPeek&&state.isSprinting)||(rig.animator?.actionRemaining>0&&!postureAction))return false;
 // Single-player keeps one upper-body carry through stand/crouch changes.
 // Authored posture clips retain the pelvis, legs and height transition.
 const weight=rig.refinedPeek?carry:Math.min(1,Math.abs(state.lean||0));
 const aim=rig.animator?.holdingPoses?.rifle,ready=rig.animator?.holdingPoses?.rifleReady;
 if(!weight||!aim||!ready)return false;
 // The single-player correction shares an upright chest across crouch gaits.
 // Other controllers retain the existing strafe-only assistance.
 const torso=rig.refinedPeek?rig.animator.uprightPeekTorso:rig.animator.crouchPeekTorso;
 if((rig.refinedPeek||/^rifleCrouch(Left|Right)$/.test(rig.animator.current))&&torso){
  rig.object.updateMatrixWorld(true);
  const root=rig.object.getWorldQuaternion(new THREE.Quaternion());
  const torsoWeight=weight;
  const targets=new Map([...torso].map(([name,rotation])=>[name,rig.bones[name].getWorldQuaternion(new THREE.Quaternion()).slerp(root.clone().multiply(rotation),torsoWeight)]));
  for(const [name,target] of targets){rig.setWorldRotation(rig.bones[name],target);rig.bones[name].updateMatrixWorld(true);}
 }
 const ads=THREE.MathUtils.clamp(state.adsProgress??(state.isAiming?1:0),0,1);
 for(const [name,rotation] of aim){
  // Keep the authored crouched torso under its own pelvis. Standing local
  // spine rotations would arch it backward; only assist the carrying arms.
  if(!/^(Left|Right)(Shoulder|Arm|ForeArm|Hand)/.test(name))continue;
  const bone=rig.bones[name];if(!bone)continue;
  const target=(ready.get(name)||rotation).clone().slerp(rotation,ads);
  bone.quaternion.slerp(target,weight);
 }
 rig.object.updateMatrixWorld(true);
 return true;
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
