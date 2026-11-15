import {dirtyShadowRegion} from '../environment/ShadowCache.js';

// Rendering-only interpolation: authoritative collision boxes are applied by
// WorldSync immediately and never point at these presentation transforms.
export class WorldPresentation{
 constructor(shadows){this.shadows=shadows;this.motions=new Map();}
 capture(object){return {position:object.position.clone(),quaternion:object.quaternion.clone(),scale:object.scale.clone()};}
 retarget(object,mesh,from,duration=.1){
  const to=this.capture(object);this.motions.set(object,{object,mesh,from,to,time:0,duration});
  this.apply(object,from);object.updateMatrixWorld(true);
 }
 cancel(object){this.motions.delete(object);}
 apply(object,state){object.position.copy(state.position);object.quaternion.copy(state.quaternion);object.scale.copy(state.scale);}
 update(delta){
  for(const [object,motion] of this.motions){
   dirtyShadowRegion(this.shadows,motion.mesh);
   motion.time=Math.min(motion.duration,motion.time+Math.max(0,delta));const t=motion.time/motion.duration;
   object.position.lerpVectors(motion.from.position,motion.to.position,t);
   object.quaternion.slerpQuaternions(motion.from.quaternion,motion.to.quaternion,t);
   object.scale.lerpVectors(motion.from.scale,motion.to.scale,t);object.updateMatrixWorld(true);motion.mesh.userData.motionBatch?.syncTree(motion.mesh);
   dirtyShadowRegion(this.shadows,motion.mesh);
   if(t===1)this.motions.delete(object);
  }
 }
}
