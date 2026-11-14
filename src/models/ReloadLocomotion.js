import * as T from 'three';
const LOWER=/^(Hips|(Left|Right)(UpLeg|Leg|Foot|ToeBase|Toe_End))$/;
// A masked gait under the existing reload action. Source reload tracks are untouched.
export class ReloadLocomotion {
 constructor(animator){this.animator=animator;this.cache=new Map();this.phase=0;this.weight=0;this.active=false;}
 start(clip,time=0){const duration=this.animator.clips.get(clip)?.duration||1;this.phase=time/duration;this.clip=null;this.weight=0;this.presented=null;this.transition=null;}
 sampleClip(id){
  if(!this.cache.has(id)){
   const clip=this.animator.pack.clips.find(c=>c.id===id);
   if(!clip)return null;
   this.cache.set(id,{duration:clip.duration,travel:clip.sourceRootDelta,tracks:clip.tracks.filter(t=>LOWER.test(t.bone)&&this.animator.rig.bones[t.bone]).map(t=>({bone:this.animator.rig.bones[t.bone],name:t.bone,property:t.property,sample:new (t.property==='quaternion'?T.QuaternionKeyframeTrack:T.VectorKeyframeTrack)('gait',t.times,t.values).createInterpolant()}))});
  }
  return this.cache.get(id);
 }
 apply(delta,state,id){
  const a=this.animator,r=a.rig;
  if(a.current!=='reload'||state.isGrounded===false||state.isSliding){this.active=false;this.weight=0;return;}
  const moving=(state.speed||0)>.15,target=moving||state.isCrouching?1:0;
  this.weight=T.MathUtils.damp(this.weight,target,14,delta);
  if(this.weight<.0001){this.active=false;return;}
  const clip=this.sampleClip(id);if(!clip){this.active=false;return;}
  if(this.clip!==id){this.transition=this.presented?{from:this.presented,elapsed:0}:null;this.clip=id;}
  const travel=clip.travel,measured=travel?Math.hypot(travel[0],travel[2])*.01/clip.duration:0;
  const base=measured>.2?measured:/run/i.test(id)?3.1:1.05;
  if(moving)this.phase=(this.phase+delta*T.MathUtils.clamp(state.speed/base,.35,2.6)/clip.duration)%1;
  r.object.updateMatrixWorld(true);const spine=r.bones.Spine,upper=spine.getWorldQuaternion(new T.Quaternion());
  const t=this.transition?T.MathUtils.smoothstep(this.transition.elapsed,0,.18):1;
  for(const track of clip.tracks){
   const value=track.sample.evaluate(this.phase*clip.duration),bone=track.bone,from=this.transition?.from.get(bone);
   if(track.property==='quaternion'){
    const rotation=new T.Quaternion().fromArray(value);if(from)rotation.copy(from.rotation).slerp(new T.Quaternion().fromArray(value),t);
    bone.quaternion.slerp(rotation,this.weight);
   }else if(track.property==='position'&&track.name==='Hips'){
    const y=from?T.MathUtils.lerp(from.position.y,value[1],t):value[1];bone.position.y=T.MathUtils.lerp(bone.position.y,y,this.weight);
   }
  }
  r.object.updateMatrixWorld(true);r.setWorldRotation(spine,upper);r.object.updateMatrixWorld(true);
  this.presented=new Map(clip.tracks.map(({bone})=>[bone,{rotation:bone.quaternion.clone(),position:bone.position.clone()}]));
  if(this.transition){this.transition.elapsed+=delta;if(this.transition.elapsed>=.18)this.transition=null;}
  this.active=true;
 }
}
