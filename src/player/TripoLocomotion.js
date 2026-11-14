import * as T from 'three';
const LOWER=/^(Hips|(Left|Right)(UpLeg|Leg|Foot|ToeBase|Toe_End))$/;
const LEG=/^(Left|Right)(UpLeg|Leg|Foot|ToeBase|Toe_End)$/;
const q=()=>new T.Quaternion();
function rootRotation(bone,root,rotations){
 const chain=[];for(let b=bone;b&&b!==root;b=b.parent)chain.unshift(b);
 return chain.reduce((r,b)=>r.multiply(rotations.get(b)||b.quaternion),q()).normalize();
}
export function directionalLegClip(local,speed){
 const forward=local.z,lateral=local.x,run=speed>2.2;
 if(Math.abs(lateral)>Math.abs(forward)*.35&&Math.abs(lateral)<Math.abs(forward)*2.8)return `rifleRun${forward<0?'Backward':'Forward'}${lateral<0?'Left':'Right'}`;
 if(Math.abs(lateral)>Math.abs(forward))return `strafe${run?'Run':''}${lateral<0?'Left':'Right'}`;
 return forward<0?(run?'runBack':'walkBack'):(run?'run':'walk');
}
export class TripoLocomotion{
 constructor(root,model,run,source){
  this.root=root;this.source=source;this.run=run;this.saved=new Map();this.directionWeight=0;
  this.bones=Object.fromEntries(model.getObjectsByProperty('isBone',true).map(b=>[b.name.replace(/^mixamorig[:_]?/,''),b]));
  const namesByTrack=new Map(model.getObjectsByProperty('isBone',true).map(b=>[b.name,b]));
  this.samples=run.getClip().tracks.flatMap(track=>{const dot=track.name.lastIndexOf('.'),bone=namesByTrack.get(track.name.slice(0,dot)),property=track.name.slice(dot+1),name=bone?.name.replace(/^mixamorig[:_]?/,'');return bone&&LOWER.test(name)?[{bone,property,sample:track.createInterpolant()}]:[];});
  this.neutralTarget=new Map();root.updateMatrixWorld(true);const inverse=root.getWorldQuaternion(q()).invert();
  for(const [name,bone] of Object.entries(this.bones))if(LEG.test(name))this.neutralTarget.set(name,inverse.clone().multiply(bone.getWorldQuaternion(q())));
  const reference=new Map([...source.rest].map(([bone,p])=>[bone,p.quaternion.clone()]));
  for(const track of source.animator.pack.clips.find(c=>c.id==='idle').tracks)if(track.property==='quaternion'&&source.bones[track.bone])reference.set(source.bones[track.bone],new T.QuaternionKeyframeTrack('reference',track.times,track.values).createInterpolant().evaluate(0).slice());
  for(const [bone,value] of reference)if(!(value instanceof T.Quaternion))reference.set(bone,new T.Quaternion().fromArray(value));
  this.directionClips=new Map(source.animator.pack.clips.map(clip=>[clip.id,{duration:clip.duration,tracks:clip.tracks.filter(t=>LOWER.test(t.bone)&&t.property==='quaternion'&&source.bones[t.bone]).map(t=>({bone:source.bones[t.bone],sample:new T.QuaternionKeyframeTrack('leg',t.times,t.values).createInterpolant()}))}]));
  this.neutralSource=new Map([...this.neutralTarget.keys()].filter(name=>source.bones[name]).map(name=>[name,rootRotation(source.bones[name],source.object,reference)]));
 }
 restore(){for(const [bone,p] of this.saved){bone.position.copy(p.position);bone.quaternion.copy(p.rotation);}this.saved.clear();}
 apply(delta,{speed,velocity,peekWeight,weight}){
  if(weight<.0001)return;
  const spine=this.bones.Spine;this.root.updateMatrixWorld(true);const spineWorld=spine.getWorldQuaternion(q());
  for(const {bone} of this.samples)if(!this.saved.has(bone))this.saved.set(bone,{position:bone.position.clone(),rotation:bone.quaternion.clone()});
  this.saved.set(spine,{position:spine.position.clone(),rotation:spine.quaternion.clone()});
  // While peeking, continue the imported gait below the waist. At rest the held
  // peek retains its own stance. Track interpolation does not rewrite the clip.
  const lowerWeight=weight*peekWeight;
  for(const {bone,property,sample} of this.samples){
   const values=sample.evaluate(this.run.time);
   if(property==='quaternion')bone.quaternion.slerp(q().fromArray(values),lowerWeight);
   else if(property==='position')bone.position.lerp(new T.Vector3().fromArray(values),lowerWeight);
  }
  this.root.updateMatrixWorld(true);
  const local=velocity.clone().applyQuaternion(this.root.getWorldQuaternion(q()).invert());
  const angle=Math.atan2(local.x,local.z),directional=T.MathUtils.smoothstep(Math.abs(angle),.25,.65);
  this.directionWeight=T.MathUtils.damp(this.directionWeight,directional,12,delta);this.angle=angle;
  // Directional leg clips already used by the recovered soldier. Transfer their
  // root-relative rotation deltas parent-first; do not transfer arms or torso.
  const posed=new Map([...this.source.animator.presentedPose||[]].map(([bone,p])=>[bone,p.rotation]));
  this.clip=directionalLegClip(local,speed);const directionalClip=this.directionClips.get(this.clip);
  if(directionalClip){const phase=this.run.time/this.run.getClip().duration;for(const track of directionalClip.tracks)posed.set(track.bone,q().fromArray(track.sample.evaluate(phase*directionalClip.duration)));}
  const legs=Object.keys(this.bones).filter(name=>this.neutralSource.has(name)).sort((a,b)=>{const depth=n=>{let count=0;for(let p=this.bones[n];p;p=p.parent)count++;return count;};return depth(a)-depth(b);});
  const rootRotationWorld=this.root.getWorldQuaternion(q());
  for(const name of legs){
   const bone=this.bones[name],from=rootRotation(this.source.bones[name],this.source.object,posed);
   const desired=rootRotationWorld.clone().multiply(from.multiply(this.neutralSource.get(name).clone().invert()).multiply(this.neutralTarget.get(name)));
   const current=bone.getWorldQuaternion(q());current.slerp(desired,this.directionWeight*weight);
   bone.quaternion.copy(bone.parent.getWorldQuaternion(q()).invert().multiply(current));bone.updateMatrixWorld(true);
  }
  // Keep the approved upper-body peek orientation as the hips follow the gait.
  if(lowerWeight>0){spine.quaternion.copy(spine.parent.getWorldQuaternion(q()).invert().multiply(spineWorld));spine.updateMatrixWorld(true);}
 }
}
