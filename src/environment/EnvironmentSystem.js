import * as T from 'three';
import {World,Body,Vec3,Quaternion,SAPBroadphase,LockConstraint,HingeConstraint,Material,ContactMaterial} from 'cannon-es';
import {physicalMaterial} from '../world/PhysicalMaterials.js';
import {invalidateSupport,supportCandidates} from '../world/SupportIndex.js';
import {syncDamagedCollision,removeProp} from '../world/MaterialProps.js';
import {batchStaticParts} from './PartBatching.js';
import {MotionBatch} from './MotionBatch.js';
import {installShapeCulling} from './ShapeCulling.js';
import {physicsBox} from './PhysicsBox.js';
import {collisionVolumes} from './CollisionVolumes.js';

const owners=new WeakMap();
export const environmentOf=mesh=>owners.get(mesh);
const v=p=>new Vec3(p.x,p.y,p.z);
const bounds=mesh=>{if(!mesh.geometry.boundingBox)mesh.geometry.computeBoundingBox();return mesh.geometry.boundingBox.clone().applyMatrix4(mesh.matrixWorld);};
function meshesOf(object){const meshes=[];object.traverse(o=>{if(o.isMesh&&o.userData.damageablePart&&!o.userData.looseItem)meshes.push(o);});return meshes;}

