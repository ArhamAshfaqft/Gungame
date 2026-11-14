import * as THREE from 'three';
const NAMES=['Hips','Spine','Spine1','Spine2','Neck','Head','LeftShoulder','LeftArm','LeftForeArm','LeftHand','RightShoulder','RightArm','RightForeArm','RightHand','LeftUpLeg','LeftLeg','LeftFoot','LeftToeBase','RightUpLeg','RightLeg','RightFoot','RightToeBase'];
export class SkeletalRagdoll{
 constructor(rig,colliders=[],direction=new THREE.Vector3(),point=null,power=1){this.rig=rig;this.age=0;this.accumulator=0;this.restTime=0;rig.object.updateMatrixWorld(true);this.colliders=colliders.filter(box=>box.distanceToPoint(rig.bones.Hips.getWorldPosition(new THREE.Vector3()))<4);this.expandedBox=new THREE.Box3();this.particles=new Map();this.links=[];this.orientations=new Map();
  for(const name of NAMES){const bone=rig.bones[name];if(!bone)continue;const position=bone.getWorldPosition(new THREE.Vector3()),velocity=direction.clone().multiplyScalar(.12*Math.min(power,2.5));if(point){const weight=Math.exp(-position.distanceToSquared(point)/.5);velocity.addScaledVector(direction,Math.min(.9,power*.45)*weight);}velocity.y+=.05;velocity.addScaledVector(direction,name.includes('Spine')||name==='Head'?Math.min(.45,power*.18):0);this.particles.set(name,{bone,position,previous:position.clone().addScaledVector(velocity,-1/120),radius:name==='Head'?.13:name==='Hips'||name.startsWith('Spine')?.16:name.includes('UpLeg')?.105:.075});this.orientations.set(name,bone.getWorldQuaternion(new THREE.Quaternion()).normalize());}
  for(const [name,p] of this.particles){let parent=p.bone.parent;while(parent&&!this.particles.has(parent.name.replace(/^mixamorig[:_]?/i,'').replace(/_\d+$/,'')))parent=parent.parent;const match=parent&&[...this.particles].find(([,q])=>q.bone===parent);if(match)this.link(match[0],name);}
  for(const [a,b] of [['LeftShoulder','RightShoulder'],['Spine2','Hips'],['Head','Spine1'],['LeftUpLeg','RightUpLeg'],['LeftShoulder','RightUpLeg'],['RightShoulder','LeftUpLeg']])this.link(a,b);
  // A rigid chest/pelvis cage prevents the torso from folding into a ball.
  const cage=['Hips','Spine','Spine1','Spine2','Neck','LeftShoulder','RightShoulder','LeftArm','RightArm','LeftUpLeg','RightUpLeg'];
  this.cage=cage;this.rigidBones=new Set(['Hips','Spine','Spine1','Spine2','LeftShoulder','RightShoulder']);
  for(let i=0;i<cage.length;i++)for(let j=i+1;j<cage.length;j++)this.link(cage[i],cage[j]);
  this.boneLengths=new Map();
  for(const side of ['Left','Right'])for(const [a,b]of [['UpLeg','Leg'],['Leg','Foot']])this.boneLengths.set(side+b,this.particles.get(side+a).position.distanceTo(this.particles.get(side+b).position));
  this.scratch=new THREE.Vector3();
  this.kneeForward=new THREE.Vector3();this.referenceForward=new THREE.Vector3(0,0,1).applyQuaternion(rig.object.getWorldQuaternion(new THREE.Quaternion()));
  this.kneeScratch={axis:new THREE.Vector3(),pole:new THREE.Vector3(),desired:new THREE.Vector3()};
  this.referenceFrame=this.frame();
  const inverseFrame=this.referenceFrame.clone().invert(),hipOrigin=this.particles.get('Hips').position;
  this.torsoOffsets=new Map(cage.filter(n=>n!=='Hips').map(name=>[name,this.particles.get(name).position.clone().sub(hipOrigin).applyQuaternion(inverseFrame)]));
  this.torsoTarget=new THREE.Vector3();

  this.children=new Map();
  for(const [name,p] of this.particles){const child=[...this.particles.values()].find(q=>q.bone.parent===p.bone);if(child)this.children.set(name,{particle:child,direction:child.position.clone().sub(p.position).normalize()});}
  for(const side of ['Left','Right']){
   // Limits use segment lengths, never the starting animation's folded endpoint distance.
   this.jointLimit(side+'Arm',side+'ForeArm',side+'Hand',.35);
   this.jointLimit(side+'Shoulder',side+'Arm',side+'ForeArm',.6);
   this.jointLimit(side+'UpLeg',side+'Leg',side+'Foot',.66);
   this.ankleLimit(side);
   // Bound hip flexion using the chest/hip/thigh triangle. Pair constraints
   // preserve collision response without forcing a knee through the floor.
   const chest=this.particles.get('Spine2'),hip=this.particles.get(side+'UpLeg'),knee=this.particles.get(side+'Leg');
   const torso=chest.position.distanceTo(hip.position),thigh=hip.position.distanceTo(knee.position);
   this.links.push({a:chest,b:knee,min:Math.sqrt(torso*torso+thigh*thigh+2*torso*thigh*Math.cos(1.25)),max:Infinity});
   const other=this.particles.get((side==='Left'?'Right':'Left')+'UpLeg'),width=hip.position.distanceTo(other.position);
   this.links.push({a:other,b:knee,min:0,max:Math.sqrt(width*width+thigh*thigh+2*width*thigh*Math.sin(.6))});
  }
  this.separations=[];
  const names=[...this.particles.keys()];
  for(let i=0;i<names.length;i++)for(let j=i+1;j<names.length;j++){
   const a=this.particles.get(names[i]),b=this.particles.get(names[j]);
   if(this.links.some(l=>l.a===a&&l.b===b||l.a===b&&l.b===a))continue;
   const min=Math.min(a.radius+b.radius,a.position.distanceTo(b.position)*.85);
   this.separations.push({a,b,min,max:Infinity});
  }
  this.constraints=[...this.links,...this.separations];
  this.legFrames=new Map();
  this.referenceRight=new THREE.Vector3(1,0,0).applyQuaternion(rig.object.getWorldQuaternion(new THREE.Quaternion()));
  for(const side of ['Left','Right'])for(const part of ['UpLeg','Leg','Foot']){const name=side+part,child=this.children.get(name);if(child)this.legFrames.set(name,this.segmentFrame(child.direction,this.limbRight(side,this.referenceRight)));}
  this.terminalBindings=new Map();
  for(const [name,p] of this.particles)if(!this.children.has(name)&&p.bone.parent)this.terminalBindings.set(name,p.bone.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(this.orientations.get(name)));


 }
 link(a,b,min=1,max=1){const x=this.particles.get(a),y=this.particles.get(b);if(x&&y){const length=x.position.distanceTo(y.position);this.links.push({a:x,b:y,min:length*min,max:length*max});}}
 jointLimit(a,b,c,minimum){const x=this.particles.get(a),y=this.particles.get(b),z=this.particles.get(c);if(!x||!y||!z)return;const total=x.position.distanceTo(y.position)+y.position.distanceTo(z.position);this.links.push({a:x,b:z,min:total*minimum,max:total*.995});}
 ankleLimit(side){
  const a=this.particles.get(side+'Leg'),b=this.particles.get(side+'Foot'),c=this.particles.get(side+'ToeBase');if(!a||!b||!c)return;
  const shin=a.position.distanceTo(b.position),foot=b.position.distanceTo(c.position);
  const distance=angle=>Math.sqrt(shin*shin+foot*foot-2*shin*foot*Math.cos(angle));
  this.links.push({a,b:c,min:distance(65*Math.PI/180),max:distance(115*Math.PI/180)});
 }
 staticFriction(p){
  if(!p.staticContact)return;
  p.position.x=p.stepStart.x;p.position.z=p.stepStart.z;
  p.previous.x=p.position.x;p.previous.z=p.position.z;
 }
 frame(){
  const get=n=>this.particles.get(n).position;
  const up=get('Spine2').clone().sub(get('Hips')).normalize();
  const right=get('RightUpLeg').clone().sub(get('LeftUpLeg'));right.addScaledVector(up,-right.dot(up)).normalize();
  const forward=new THREE.Vector3().crossVectors(right,up).normalize();
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(right,up,forward));
 }
 // Knees bend in an anatomical plane, not freely around a ball joint.
 // Reposition only the knee on the two fixed-length segments; hips and feet
 // retain the physical fall/contact solution.
 kneeLimits(){
  const forward=this.kneeForward,{axis,pole,desired}=this.kneeScratch;
  for(const side of ['Left','Right']){
   const a=this.particles.get(side+'UpLeg'),b=this.particles.get(side+'Leg'),c=this.particles.get(side+'Foot');if(!a||!b||!c)continue;
   const ab=this.boneLengths.get(side+'Leg'),bc=this.boneLengths.get(side+'Foot');
   axis.copy(c.position).sub(a.position);const distance=axis.length();if(distance<1e-5)continue;axis.divideScalar(distance);
   pole.copy(forward).addScaledVector(axis,-forward.dot(axis));if(pole.lengthSq()<1e-6)continue;pole.normalize();
   const along=THREE.MathUtils.clamp((ab*ab-bc*bc+distance*distance)/(2*distance),0,ab);
   const height=Math.sqrt(Math.max(0,ab*ab-along*along));
   desired.copy(a.position).addScaledVector(axis,along).addScaledVector(pole,height);
   b.position.lerp(desired,.55);
  }
 }
 torsoShape(){
  const frame=this.frame(),hips=this.particles.get('Hips').position;
  for(const [name,offset]of this.torsoOffsets){
   const p=this.particles.get(name),correction=this.torsoTarget.copy(offset).applyQuaternion(frame).add(hips).sub(p.position).multiplyScalar(.3);
   p.position.add(correction);p.previous.add(correction);
  }
 }
 step(dt){
  for(const p of this.particles.values()){p.stepStart ||= p.position.clone();p.stepStart.copy(p.position);const wasGrounded=p.grounded;p.grounded=false;p.contact=false;const velocity=this.scratch.copy(p.position).sub(p.previous).multiplyScalar(.985);p.staticContact=wasGrounded&&velocity.x*velocity.x+velocity.z*velocity.z<.25*.25*dt*dt;p.previous.copy(p.position);p.position.add(velocity);p.position.y-=9.81*dt*dt;}
  const rotation=this.frame().multiply(this.referenceFrame.clone().invert());
  this.kneeForward.copy(this.referenceForward).applyQuaternion(rotation);
  for(let iter=0;iter<14;iter++){
   for(const link of this.constraints){const delta=this.scratch.copy(link.b.position).sub(link.a.position),length=delta.length();if(length<1e-7)continue;const target=THREE.MathUtils.clamp(length,link.min,link.max),error=(length-target)/length*.5;link.a.position.addScaledVector(delta,error);link.b.position.addScaledVector(delta,-error);}
   this.kneeLimits();
   this.torsoShape();
   for(const p of this.particles.values()){
    if(p.position.y<p.radius){p.position.y=p.radius;p.previous.y=p.position.y;p.contact=true;p.grounded=true;this.staticFriction(p);}
    for(const box of this.colliders){if(box.ramp)continue;const expanded=this.expandedBox.copy(box).expandByScalar(p.radius);if(!expanded.containsPoint(p.position))continue;let best=Infinity,axis='y',value=0;for(const a of ['x','y','z'])for(const side of ['min','max']){const d=Math.abs(p.position[a]-expanded[side][a]);if(d<best){best=d;axis=a;value=expanded[side][a];}}p.position[axis]=value;p.previous[axis]=value;p.contact=true;if(axis==='y'&&value===expanded.max.y){p.grounded=true;this.staticFriction(p);}}
   }
  }
  // Friction is applied once per physical step, not repeatedly in solver loops.
  // Cancelling contact-normal velocity stops the floor injecting endless bounce.
  let contacts=0,maxMotion=0,coreMotion=0;
  for(const [name,p] of this.particles){
   if(p.contact){contacts++;p.previous.lerp(p.position,.55);}
   const motion=p.position.distanceToSquared(p.stepStart);maxMotion=Math.max(maxMotion,motion);
   if(this.rigidBones.has(name)||name==='Head')coreMotion=Math.max(coreMotion,motion);
  }
  this.restTime=contacts>=2&&coreMotion<.000004&&maxMotion<.000025?this.restTime+dt:0;
 }
 update(delta){this.age+=delta;if(this.sleeping)return;this.accumulator+=Math.min(delta,.08);while(this.accumulator>=1/120){this.step(1/120);this.accumulator-=1/120;}this.pose();if(this.age>1&&this.restTime>.6){this.sleeping=true;for(const p of this.particles.values())p.previous.copy(p.position);}}
 limbRight(side,fallback){
  // Both segments use one hinge axis, preventing independent thigh/shin twist.
  const hip=this.particles.get(side+'UpLeg').position,knee=this.particles.get(side+'Leg').position,ankle=this.particles.get(side+'Foot').position;
  const normal=new THREE.Vector3().crossVectors(knee.clone().sub(hip),ankle.clone().sub(knee));
  if(normal.lengthSq()<.00001)return fallback.clone();
  normal.normalize();if(normal.dot(fallback)<0)normal.negate();return normal;
 }
 segmentFrame(direction,right){
  const side=right.clone().addScaledVector(direction,-right.dot(direction));
  if(side.lengthSq()<1e-6)side.set(0,0,1).addScaledVector(direction,-direction.z);
  side.normalize();const forward=new THREE.Vector3().crossVectors(side,direction).normalize();
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(side,direction,forward));
 }
 pose(){
  const rig=this.rig,hips=this.particles.get('Hips');
  rig.object.updateMatrixWorld(true);
  hips.bone.position.copy(hips.bone.parent.worldToLocal(hips.position.clone()));
  const delta=this.frame().multiply(this.referenceFrame.clone().invert());
  // Reconstruct from the captured pose on every frame. Applying corrections to last
  // frame's rotations integrates unwanted twist, especially at shoulders and hips.
  for(const [name,p] of this.particles){
   const binding=this.terminalBindings.get(name);
   const orientation=binding?p.bone.parent.getWorldQuaternion(new THREE.Quaternion()).multiply(binding):delta.clone().multiply(this.orientations.get(name));
   const child=this.children.get(name);
   if(child&&!this.rigidBones.has(name)){
    const original=child.direction.clone().applyQuaternion(delta);
    const target=child.particle.position.clone().sub(p.position).normalize();
    if(target.lengthSq()>.9){
     const legFrame=this.legFrames.get(name);
     if(legFrame)orientation.copy(this.segmentFrame(target,this.limbRight(name.startsWith('Left')?'Left':'Right',this.referenceRight.clone().applyQuaternion(delta)))).multiply(legFrame.clone().invert()).multiply(this.orientations.get(name));
     else orientation.premultiply(new THREE.Quaternion().setFromUnitVectors(original,target));
    }
   }
   rig.setWorldRotation(p.bone,orientation.normalize());p.bone.quaternion.normalize();p.bone.updateMatrixWorld(true);
  }
  rig.object.updateMatrixWorld(true);
  const held=rig.animatedModel||rig.rifle;
  if(held){const kind=rig.animatedKind||'rifle',grip=kind==='pistol'?new THREE.Vector3(.025,-.09,.02):new THREE.Vector3(.048,-.14,.16);rig.placeModelInHand(held,grip,kind);}
 }
}
