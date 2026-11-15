import * as T from 'three';
import {ShooterAnimator} from '../models/ShooterAnimator.js';

// Experimental controller, imported exclusively by animation-preview.html.
// The game's local and network character controllers never construct this class.
const WALK=['walk','strafeRight','walkBack','strafeLeft'];
const RUN=['run','rifleRunForwardRight','strafeRunRight','rifleRunBackwardRight','runBack','rifleRunBackwardLeft','strafeRunLeft','rifleRunForwardLeft'];
function directionWeights(ids,forward,lateral){
 const angle=((Math.atan2(lateral,forward)+Math.PI*2)%(Math.PI*2))/(Math.PI*2)*ids.length;
 const i=Math.floor(angle),t=angle-i;
 return [[ids[i],1-t],[ids[(i+1)%ids.length],t]];
}
export function locomotionWeights({speed=0,forward=1,lateral=0}={}){
 const move=T.MathUtils.smoothstep(speed,.03,.9),run=T.MathUtils.smoothstep(speed,1.3,3.6),weights=new Map([['rifleReadyIdle',1-move]]);
 for(const [ids,amount] of [[WALK,move*(1-run)],[RUN,move*run]])for(const [id,w] of directionWeights(ids,forward,lateral))weights.set(id,(weights.get(id)||0)+w*amount);
 return weights;
}
export class PreviewAnimator extends ShooterAnimator{
 constructor(rig,pack){
  super(rig,pack);this.phase=0;this.weights=new Map([['rifleReadyIdle',1]]);this.offsets=new Map();this.oneShot=null;this.wasMoving=false;this.ran=false;
  for(const id of new Set([...WALK,...RUN]))if(this.clips.has(id))this.offsets.set(id,this.matchPhase(id,'walk',0)/this.clips.get(id).duration);
 }
 startAction(id){
  if(!this.clips.has(id))return;
  this.oneShot={id,time:0,from:new Map(this.weights)};
 }
 update(delta,state={}){
  delta=Math.min(delta,.05);const speed=state.speed||0,moving=speed>.15;
  if(speed>2.2)this.ran=true;
  if(!moving&&this.wasMoving&&this.ran&&!this.oneShot){this.startAction('rifleRunStop');this.ran=false;}
  if(!moving&&!this.oneShot&&Math.abs(state.yawRate||0)>.3)this.startAction(state.yawRate>0?'turnLeft':'turnRight');
  this.wasMoving=moving;
  if(moving&&this.oneShot?.id!=='rifleRunStop')this.oneShot=null;
  if(moving&&speed>1&&this.oneShot?.time>.15)this.oneShot=null;
  const target=locomotionWeights(state);
  for(const [id] of this.weights)if(!target.has(id))target.set(id,0);
  for(const [id,w] of target){if(!this.clips.has(id))continue;const next=T.MathUtils.damp(this.weights.get(id)||0,w,12,delta);if(next<1e-5&&!w)this.weights.delete(id);else this.weights.set(id,next);}
  const total=[...this.weights.values()].reduce((a,b)=>a+b,0)||1;
  for(const [id,w] of this.weights)this.weights.set(id,w/total);
  let stride=0,movingWeight=0;
  for(const [id,w] of this.weights){if(!this.offsets.has(id))continue;const data=this.pack.clips.find(c=>c.id===id),d=data.sourceRootDelta,measured=d?Math.hypot(d[0],d[2])*.01/data.duration:0;const velocity=measured>.2?measured:WALK.includes(id)?1.05:3.1;stride+=w*velocity*data.duration;movingWeight+=w;}
  if(movingWeight>.001)this.phase=(this.phase+delta*T.MathUtils.clamp(speed/(stride/movingWeight),0,3.5))%1;
  const shot=this.oneShot,duration=shot?this.clips.get(shot.id).duration:0;
  if(shot)shot.time+=delta;
  const shotWeight=shot?Math.min(1,shot.time/.12,Math.max(0,(duration-shot.time)/.16)):0;
  this.restoreAuthoredPose();let dominant='',largest=-1;
  for(const [id,action] of this.actions){
   const weight=shot?.id===id?shotWeight:(this.weights.get(id)||0)*(1-shotWeight);
   if(weight<1e-5){action.stop();continue;}
   action.enabled=true;action.paused=true;action.setEffectiveWeight(weight);action.play();
   action.time=shot?.id===id?Math.min(shot.time,duration):this.offsets.has(id)?((this.phase+this.offsets.get(id))%1)*this.clips.get(id).duration:0;
   if(weight>largest){largest=weight;dominant=id;}
  }
  this.mixer.update(0);this.captureAuthoredPose();this.current=dominant;this.actionRemaining=0;
  // No frozen upper-body replacement or accumulated pose edits in this baseline.
  this.capturePresentedPose();
  if(shot&&shot.time>=duration)this.oneShot=null;
 }
}