// Map-independent support graph + lazy rigid bodies. Intact assemblies stay in
// render batches; bodies are created only when disturbed or disconnected.
export class EnvironmentSystem{
 constructor(map,{maxAwake=96}={}){
  this.map=map;this.scene=map.scene;this.colliders=map.colliders;this.maxAwake=maxAwake;
  this.records=[];this.byObject=new WeakMap();this.partRecords=new WeakMap();this.staticBodies=new Map();this.pending=new Set();this.breakQueue=new Set();
  this.motionBatch=new MotionBatch(this.scene);
  this.world=new World({gravity:new Vec3(0,-9.81,0),allowSleep:true});this.world.broadphase=new SAPBroadphase(this.world);this.world.solver.iterations=20;
  this.world.broadphase.useBoundingBoxes=true;
  installShapeCulling(this.world.narrowphase);
  this.world.narrowphase.enableFrictionReduction=true;
  this.world.defaultContactMaterial.friction=.55;this.world.defaultContactMaterial.restitution=.06;
  this.rigidMaterial=new Material('environment');this.looseMaterial=new Material('loose props');
  for(const other of [this.rigidMaterial,this.looseMaterial])this.world.addContactMaterial(new ContactMaterial(this.looseMaterial,other,{friction:.55,restitution:0,contactEquationStiffness:1e6,contactEquationRelaxation:6,frictionEquationStiffness:1e6,frictionEquationRelaxation:6}));
  this.clock=0;this.scanCursor=0;this.staticClock=0;this.accumulator=0;this.batchClock=0;this.settleClock=0;
 }
 register(object,{parts=null,supports=[],anchored=false,loose=false,wallMount=false,supportMode='any'}={}){
  if(this.byObject.has(object))return this.byObject.get(object);
  object.updateWorldMatrix(true,true);parts=parts||meshesOf(object);if(object.isMesh&&!parts.length)parts=[object];
  const record={object,parts,supports,anchored,loose,wallMount,supportMode,body:null,signature:'',center:new T.Vector3(),lastPosition:object.getWorldPosition(new T.Vector3()),lastQuaternion:object.getWorldQuaternion(new T.Quaternion())};
  this.records.push(record);this.byObject.set(object,record);
  if(object.isGroup&&parts.length>1)object.userData.environmentAssembly=true;
  for(const part of parts){owners.set(part,this);this.partRecords.set(part,record);}
  record.signature=this.signature(record);record.bearingSignature=this.bearingSignature(record);return record;
 }
 support(object,supports,options={}){return this.register(object,{...options,supports,parts:object.isMesh?[object]:null});}
 discardBody(r){
  const body=r.body;if(!body)return;
  for(const other of this.records)if(other.joint&&(other.joint.bodyA===body||other.joint.bodyB===body)){this.world.removeConstraint(other.joint);other.joint=null;if(other!==r){other.forcedDetached=true;other.body?.wakeUp();}}
  for(const part of r.parts){if(part.castShadow)(this.map.motionShadowBounds??=new T.Box3()).union(bounds(part));if(!part.visible)this.motionBatch.detachTree(part);}
  this.world.removeBody(body);r.body=null;this.pending.delete(r);this.supportDirty=true;this.scanAgain=true;this.staticRevision=-1;
 }
 signature(r){return r.parts.map(m=>`${Number(m.visible)}:${m.geometry.uuid}:${m.geometry.attributes.position.version}`).join('|');}
 bearingSignature(r){return (r.object.userData.supportParts||[]).map(m=>`${Number(m.visible)}:${m.userData.jointCuts||0}`).join('|');}
 needsPhysics(r){return this.bearingSignature(r)!==r.bearingSignature||!this.isSupported(r);}
 supportChanged(mesh){
  this.supportDirty=true;
  // Direct dependants react in the same commit as a broken shelf/attachment.
  // The incremental world scan remains a fallback for indirect floor support.
  for(const r of this.records)if(!r.body&&r.supports.some(c=>(c.mesh||c)===mesh)&&this.needsPhysics(r))this.activate(r);
 }
 sleepSupport(r){
  const box=new T.Box3();for(const mesh of r.parts)if(mesh.visible)box.union(bounds(mesh));
  if(box.isEmpty())return[];const p=box.getCenter(new T.Vector3());p.y=box.min.y+.02;this.map.rubbleFloor(p,p.y);const mesh=this.map.lastSupportMesh;
  return mesh&&!r.parts.includes(mesh)?[{mesh,geometry:mesh.geometry,index:mesh.geometry.index?.version,positions:mesh.geometry.attributes.position.version,matrix:mesh.matrixWorld.clone()}]:[];
 }
 observeScene(){
  const candidates=[];this.scene.traverse(m=>{if(m.isMesh&&m.userData.damageablePart)candidates.push(m);});
  for(const mesh of candidates)owners.set(mesh,this);
  for(const mesh of candidates){let parent=mesh.parent;while(parent&&parent!==this.scene){if(parent.userData.environmentAssembly)mesh.userData.assemblyId=parent.id;parent=parent.parent;}}
  for(const panel of this.map.panels||[])owners.set(panel.mesh,this);
  for(const r of this.records)if(r.wallMount&&!r.supports.length&&r.object.userData.wallMountProbe){
   for(const probe of r.object.userData.wallMountProbe){const point=r.object.localToWorld(probe.clone());
    for(const box of supportCandidates(this.map,point)){const mesh=box.supportMesh||box.villaPanel?.mesh;if(!mesh?.visible||r.parts.includes(mesh)||box.distanceToPoint(point)>.25)continue;
     const local=mesh.worldToLocal(point.clone());if(mesh.userData.breakable)local.z=0;r.supports.push({mesh,anchor:local});break;}
   }
  }
  for(const mesh of candidates)if(mesh.userData.wallAttachment){
   const supports=[];
   for(const point of mesh.userData.wallAttachment)for(const panel of this.map.panels||[]){
    if(panel.kind!=='plaster')continue;const p=panel.mesh.worldToLocal(point.clone());
    if(Math.abs(p.z)<.18&&p.x>=0&&p.x<=panel.width&&p.y>=0&&p.y<=panel.height){p.z=0;supports.push({mesh:panel.mesh,anchor:p});break;}
   }
   if(supports.length)this.register(mesh,{parts:[mesh],supports,wallMount:true});
  }
  const frames=candidates.filter(m=>m.name==='Door frame'&&m.geometry.parameters?.height>2);
  for(const panel of this.map.panels||[])if(panel.isDoor){
   const hinge=panel.group.position.clone().add(new T.Vector3(0,1,0)),frame=frames.find(m=>bounds(m).distanceToPoint(hinge)<.18);
   if(frame){panel.group.userData.doorPanel=panel;this.register(panel.group,{parts:[panel.mesh],supports:[frame]});}
  }
  for(const f of this.map.floorFixtures||[])this.register(f.object,{parts:meshesOf(f.object)});
  for(const mesh of candidates){
   if(this.partRecords.has(mesh)||mesh.userData.damageRoot&&mesh.userData.damageRoot!==mesh)continue;
   if(mesh.userData.looseItem){
    const parts=mesh.userData.damageParts||[mesh],owner=mesh.userData.supportOwner||mesh.userData.decorOwner;
    this.register(mesh,{parts,supports:owner?[owner]:[],loose:true});
   }
  }
  // Surface-supported objects (e.g. a countertop backing) bind to real parts
  // beneath them after all map geometry has been authored.
  for(const mesh of candidates)if(mesh.userData.surfaceSupported&&!this.partRecords.has(mesh)){
   const b=bounds(mesh),supports=[];for(const box of this.colliders){const owner=box.supportMesh;if(owner===mesh||!owner)continue;if(Math.abs(box.max.y-b.min.y)<.06&&box.max.x>b.min.x&&box.min.x<b.max.x&&box.max.z>b.min.z&&box.min.z<b.max.z)supports.push(owner);}
   this.support(mesh,[...new Set(supports)],{supportMode:'all'});
  }
 }
 detach(r){
  const parts=new Set(r.parts);
  for(const mesh of r.parts){mesh.userData.renderBatch?.detach(mesh);mesh.traverse(o=>{if(!o.isMesh||parts.has(o))return;o.userData.renderBatch?.detach(o);});if(mesh.userData.contactShadow)mesh.userData.contactShadow.visible=false;}
  if(r.object.parent!==this.scene)this.scene.attach(r.object);
  for(const mesh of r.parts)if(mesh!==r.object&&!r.object.getObjectById(mesh.id))r.object.attach(mesh);
 }
 createBody(r){
  for(const other of this.records)if(other.joint&&(other===r||other.joint.bodyA===r.body)){this.world.removeConstraint(other.joint);other.joint=null;}
  this.detach(r);r.object.updateWorldMatrix(true,true);
  const door=r.object.userData.doorPanel;
  if(door&&!door.detachedEnvironment){for(const box of door.collisionBoxes){const index=this.colliders.indexOf(box);if(index>=0)this.colliders.splice(index,1);}door.collisionBoxes=[];door.detachedEnvironment=true;door.mesh.userData.collider=new T.Box3().setFromObject(door.mesh);this.colliders.push(door.mesh.userData.collider);}
  const inverse=r.object.matrixWorld.clone().invert(),pieces=[];let total=0;r.center.set(0,0,0);
  for(const mesh of r.parts){if(!mesh.visible)continue;
   mesh.updateWorldMatrix(true,false);const transform=inverse.clone().multiply(mesh.matrixWorld),position=new T.Vector3(),q=new T.Quaternion(),scale=new T.Vector3();transform.decompose(position,q,scale);
   // A book is one solid rigid object, regardless of how many visual chips it
   // has. Overlapping per-chip AABBs made piles fight the solver indefinitely.
   const localBoxes=r.loose?[mesh.geometry.boundingBox||new T.Box3().setFromBufferAttribute(mesh.geometry.attributes.position)]:collisionVolumes(mesh);
   for(const box of localBoxes){const size=box.getSize(new T.Vector3()).multiply(scale),center=box.getCenter(new T.Vector3()).applyMatrix4(transform);size.set(Math.abs(size.x),Math.abs(size.y),Math.abs(size.z));if(Math.min(size.x,size.y,size.z)<.002)continue;
    const mass=Math.max(.015,size.x*size.y*size.z*physicalMaterial(mesh).density);pieces.push({mesh,size,center,q,mass});total+=mass;r.center.addScaledVector(center,mass);
   }
  }
  if(!pieces.length){if(r.body)this.world.removeBody(r.body);r.body=null;return;}
  r.center.multiplyScalar(1/total);r.volume=pieces.reduce((sum,p)=>sum+p.size.x*p.size.y*p.size.z,0);r.height=Math.max(...pieces.map(p=>p.center.y+p.size.y/2))-Math.min(...pieces.map(p=>p.center.y-p.size.y/2));const rotation=r.object.getWorldQuaternion(new T.Quaternion()),position=r.object.localToWorld(r.center.clone());
  const old=r.body,body=new Body({mass:Math.min(600,Math.max(.05,total)),material:r.loose?this.looseMaterial:this.rigidMaterial,position:v(position),quaternion:new Quaternion(rotation.x,rotation.y,rotation.z,rotation.w),linearDamping:r.loose?.45:.25,angularDamping:r.loose?.65:.4,allowSleep:true,sleepSpeedLimit:r.loose?.3:.22,sleepTimeLimit:1.5});
  if(r.loose){
   const wake=body.wakeUp;
   // Cannon tests raw angular speed when waking a sleeping neighbour. A tiny
   // book's harmless rotation can therefore wake an entire settled pile. Use
   // actual contact-point impact speed for automatic collision wakes instead.
   // Explicit gun/explosion/support-loss wakes bypass this filter.
   body.wakeUp=()=>{
    if(body.sleepState===Body.SLEEPING&&body.wakeUpAfterNarrowphase&&!this.world.contacts.some(c=>(c.bi===body||c.bj===body)&&Math.abs(c.getImpactVelocityAlongNormal())>.25))return;
    wake.call(body);
   };
  }
  for(const p of pieces)body.addShape(physicsBox(new Vec3(Math.max(.003,p.size.x/2),Math.max(.003,p.size.y/2),Math.max(.003,p.size.z/2))),v(p.center.clone().sub(r.center)),new Quaternion(p.q.x,p.q.y,p.q.z,p.q.w));
  if(old){body.velocity.copy(old.velocity);body.angularVelocity.copy(old.angularVelocity);this.world.removeBody(old);}this.world.addBody(body);r.body=body;r.quietProbe=null;r.sleepAnchors=null;r.signature=this.signature(r);
  // Rotation comes from the actual impact/contact torque. Injecting an extra
  // arbitrary spin into every newly released book destabilized whole stacks.
  // A released wall mounting needs a release tilt so a perfectly vertical
  // numerical bar doesn't balance forever on its narrow end after falling.
  if(r.wallMount&&!old)body.angularVelocity.set(.6,0,.3);
  if(r.loose&&['glass','ceramic'].includes(r.parts[0].userData.physicalMaterial))body.addEventListener('collide',event=>{if(Math.abs(event.contact.getImpactVelocityAlongNormal())>3)this.breakQueue.add(r);});
  body.addEventListener('collide',event=>{if(r.joint&&Math.abs(event.contact.getImpactVelocityAlongNormal())>1)r.joint.bodyA.wakeUp();});
  this.staticRevision=-1;
  this.supportDirty=true;this.scanAgain=true;
  for(const p of r.parts){p.userData.dynamicEnvironment=true;for(const box of p.userData.damageColliders||[p.userData.collider])if(box)box.dynamicEnvironment=true;if(r.loose)this.motionBatch.addTree(p);}
 }
 activate(r,impulse=null,point=null){
  if(!r||r.anchored||!r.parts.some(m=>m.visible))return;
  let rebuilt=false;
  if(!r.body){
   // The budget applies to discretionary complex-body impacts. Single-box
   // loose props and actual support failures cannot wait frozen in mid-air.
   if(!r.loose&&impulse&&!this.needsPhysics(r)&&this.records.filter(x=>!x.loose&&x.body&&x.body.sleepState!==Body.SLEEPING).length>=this.maxAwake){this.pending.add(r);return;}
   this.createBody(r);rebuilt=true;
  }
  else if(this.signature(r)!==r.signature){this.createBody(r);rebuilt=true;}
  if(r.body){
   r.restProbe=null;r.quietProbe=null;r.sleepAnchors=null;
   if(r.parts.some(m=>m.userData.renderBatch))this.detach(r);
   if(!r.loose&&!r.forcedDetached&&this.attachmentsIntact(r)&&!r.joint){const parent=r.supports.map(s=>this.partRecords.get(s.mesh||s)||this.byObject.get(s.mesh||s)).find(p=>p?.body&&p!==r);if(parent){
    if(r.object.userData.doorPanel){const point=r.object.position.clone().add(new T.Vector3(0,1,0)),pivotA=v(point).vsub(parent.body.position),pivotB=v(point).vsub(r.body.position),inverseA=parent.body.quaternion.inverse(),inverseB=r.body.quaternion.inverse();r.joint=new HingeConstraint(parent.body,r.body,{pivotA:inverseA.vmult(pivotA),pivotB:inverseB.vmult(pivotB),axisA:inverseA.vmult(new Vec3(0,1,0)),axisB:inverseB.vmult(new Vec3(0,1,0)),collideConnected:false,maxForce:4000});}
    else r.joint=new LockConstraint(parent.body,r.body,{maxForce:4000});this.world.addConstraint(r.joint);
   }}
   r.body.wakeUp();if(impulse){r.joint?.bodyA.wakeUp();const relative=point?point.clone().sub(new T.Vector3(r.body.position.x,r.body.position.y,r.body.position.z)):new T.Vector3();r.body.applyImpulse(v(impulse),v(relative));}
  }
  if(rebuilt)for(const child of this.records)if(child.body&&!child.joint&&!child.loose&&!child.forcedDetached&&child!==r&&child.supports.some(s=>this.partRecords.get(s.mesh||s)===r||this.byObject.get(s.mesh||s)===r))this.activate(child);
 }
 hit(mesh,point,direction,strength,{blast=false}={}){
  this.lastImpact=point.clone();
  let r=this.partRecords.get(mesh);
  if(r){
   if(!r.parts.some(m=>m.visible)){this.discardBody(r);this.supportChanged(mesh);return;}
   const changed=this.signature(r)!==r.signature;
   if(r.wallMount&&this.isSupported(r)&&strength<300){r.signature=this.signature(r);this.supportDirty=true;return;}
   const loose=r.loose||!r.supports.length&&!r.wallMount&&!r.object.userData.doorPanel;
   // Mesh damage is not the same as losing an attachment. Mounted shelves and
   // doors remain mounted until their actual connection fails. Light shots do
   // not turn an entire bookcase into an unanchored rigid body.
   if(r.body||r.loose||this.needsPhysics(r)||blast&&loose){const force=direction.clone().multiplyScalar(Math.min(12,strength*.015)*(blast?2:1));this.activate(r,force,point);}
   else if(changed)r.signature=this.signature(r);
  }
  // Direct connections react now; indirect floor support also has a scan fallback.
  this.supportChanged(mesh);
 }
 release(mesh,point,direction){const r=this.partRecords.get(mesh)||this.register(mesh,{parts:[mesh]});r.supports=[];r.forcedDetached=true;r.wallMount=false;if(r.joint){this.world.removeConstraint(r.joint);r.joint=null;}this.activate(r,direction.clone().multiplyScalar(1.5),point);}
 connectionIntact(connection){
  const m=connection.mesh||connection;if(!m.visible)return false;
  if(connection.anchor&&m.userData.fractureSolids){const p=connection.anchor;return m.userData.fractureSolids.some(s=>s.every(face=>{const normal=new T.Vector3().crossVectors(face[1].clone().sub(face[0]),face[2].clone().sub(face[0])).normalize();return normal.dot(p.clone().sub(face[0]))<=.003;}));}
  if(connection.anchor&&m.userData.breakable){const normal=new T.Vector3(0,0,1).transformDirection(m.matrixWorld),point=m.localToWorld(connection.anchor.clone()),ray=new T.Raycaster(point.addScaledVector(normal,.15),normal.negate(),0,.3);ray.layers.enableAll();return ray.intersectObject(m,false).length>0;}
  return true;
 }
 attachmentsIntact(r){
  if(!r.supports.length)return false;
  return r.supports[r.supportMode==='all'?'every':'some'](connection=>this.connectionIntact(connection));
 }
 isSupported(r){
  if(r.anchored)return true;
  if(r.supports.length)return r.supports[r.supportMode==='all'?'every':'some'](connection=>{
   const m=connection.mesh||connection;
   if(!this.connectionIntact(connection))return false;const owner=this.partRecords.get(m)||this.byObject.get(m);if(owner?.body)return false;
   // Test actual surviving material directly below the supported part, so a
   // hole through a shelf releases the items over that hole too.
   if(r.loose){const b=bounds(r.parts[0]),p=b.getCenter(new T.Vector3());p.y=b.min.y+.06;const ray=new T.Raycaster(p,new T.Vector3(0,-1,0),0,.22);ray.layers.enableAll();return ray.intersectObject(m,false).length>0;}
   return true;
  });
  if(r.wallMount)return true;
  const visible=r.parts.filter(m=>m.visible);if(!visible.length)return false;
  const b=new T.Box3();for(const m of visible)b.union(bounds(m));
  const x=(b.min.x+b.max.x)/2,z=(b.min.z+b.max.z)/2,y=b.min.y;
  return this.map.rubbleFloor(new T.Vector3(x,y+.03,z),y+.03)>=y-.12;
 }
 syncStatic(){
  const awake=this.records.filter(r=>r.body&&r.body.sleepState!==Body.SLEEPING);if(!awake.length)return;
  const wanted=new Set(),queries=new Map();
  for(const r of awake){const p=r.body.position;for(let x=-2;x<=2;x++)for(let z=-2;z<=2;z++){const xx=Math.floor(p.x/2)+x,zz=Math.floor(p.z/2)+z,key=`${xx},${zz}`,old=queries.get(key);if(old){old.min=Math.min(old.min,p.y-5);old.max=Math.max(old.max,p.y+4);}else queries.set(key,{x:xx*2+.5,z:zz*2+.5,min:p.y-5,max:p.y+4});}}
  for(const q of queries.values())for(const box of supportCandidates(this.map,new T.Vector3(q.x,0,q.z))){if(box.dynamicEnvironment||box.max.y<q.min||box.min.y>q.max)continue;wanted.add(box);}
  for(const [box,record] of this.staticBodies)if(!wanted.has(box)||!this.colliders.includes(box)){this.world.removeBody(record.body);this.staticBodies.delete(box);}
  for(const box of wanted){
   const mesh=box.supportMesh;if(mesh&&!mesh.visible)continue;
   const signature=`${box.min.toArray()}:${box.max.toArray()}`,previous=this.staticBodies.get(box);if(previous?.signature===signature)continue;if(previous)this.world.removeBody(previous.body);
   const size=box.getSize(new T.Vector3()),center=box.getCenter(new T.Vector3());if(size.x<=0||size.y<=0||size.z<=0)continue;
   const body=new Body({mass:0,material:this.rigidMaterial,position:v(center)});body.environmentSupport=mesh;
   if(box.ramp){const r=box.ramp;body.position.set(r.position.x,r.position.y+r.height/2-.1,r.position.z);body.quaternion.setFromAxisAngle(new Vec3(1,0,0),Math.atan(r.height/r.length));body.addShape(physicsBox(new Vec3(r.width/2,.11,Math.hypot(r.length,r.height)/2)));}
   else if(box.doorBounds&&box.doorGroup){const b=box.doorBounds,c=b.getCenter(new T.Vector3()),s=b.getSize(new T.Vector3()),p=box.doorGroup.localToWorld(c),q=box.doorGroup.getWorldQuaternion(new T.Quaternion());body.position.copy(v(p));body.quaternion.set(q.x,q.y,q.z,q.w);body.addShape(physicsBox(v(s.multiplyScalar(.5))));}
   else body.addShape(physicsBox(v(size.multiplyScalar(.5))));
   this.world.addBody(body);this.staticBodies.set(box,{body,signature});
  }
 }
 settleIslands(dt){
  this.settleClock+=dt;if(this.settleClock<.1)return;const elapsed=this.settleClock;this.settleClock=0;
  const records=this.records.filter(r=>r.body),parent=new Map(records.map(r=>[r.body,r.body])),anchors=new Map(),restContacts=new Set();
  const root=b=>{let p=parent.get(b);if(!p)return null;while(parent.get(p)!==p)p=parent.get(p);parent.set(b,p);return p;},join=(a,b)=>{const x=root(a),y=root(b);if(x&&y&&x!==y)parent.set(y,x);};
  for(const contact of this.world.contacts){join(contact.bi,contact.bj);if(Math.abs(contact.ni.y)>.3){restContacts.add(contact.bi);restContacts.add(contact.bj);}}
  for(const joint of this.world.constraints)join(joint.bodyA,joint.bodyB);
  for(const contact of this.world.contacts){
   const fixed=contact.bi.mass===0?contact.bi:contact.bj.mass===0?contact.bj:null,moving=fixed===contact.bi?contact.bj:contact.bi;
   if(!fixed||Math.abs(contact.ni.y)<.3)continue;const key=root(moving);if(!key)continue;let set=anchors.get(key);if(!set)anchors.set(key,set=new Set());if(fixed.environmentSupport)set.add(fixed.environmentSupport);
  }
  const groups=new Map();
  for(const r of records){const body=r.body,key=root(body);let group=groups.get(key);if(!group)groups.set(key,group={records:[],awake:false,quiet:true,anchored:anchors.has(key),supports:anchors.get(key)||new Set()});group.records.push(r);
   if(body.sleepState===Body.SLEEPING){group.anchored=true;for(const s of r.sleepAnchors||[])if(s.mesh.visible)group.supports.add(s.mesh);continue;}
   group.awake=true;
   // Books need rolling resistance at low-energy resting contacts. Cannon's
   // sliding friction alone leaves small angular oscillations in deep stacks.
   // Free flight and energetic impacts keep their original motion.
   if(r.loose&&restContacts.has(body)&&body.velocity.length()+body.angularVelocity.length()*Math.min(.5,body.boundingRadius)<.35){body.velocity.scale(Math.exp(-elapsed*5),body.velocity);body.angularVelocity.scale(Math.exp(-elapsed*8),body.angularVelocity);}
   const p=new T.Vector3(body.position.x,body.position.y,body.position.z),q=new T.Quaternion(body.quaternion.x,body.quaternion.y,body.quaternion.z,body.quaternion.w),probe=r.quietProbe;
   const slow=body.velocity.length()+body.angularVelocity.length()*Math.min(.5,body.boundingRadius)<.15;
   if(slow&&probe&&probe.position.distanceToSquared(p)<.025**2&&2*Math.acos(Math.min(1,Math.abs(probe.rotation.dot(q))))*Math.max(.05,body.boundingRadius)<.025)probe.time+=elapsed;
   else r.quietProbe={position:p,rotation:q,time:0};
   if(r.quietProbe.time<.8)group.quiet=false;
  }
  for(const group of groups.values())if(group.awake&&group.anchored&&group.quiet){
   const supportState=[...group.supports].map(mesh=>({mesh,geometry:mesh.geometry,index:mesh.geometry.index?.version,positions:mesh.geometry.attributes.position.version,matrix:mesh.matrixWorld.clone()}));
   for(const r of group.records){r.body.sleep();r.sleepAnchors=supportState.length?supportState:this.sleepSupport(r);}
  }
 }
 update(dt){
  if(dt<=0)return;this.clock+=dt;this.staticClock+=dt;
  for(const r of this.records)if(r.body&&!r.parts.some(m=>m.visible))this.discardBody(r);
  // At most 48 support relationships per frame; intact geometry does no physics.
  const staticRevision=this.colliders.staticSupportRevision||0;
  if(this.supportDirty||staticRevision!==this.supportRevision){
   if(staticRevision!==this.supportRevision)for(const r of this.records)if(r.body?.sleepState===Body.SLEEPING&&r.sleepAnchors?.some(s=>!s.mesh.visible||s.mesh.geometry!==s.geometry||s.mesh.geometry.index?.version!==s.index||s.mesh.geometry.attributes.position.version!==s.positions||!s.matrix.equals(s.mesh.matrixWorld))){r.body.wakeUp();r.quietProbe=null;r.restProbe=null;r.sleepAnchors=null;}
   if(this.lastImpact){for(const r of this.records)if(r.body?.sleepState===Body.SLEEPING&&this.lastImpact.distanceToSquared(new T.Vector3(r.body.position.x,r.body.position.y,r.body.position.z))<16)r.body.wakeUp();this.lastImpact=null;}
   if(this.scanRemaining)this.scanAgain=true;else this.scanRemaining=this.records.length;this.supportRevision=staticRevision;this.supportDirty=false;
  }
  if(!this.scanRemaining&&this.scanAgain){this.scanRemaining=this.records.length;this.scanAgain=false;}
  for(let i=0;i<48&&this.scanRemaining>0;i++,this.scanRemaining--){const r=this.records[this.scanCursor++%this.records.length];if(r.body)continue;if(this.needsPhysics(r))this.activate(r);else r.signature=this.signature(r);}
  for(const r of this.records)if(r.joint&&!this.attachmentsIntact(r)){this.world.removeConstraint(r.joint);r.joint=null;r.forcedDetached=true;r.body.wakeUp();}
  // Locked shelves belong to one rigid assembly. Do not let a sleeping carcass
  // hold awake child bodies in a solver tug-of-war. Real impacts wake the parent.
  for(const r of this.records)if(r.joint instanceof LockConstraint&&r.joint.bodyA.sleepState===Body.SLEEPING)r.body.sleep();
  for(const r of this.pending){if(!r.parts.some(m=>m.visible)){this.pending.delete(r);continue;}this.activate(r);if(r.body)this.pending.delete(r);if(this.pending.size&&this.records.filter(x=>x.body&&x.body.sleepState!==Body.SLEEPING).length>=this.maxAwake)break;}
  for(const r of this.records){if(!r.body)continue;const body=r.body,area=this.colliders.waterAreas?.find(a=>body.position.x>a.minX&&body.position.x<a.maxX&&body.position.z>a.minZ&&body.position.z<a.maxZ);
   r.buoyancy=0;if(area){if(r.waterLevel!==undefined&&Math.abs(r.waterLevel-area.surface)>.015)body.wakeUp();r.waterLevel=area.surface;const submerged=T.MathUtils.clamp((area.surface-body.position.y+r.height/2)/Math.max(.02,r.height),0,1);if(submerged>0){r.buoyancy=1000*r.volume*9.81*submerged;body.velocity.scale(Math.exp(-dt*submerged*2.5),body.velocity);body.angularVelocity.scale(Math.exp(-dt*submerged*3),body.angularVelocity);}}
  }
  const awake=this.records.some(r=>r.body&&r.body.sleepState!==Body.SLEEPING);
  if(!awake){this.batchResting(dt);return;}
  if(this.staticClock>.1||this.staticRevision!==staticRevision){this.staticClock=0;this.syncStatic();this.staticRevision=staticRevision;}
  this.accumulator=Math.min(.08,this.accumulator+dt);while(this.accumulator>=1/60){for(const r of this.records)if(r.body&&r.buoyancy>0)r.body.applyForce(new Vec3(0,r.buoyancy,0));this.world.step(1/60);this.accumulator-=1/60;}
  this.settleIslands(dt);
  for(const r of this.breakQueue){if(!r.body)continue;const point=new T.Vector3(r.body.position.x,r.body.position.y,r.body.position.z);removeProp(r.object,this.colliders);this.map.surfaceDamage?.emit('glass',point,new T.Vector3(0,1,0),12,.02);this.discardBody(r);r.signature=this.signature(r);}this.breakQueue.clear();
  let changed=false;
  for(const r of this.records){if(!r.body)continue;const body=r.body,q=new T.Quaternion(body.quaternion.x,body.quaternion.y,body.quaternion.z,body.quaternion.w),p=new T.Vector3(body.position.x,body.position.y,body.position.z).sub(r.center.clone().applyQuaternion(q));
   if(body.sleepState===Body.SLEEPING&&r.sleepAnchors===null)r.sleepAnchors=this.sleepSupport(r);
   // Thin shelves and stacked books can produce tiny solver oscillations which
   // continually wake a whole contact island. Sleep only after the actual pose
   // stays within a centimetre for 1.5 seconds; new hits/contact impulses wake it.
   if(body.sleepState!==Body.SLEEPING){const probe=r.restProbe,position=new T.Vector3(body.position.x,body.position.y,body.position.z);
    if(probe&&probe.position.distanceToSquared(position)<.012**2&&2*Math.acos(Math.min(1,Math.abs(probe.rotation.dot(q))))*Math.max(.05,body.boundingRadius)<.015){probe.time+=dt;if(probe.time>1.5)body.sleep();}
    else r.restProbe={position,rotation:q.clone(),time:0};
   }
   if(r.lastPosition.distanceToSquared(p)<1e-14&&1-Math.abs(r.lastQuaternion.dot(q))<1e-14)continue;
   if(r.parts.some(m=>m.userData.renderBatch))this.detach(r);
   const shadowBounds=this.map.motionShadowBounds??=new T.Box3();for(const m of r.parts)if(m.visible&&m.castShadow)shadowBounds.union(bounds(m));
   r.object.position.copy(p);r.object.quaternion.copy(q);r.object.updateMatrixWorld(true);r.lastPosition.copy(p);r.lastQuaternion.copy(q);
   for(const m of r.parts)if(m.visible){if(m.castShadow)shadowBounds.union(bounds(m));if(m.userData.collider)syncDamagedCollision(m,this.colliders);m.userData.motionBatch?.syncTree(m);}changed=true;
  }
  if(changed)invalidateSupport(this.colliders,true);
  this.batchResting(dt);
 }
 batchResting(dt){this.batchClock+=dt;if(this.batchClock>.75){this.batchClock=0;const resting=this.records.filter(r=>r.body?.sleepState===Body.SLEEPING).flatMap(r=>r.parts.filter(m=>m.visible&&!m.userData.renderBatch&&!m.userData.motionBatch));if(resting.length)batchStaticParts(this.map,resting);}}
}
