import * as T from 'three';
import {measurePalm,palmWorldPosition} from '../models/PalmGripFrames.js';
import {SwatRig} from '../models/SwatRig.js';
const v=()=>new T.Vector3(),q=()=>new T.Quaternion();
export class TripoHandFit{
 constructor(root,model,mixer,actions){
  this.object=root;this.model=model;this.mixer=mixer;this.actions=actions;
  this.bones=Object.fromEntries(model.getObjectsByProperty('isBone',true).map(b=>[b.name.replace(/^mixamorig[:_]?/,''),b]));
  this.setWorldRotation=SwatRig.prototype.setWorldRotation;this.solveIK=SwatRig.prototype.solveIK;
  this.rail=model.getObjectByName('anchor_rail_under');this.rear=model.getObjectByName('anchor_grip');
  this.sample=measurePalm(this,'Left');this.rightSample=measurePalm(this,'Right');this.gun=model.getObjectByName('M4_RightHand_Attachment');this.gunRest=this.gun.position.clone();this.original=new Map();

 }
 restore(){for(const [bone,rotation] of this.original)bone.quaternion.copy(rotation);}
 apply(runWeight,peekWeight){
  const names=['RightArm','RightForeArm','RightHand','LeftArm','LeftForeArm','LeftHand',...Object.keys(this.bones).filter(n=>/^LeftHand(Index|Middle|Ring|Pinky)/.test(n))];this.original.clear();for(const name of names){const b=this.bones[name];this.original.set(b,b.quaternion.clone());}
  this.object.updateMatrixWorld(true);
  // Correct the attachment's inherited wrist-to-grip offset using the real palm.
  // This moves the rigid rifle only; no additional right-arm joint is changed.
  this.gun.position.copy(this.gunRest);this.object.updateMatrixWorld(true);
  const gripDelta=palmWorldPosition(this.rightSample).sub(this.rear.getWorldPosition(v()));
  this.gun.position.copy(this.gun.parent.worldToLocal(this.gun.getWorldPosition(v()).add(gripDelta)));this.object.updateMatrixWorld(true);
  const upper=this.bones.LeftArm,lower=this.bones.LeftForeArm,hand=this.bones.LeftHand;
  const up=this.model.getObjectByName('anchor_sight_iron').getWorldPosition(v()).sub(this.model.getObjectByName('anchor_rail_top').getWorldPosition(v())).normalize();
  const current=hand.getWorldQuaternion(q()),normal=this.sample.normal.clone().applyQuaternion(current);
  const orientation=q().setFromUnitVectors(normal,up).multiply(current);
  this.setWorldRotation(hand,orientation);
  for(const finger of ['Index','Middle','Ring','Pinky'])for(let joint=1;joint<=3;joint++){
   const bone=this.bones['LeftHand'+finger+joint],next=this.bones['LeftHand'+finger+(joint+1)];if(!next)continue;
   const direction=next.getWorldPosition(v()).sub(bone.getWorldPosition(v())).normalize(),axis=direction.cross(up).normalize();
   const desired=q().setFromAxisAngle(axis,joint===1?.25:.65).multiply(bone.getWorldQuaternion(q()));this.setWorldRotation(bone,desired);
  }
  this.object.updateMatrixWorld(true);
  const pole=lower.getWorldPosition(v()),shoulder=upper.getWorldPosition(v());
  const length=shoulder.distanceTo(pole)+pole.distanceTo(hand.getWorldPosition(v())),offset=palmWorldPosition(this.sample).sub(hand.getWorldPosition(v()));
  const rail=this.rail.getWorldPosition(v()),rear=this.rear.getWorldPosition(v());
  let target=null;
  for(let fraction=.9;fraction>=.25;fraction-=.025){
   const candidate=rear.clone().lerp(rail,fraction);
   if(candidate.clone().sub(offset).distanceTo(shoulder)<length*.985){target=candidate;break;}
  }
  // A small shared carry adjustment when the opposite arm cannot reach.
  // Bend the trigger chain toward the support shoulder; never stretch bones.
  if(!target){
   const wanted=rear.clone().lerp(rail,.6),wristGoal=wanted.clone().sub(offset);
   const correction=shoulder.clone().sub(wristGoal).normalize().multiplyScalar(Math.max(0,wristGoal.distanceTo(shoulder)-length*.97));
   correction.clampLength(0,.18);
   const ru=this.bones.RightArm,rl=this.bones.RightForeArm,rh=this.bones.RightHand,rq=rh.getWorldQuaternion(q());
   this.solveIK(ru,rl,rh,rh.getWorldPosition(v()).add(correction),rl.getWorldPosition(v()));this.setWorldRotation(rh,rq);this.object.updateMatrixWorld(true);
   const movedRail=this.rail.getWorldPosition(v()),movedRear=this.rear.getWorldPosition(v());
   for(let fraction=.9;fraction>=.25;fraction-=.025){
    const candidate=movedRear.clone().lerp(movedRail,fraction);
    if(candidate.clone().sub(offset).distanceTo(shoulder)<length*.995){target=candidate;break;}
   }
  }
  this.reachable=!!target;if(!target){this.error=null;return;}
  this.target=target;let wrist=hand.getWorldPosition(v()).add(target.clone().sub(palmWorldPosition(this.sample)));
  for(let i=0;i<4;i++){
   this.solveIK(upper,lower,hand,wrist,pole);this.setWorldRotation(hand,orientation);this.object.updateMatrixWorld(true);
   const residual=target.clone().sub(palmWorldPosition(this.sample));if(residual.length()<.001)break;wrist.add(residual);
  }
  this.error=palmWorldPosition(this.sample).distanceTo(target);
 }
}
