import * as THREE from 'three';
const NAMES=['Hips','Spine','Spine1','Spine2','Neck','Head','LeftShoulder','LeftArm','LeftForeArm','LeftHand','RightShoulder','RightArm','RightForeArm','RightHand','LeftUpLeg','LeftLeg','LeftFoot','LeftToeBase','RightUpLeg','RightLeg','RightFoot','RightToeBase'];
export class SkeletalRagdoll{
 constructor(rig,colliders=[],direction=new THREE.Vector3(),point=null,power=1){this.rig=rig;this.age=0;this.accumulator=0;rig.object.updateMatrixWorld(true);this.colliders=colliders.filter(box=>box.distanceToPoint(rig.bones.Hips.getWorldPosition(new THREE.Vector3()))<4);this.expandedBox=new THREE.Box3();this.particles=new Map();this.links=[];this.orientations=new Map();
  for(const name of NAMES){const bone=rig.bones[name];if(!bone)continue;const position=bone.getWorldPosition(new THREE.Vector3()),velocity=direction.clone().multiplyScalar(.6*power);if(point){const weight=Math.exp(-position.distanceToSquared(point)/.5);velocity.addScaledVector(direction,Math.min(4,power*2)*weight);}velocity.y+=.2;velocity.addScaledVector(direction,name.includes('Spine')||name==='Head'?1.1:0);this.particles.set(name,{bone,position,previous:position.clone().addScaledVector(velocity,-1/120),radius:name==='Head'?.13:name==='Hips'||name.startsWith('Spine')?.16:name.includes('UpLeg')?.105:.075});this.orientations.set(name,bone.getWorldQuaternion(new THREE.Quaternion()).normalize());}
  for(const [name,p] of this.particles){let parent=p.bone.parent;while(parent&&!this.particles.has(parent.name.replace(/^mixamorig[:_]?/i,'').replace(/_\d+$/,'')))parent=parent.parent;const match=parent&&[...this.particles].find(([,q])=>q.bone===parent);if(match)this.link(match[0],name);}
  for(const [a,b] of [['LeftShoulder','RightShoulder'],['Spine2','Hips'],['Head','Spine1'],['LeftUpLeg','RightUpLeg'],['LeftShoulder','RightUpLeg'],['RightShoulder','LeftUpLeg']])this.link(a,b);
  // A rigid chest/pelvis cage prevents the torso from folding into a ball.
  const cage=['Hips','Spine','Spine1','Spine2','LeftShoulder','RightShoulder','LeftUpLeg','RightUpLeg'];
  for(let i=0;i<cage.length;i++)for(let j=i+1;j<cage.length;j++)this.link(cage[i],cage[j]);
  this.scratch=new THREE.Vector3();
  this.referenceFrame=this.frame();
  this.children=new Map();
  for(const [name,p] of this.particles){const child=[...this.particles.values()].find(q=>q.bone.parent===p.bone);if(child)this.children.set(name,{particle:child,direction:child.position.clone().sub(p.position).normalize()});}
  for(const side of ['Left','Right']){
   // Limits use segment lengths, never the starting animation's folded endpoint distance.
   this.jointLimit(side+'Arm',side+'ForeArm',side+'Hand',.28);
   this.jointLimit(side+'UpLeg',side+'Leg',side+'Foot',.56);
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

 }
 link(a,b,min=1,max=1){const x=this.particles.get(a),y=this.particles.get(b);if(x&&y){const length=x.position.distanceTo(y.position);this.links.push({a:x,b:y,min:length*min,max:length*max});}}
 jointLimit(a,b,c,minimum){const x=this.particles.get(a),y=this.particles.get(b),z=this.particles.get(c);if(!x||!y||!z)return;const total=x.position.distanceTo(y.position)+y.position.distanceTo(z.position);this.links.push({a:x,b:z,min:total*minimum,max:total*.995});}
 frame(){
  const get=n=>this.particles.get(n).position;
  const up=get('Spine2').clone().sub(get('Hips')).normalize();
  const right=get('RightUpLeg').clone().sub(get('LeftUpLeg'));right.addScaledVector(up,-right.dot(up)).normalize();
  const forward=new THREE.Vector3().crossVectors(right,up).normalize();
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(right,up,forward));
 }
 step(dt){
  for(const p of this.particles.values()){const velocity=this.scratch.copy(p.position).sub(p.previous).multiplyScalar(.994);p.previous.copy(p.position);p.position.add(velocity);p.position.y-=18*dt*dt;}
  for(let iter=0;iter<14;iter++){
   for(const link of this.constraints){const delta=this.scratch.copy(link.b.position).sub(link.a.position),length=delta.length();if(length<1e-7)continue;const target=THREE.MathUtils.clamp(length,link.min,link.max),error=(length-target)/length*.5;link.a.position.addScaledVector(delta,error);link.b.position.addScaledVector(delta,-error);}
   for(const p of this.particles.values()){
    if(p.position.y<p.radius){p.position.y=p.radius;p.previous.x+=(p.position.x-p.previous.x)*.15;p.previous.z+=(p.position.z-p.previous.z)*.15;}
    for(const box of this.colliders){if(box.ramp)continue;const expanded=this.expandedBox.copy(box).expandByScalar(p.radius);if(!expanded.containsPoint(p.position))continue;let best=Infinity,axis='y',value=0;for(const a of ['x','y','z'])for(const side of ['min','max']){const d=Math.abs(p.position[a]-expanded[side][a]);if(d<best){best=d;axis=a;value=expanded[side][a];}}p.position[axis]=value;p.previous[axis]=value;}
   }
  }
 }
 update(delta){this.age+=delta;if(this.sleeping)return;this.accumulator+=Math.min(delta,.08);while(this.accumulator>=1/120){this.step(1/120);this.accumulator-=1/120;}this.pose();if(this.age>2&&[...this.particles.values()].every(p=>p.position.distanceToSquared(p.previous)<.000001))this.sleeping=true;}
 pose(){
  const rig=this.rig,hips=this.particles.get('Hips');
  rig.object.updateMatrixWorld(true);
  hips.bone.position.copy(hips.bone.parent.worldToLocal(hips.position.clone()));
  const delta=this.frame().multiply(this.referenceFrame.clone().invert());
  // Reconstruct from the captured pose on every frame. Applying corrections to last
  // frame's rotations integrates unwanted twist, especially at shoulders and hips.
  for(const [name,p] of this.particles){
   const orientation=delta.clone().multiply(this.orientations.get(name));
   const child=this.children.get(name);
   if(child){
    const original=child.direction.clone().applyQuaternion(delta);
    const target=child.particle.position.clone().sub(p.position).normalize();
    if(target.lengthSq()>.9)orientation.premultiply(new THREE.Quaternion().setFromUnitVectors(original,target));
   }
   rig.setWorldRotation(p.bone,orientation.normalize());p.bone.quaternion.normalize();p.bone.updateMatrixWorld(true);
  }
  rig.object.updateMatrixWorld(true);
  const held=rig.animatedModel||rig.rifle;
  if(held){const kind=rig.animatedKind||'rifle',grip=kind==='pistol'?new THREE.Vector3(.025,-.09,.02):new THREE.Vector3(.048,-.14,.16);rig.placeModelInHand(held,grip,kind);}
 }
}
