import * as THREE from 'three';
import {DebrisPool} from './DebrisPool.js';
import {hitMaterial,impactParameters} from './SurfaceGeometry.js';
import {soundEngine} from '../audio/SoundEngine.js';
import {projectSurfaceMark,removeSurfaceMark,surfaceRevision} from './SurfaceDecal.js';
import {physicalMaterial,surfaceThickness,projectileEnergy,penetrationResponse,brittleBlastFracture} from './PhysicalMaterials.js';
import {removeProp,syncDamagedCollision} from './MaterialProps.js';
import {invalidateSupport,supportHeight} from './SupportIndex.js';
import {environmentOf} from '../environment/EnvironmentSystem.js';
import {pipelineFor} from '../environment/DestructionPipeline.js';
import {operation,markOperation,runOperation} from '../environment/GeometryJobs.js';
import {dirtyShadowRegion} from '../environment/ShadowCache.js';
function markTexture(material){const size=64,data=new Uint8Array(size*size*4);for(let y=0;y<size;y++)for(let x=0;x<size;x++){const dx=(x-31.5)/31.5,dy=(y-31.5)/31.5,r=Math.hypot(dx,dy),a=Math.atan2(dy,dx),edge=.82+.08*Math.sin(a*9)+.045*Math.cos(a*17),i=(y*size+x)*4;const crater=r<.24;const ring=r>.28&&r<.7;const value=crater?8:material==='metal'?(ring?95:30):material==='wood'?(ring?91:37):(ring?64:28);data[i]=value;data[i+1]=material==='wood'?value*.69:value;data[i+2]=material==='wood'?value*.39:value;data[i+3]=r<edge?Math.round(255*Math.min(1,(edge-r)*10)):0;}const texture=new THREE.DataTexture(data,size,size);texture.colorSpace=THREE.SRGBColorSpace;texture.needsUpdate=true;return texture;}
export class SurfaceDamage{
 constructor(scene,colliders,{retainMarks=false}={}){this.markLife=retainMarks?Infinity:75;this.scene=scene;this.colliders=colliders;this.shadowsDirty=false;this.marks=[];this.pools={};this.time=0;this.stress=new WeakMap();
  const support={groundHeight:(point,ceiling)=>supportHeight(this,point,ceiling),supportOwner:()=>this.lastSupportMesh,supportRevision:()=>`${colliders.supportRevision||0}:${colliders.length}`,supportInterval:.12};
  for(const [kind,color] of Object.entries({concrete:0x969080,wood:0x79502d,metal:0xffb54a,glass:0xb6d7dd,dust:0xafa695}))this.pools[kind]=new DebrisPool(scene,new THREE.TetrahedronGeometry(1,0),new THREE.MeshStandardMaterial({color,roughness:kind==='metal'?.3:1,opacity:kind==='dust'?.18:1}),kind==='dust'?100:160,support);
  this.pools.paper=new DebrisPool(scene,new THREE.PlaneGeometry(1,1),new THREE.MeshStandardMaterial({color:0xded3b6,side:THREE.DoubleSide}),96,{...support,gravity:2,drag:1.8,flutter:1.4});
  this.pools.cloth=new DebrisPool(scene,new THREE.PlaneGeometry(1,1),new THREE.MeshStandardMaterial({color:0xb1a58e,side:THREE.DoubleSide}),96,{...support,gravity:3,drag:1.5,flutter:1});
  this.pools.stuffing=new DebrisPool(scene,new THREE.IcosahedronGeometry(1,0),new THREE.MeshStandardMaterial({color:0xe6dfca}),96,{...support,gravity:2.8,drag:2,flutter:.5});
  this.markMaterials=Object.fromEntries(['concrete','wood','metal'].map(kind=>[kind,new THREE.MeshStandardMaterial({map:markTexture(kind),roughness:kind==='metal'?.65:1,metalness:kind==='metal'?.35:0,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2})]));
  for(const kind of ['paper','cloth']){
   const texture=markTexture(kind),data=texture.image.data;
   for(let y=0;y<64;y++)for(let x=0;x<64;x++){const dx=(x-31.5)/31.5,dy=(y-31.5)/31.5,i=(y*64+x)*4,r=Math.abs(dx)*.65+Math.abs(dy)*1.8;data[i]=kind==='cloth'?32:90;data[i+1]=kind==='cloth'?28:69;data[i+2]=kind==='cloth'?22:46;data[i+3]=r<.8+.15*Math.sin(x*1.7)?220:0;}
   this.markMaterials[kind]=this.markMaterials.wood.clone();this.markMaterials[kind].map=texture;
  }
  this.markRoot=new THREE.Group();scene.add(this.markRoot);
 }
 invalidateShadow(mesh){const map=environmentOf(mesh)?.map;if(map)dirtyShadowRegion(map,mesh);else this.shadowsDirty=true;}
 emit(kind,point,normal,count,size=.025){for(let i=0;i<count;i++){const velocity=new THREE.Vector3((Math.random()-.5)*3,Math.random()*2,(Math.random()-.5)*3).addScaledVector(normal,1+Math.random()*3);const s=size*(.5+Math.random());this.pools[kind].spawn(point,velocity,new THREE.Matrix4().makeScale(s*(kind==='paper'?1.6:1),s*(kind==='wood'?3:1),s),new THREE.Vector3(Math.random()*8,Math.random()*8,Math.random()*8),kind==='dust'?.3+Math.random()*.3:kind==='paper'||kind==='cloth'?3+Math.random()*2:2+Math.random()*2);}}
 shatterBrittleShell(mesh,origin,direction){
  mesh.geometry.computeBoundingBox();const box=mesh.geometry.boundingBox,size=box.getSize(new THREE.Vector3()),axes=['x','y','z'].sort((a,b)=>size[b]-size[a]),cols=Math.min(6,Math.max(2,Math.ceil(size[axes[0]]/.45))),rows=Math.min(2,Math.max(1,Math.ceil(size[axes[1]]/.4)));
  const pool=environmentOf(mesh)?.map?.debris||this.pools.concrete,material=Array.isArray(mesh.material)?mesh.material[0]:mesh.material,tint=material.color?.clone()||new THREE.Color(0xd2c8b6);
  // Broad shell pieces share the existing retained-rubble draw call. At most
  // twelve per part; no new rigid bodies, materials or shader variants.
  for(let col=0;col<cols;col++)for(let row=0;row<rows;row++){
   const point=box.getCenter(new THREE.Vector3());point[axes[0]]=box.min[axes[0]]+size[axes[0]]*(col+.5)/cols;point[axes[1]]=box.min[axes[1]]+size[axes[1]]*(row+.5)/rows;mesh.localToWorld(point);
   const outward=origin?point.clone().sub(origin).normalize():direction.clone(),velocity=outward.multiplyScalar(1.2+Math.random()*1.3).add(new THREE.Vector3((Math.random()-.5)*.5,.5+Math.random(),(Math.random()-.5)*.5));
   const rotation=new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.random()*3,Math.random()*6,Math.random()*3)),shape=new THREE.Matrix4().compose(new THREE.Vector3(),rotation,new THREE.Vector3(size[axes[0]]/cols*(.3+Math.random()*.15),Math.max(.012,size[axes[2]]*.3),size[axes[1]]/rows*(.3+Math.random()*.15)));
   pool.spawn(point,velocity,shape,new THREE.Vector3(Math.random()*3,Math.random()*3,Math.random()*3),pool===this.pools.concrete?4:Infinity,tint);
  }
  removeProp(mesh,this.colliders);this.invalidateShadow(mesh);
 }
 hit(hit,slot,direction,options={}){
  pipelineFor(this.scene)?.flush(hit.object);
  const steps=this.hitSteps(hit,slot,direction,options);let step=steps.next();
  while(!step.done){const op=step.value;if(op.kind==='sever')op.colliders=this.colliders;step=steps.next(runOperation(op));}return step.value;
 }
 *hitSteps(hit,slot,direction,{panel=false,distance=hit.distance||0,damage,energy,blast=false,blastOrigin=null}={},deferred=false){
  const mesh=hit.object;if(!mesh?.isMesh)return;if(!mesh.visible)return{penetrates:true,damageMultiplier:1,remainingEnergy:energy??projectileEnergy(slot,distance)};if(!deferred){mesh.userData.renderBatch?.detach(mesh);mesh.userData.motionBatch?.detach(mesh);}
  if(mesh.userData.waterBody){mesh.userData.waterBody.impact(hit.point,damage??(slot==='primary'?125:34));return{penetrates:true,damageMultiplier:.82,remainingEnergy:(energy??projectileEnergy(slot,distance))*.82};}
  if(mesh.userData.waterSystem){mesh.userData.waterSystem.splash(hit.point,damage??34);return{penetrates:true,damageMultiplier:.98,remainingEnergy:(energy??projectileEnergy(slot,distance))*.98};}
  const material=hitMaterial(mesh);mesh.updateWorldMatrix(true,false);
  const normal=hit.face?hit.face.normal.clone().applyNormalMatrix(new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld)).normalize():direction.clone().negate();
  const p=impactParameters(slot,material,{distance,damage,incidence:Math.abs(normal.dot(direction))});
  if(mesh.userData.breakableLight){const lamp=mesh.userData.breakableLight;if(!lamp.broken){lamp.broken=true;for(const light of lamp.lights)light.intensity=0;mesh.visible=false;mesh.userData.isShootable=false;this.emit('glass',hit.point,normal,14,.025);this.emit('metal',hit.point,normal,8,.012);soundEngine.playGlassBreak();this.shadowsDirty=true;}return;}
  if(material==='glass'||material==='ceramic'&&mesh.geometry.type==='CylinderGeometry'){
   if(!panel&&mesh.userData.damageablePart){removeProp(mesh.userData.damageRoot||mesh,this.colliders);this.emit('glass',hit.point,normal,14,.025);soundEngine.playGlassBreak();this.shadowsDirty=true;}
   environmentOf(mesh)?.hit(mesh,hit.point,direction,p.strength,{blast});
   return panel?undefined:penetrationResponse(material,surfaceThickness(mesh,normal.clone().transformDirection(mesh.matrixWorld.clone().invert())),energy??projectileEnergy(slot,distance),normal.dot(direction));
  }
  if(blast&&!panel){
   const physics=physicalMaterial(mesh),localNormal=normal.clone().transformDirection(mesh.matrixWorld.clone().invert()),thickness=surfaceThickness(mesh,localNormal),strength=p.strength,fracture=brittleBlastFracture(physics,thickness,strength,!!mesh.userData.brittleContainer);
   if(fracture){
    const point=mesh.worldToLocal(hit.point.clone());
    if(fracture.shatter){this.shatterBrittleShell(mesh,blastOrigin,direction);this.emit('dust',hit.point,normal,8,.08);}
    else if(yield operation('chip',mesh,[point,localNormal,fracture.radius,fracture.depth])){
     if(!mesh.visible)removeProp(mesh,this.colliders);else syncDamagedCollision(mesh,this.colliders);
     invalidateSupport(this.colliders);this.invalidateShadow(mesh);
     this.emit('concrete',hit.point,normal,Math.min(24,p.fragments+4),.07);this.emit('dust',hit.point,normal,8,.08);
    }
    environmentOf(mesh)?.hit(mesh,hit.point,direction,strength,{blast:true});soundEngine.playImpact(hit.point);
    // An explosion leaves broken material and dust, never a new bullet decal.
    return;
   }
   // A sub-threshold blast must not fall back to directional bullet punctures.
   if(physics.response==='brittle'){if(strength>=15)this.emit('dust',hit.point,normal,3,.03);return;}
  }
  const kind=['wood','metal','paper','cloth'].includes(material)?material:'concrete';
  const decal=new THREE.Mesh(new THREE.BufferGeometry(),this.markMaterials[kind]);decal.position.copy(hit.point);decal.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),normal);decal.rotateZ(Math.random()*Math.PI*2);
  const incidence=Math.max(.25,Math.abs(normal.dot(direction)));decal.scale.set(p.radius*2/Math.sqrt(incidence),p.radius*2,1);decal.renderOrder=2;
  let entry={decal,mesh,local:mesh.worldToLocal(decal.position.clone()),rotation:mesh.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(decal.quaternion.clone()),size:new THREE.Vector3(decal.scale.x,decal.scale.y,.035),life:this.markLife};
  // Repeated impacts at one hole update its mark instead of stacking transparent
  // geometry and reprojecting dozens of copies after every subsequent fracture.
  const existing=this.marks.find(m=>m.mesh===mesh&&m.local.distanceToSquared(entry.local)<.015**2&&new THREE.Vector3(0,0,1).applyQuaternion(m.rotation).dot(new THREE.Vector3(0,0,1).applyQuaternion(entry.rotation))>.95);
  if(existing){decal.geometry.dispose();existing.size.x=Math.max(existing.size.x,entry.size.x);existing.size.y=Math.max(existing.size.y,entry.size.y);existing.life=this.markLife;entry=existing;}
  else{this.marks.push(entry);if(this.marks.length>192)removeSurfaceMark(this.marks.shift());}
  entry.pending=deferred;
  this.emit(kind,hit.point,normal,kind==='metal'?p.fragments:Math.ceil(p.fragments*.6),kind==='metal'?.008:kind==='paper'?.045:.025);
  if(kind==='cloth')this.emit('stuffing',hit.point,normal,6,.012);
  if(!['metal','paper','cloth'].includes(kind))this.emit('dust',hit.point,normal,5,p.heavy?.06:.03);
  const point=mesh.worldToLocal(hit.point.clone()),localNormal=normal.clone().transformDirection(mesh.matrixWorld.clone().invert());
  mesh.geometry.computeBoundingBox();const box=mesh.geometry.boundingBox,axis=['x','y','z'].sort((a,b)=>Math.abs(localNormal[b])-Math.abs(localNormal[a]))[0];
  const edge=['x','y','z'].filter(a=>a!==axis).some(a=>Math.min(Math.abs(point[a]-box.min[a]),Math.abs(point[a]-box.max[a]))<p.chipRadius);
  const physics=physicalMaterial(mesh),thickness=surfaceThickness(mesh,localNormal);
  if(kind==='metal'&&(yield operation('dent',mesh,[point,localNormal,p.strength,thickness])))this.invalidateShadow(mesh);
  let chipped=false,damageCell=null;
  if(!panel&&(kind==='wood'||kind==='concrete'&&(edge||physics.response==='brittle'))){
   // Accumulate nearby hits on the same face; distant hits cannot weaken this edge.
   let cells=this.stress.get(mesh);if(!cells){cells=[];this.stress.set(mesh,cells);}
   let cell=cells.find(c=>c.point.distanceToSquared(point)<.12*.12&&c.normal.dot(localNormal)>.75);
   if(!cell){cell={point:point.clone(),normal:localNormal.clone(),strength:0};cells.push(cell);if(cells.length>64)cells.shift();}
   cell.strength+=p.strength;cell.totalStrength=(cell.totalStrength||0)+p.strength;
   damageCell=cell;
   const resistance=kind==='wood'?physics.fracture*Math.max(.45,Math.min(1.5,thickness/.065)):physics.response==='brittle'?physics.fracture*(edge?.3:.5)*THREE.MathUtils.clamp(thickness/.08,.65,2.5):physics.fracture*.3;
   if(kind==='wood'&&!mesh.userData.onMaterialBreak&&cell.strength>=resistance*.5&&(yield operation('sever',mesh,[point]))){chipped=true;cell.strength=0;}
   else if(cell.strength>=resistance){
    const accumulated=Math.min(125,cell.strength,p.strength*1.5),scale=Math.sqrt(accumulated/125);
    chipped=yield operation('chip',mesh,[point,localNormal,(.045+.135*scale)*(blast?Math.min(2.6,1+Math.sqrt(p.strength/125)) :1),blast?Math.max(.018+.112*scale,Math.min(.3,thickness*1.2)):.018+.112*scale]);
    if(chipped)cell.strength=0;
   }
  }
  if(chipped){
   if(!mesh.visible)removeProp(mesh,this.colliders);
   syncDamagedCollision(mesh,this.colliders);invalidateSupport(this.colliders);
   // Place the mark on the newly exposed material, not across the missing chip.
   const ray=new THREE.Raycaster(hit.point.clone().addScaledVector(normal,.04),normal.clone().negate(),0,.7);
   const back=ray.intersectObject(mesh,false)[0];if(back)entry.local.copy(mesh.worldToLocal(back.point.clone()));
   this.emit(kind,hit.point,normal,p.fragments,p.heavy?.06:.025);this.invalidateShadow(mesh);
  }
  // Thick boxes retain collision; small completely destroyed wooden trims release theirs.
  if(kind==='wood'&&!panel){const size=box.getSize(new THREE.Vector3()),small=Math.max(size.x,size.y,size.z)<.65||Math.min(size.x,size.y,size.z)<.08&&Math.max(size.x,size.y,size.z)<2;
   if((small||mesh.userData.woodHealth)&&(damageCell?.totalStrength||0)>=(mesh.userData.woodHealth||240)){
    if(mesh.userData.onMaterialBreak)mesh.userData.onMaterialBreak(hit);
    else if(environmentOf(mesh)&&Math.max(size.x,size.y,size.z)>.35&&!mesh.userData.woodHealth)environmentOf(mesh).release(mesh,hit.point,direction);
    else removeProp(mesh,this.colliders);
    this.emit('wood',hit.point,normal,12,.035);this.invalidateShadow(mesh);soundEngine.playDoorBreak();}}
  if(kind==='paper'||kind==='cloth'){
   mesh.userData.softDamage=(mesh.userData.softDamage||0)+p.strength;
   if(mesh.geometry.type==='BoxGeometry'&&kind==='paper'&&(yield operation('chip',mesh,[point,localNormal,.025+p.strength*.00025,Math.min(.04,thickness*.35)])))this.invalidateShadow(mesh);
   if(kind==='paper'&&mesh.userData.softDamage>=160){removeProp(mesh,this.colliders);this.invalidateShadow(mesh);}
  }
  const response=penetrationResponse(physics,thickness,(energy??projectileEnergy(slot,distance,(damage??(slot==='primary'?125:34))/(slot==='primary'?125:34))),normal.dot(direction));
  if(!panel&&!chipped&&mesh.visible&&kind==='wood'&&response.penetrates){
   const localDirection=direction.clone().transformDirection(mesh.matrixWorld.clone().invert());
   if(yield operation('puncture',mesh,[point,localDirection,thickness/Math.max(.03,Math.abs(normal.dot(direction))),energy??projectileEnergy(slot,distance)])){invalidateSupport(this.colliders);this.invalidateShadow(mesh);}
  }
  if(!mesh.visible)removeProp(mesh,this.colliders);
  // Collision/support reactions belong to the geometry commit, never to the
  // later cosmetic decal job. A removed chair leg must tip the chair now.
  environmentOf(mesh)?.hit(mesh,hit.point,direction,p.strength,{blast});
  entry.pending=false;entry.life=this.markLife;
  const pipeline=deferred&&pipelineFor(this.scene);
  if(!mesh.visible||entry.removed){removeSurfaceMark(entry);this.marks=this.marks.filter(mark=>mark!==entry);}
  else if(pipeline)pipeline.refreshMark(entry,()=>removeSurfaceMark(entry));
  else if(!(yield markOperation(entry))){removeSurfaceMark(entry);this.marks=this.marks.filter(mark=>mark!==entry);}
  if(kind==='wood')soundEngine.playWoodHit();else if(kind!=='paper'&&kind!=='cloth')soundEngine.playImpact(hit.point);
  if(!panel)return response;
 }
 update(delta){this.time+=delta;for(const pool of Object.values(this.pools))pool.update(delta);this.marks=this.marks.filter(mark=>{if(mark.pending&&!mark.removed)return true;mark.life-=delta;if(mark.removed||mark.life<=0||!mark.mesh.visible){removeSurfaceMark(mark);return false;}const changed=mark.revision!==surfaceRevision(mark.mesh)||mark.sourceIndex!==mark.mesh.geometry.index||mark.sourcePositions!==mark.mesh.geometry.attributes.position;if(changed){const pipeline=pipelineFor(this.scene);if(pipeline)pipeline.refreshMark(mark,()=>removeSurfaceMark(mark));else if(!projectSurfaceMark(mark)){removeSurfaceMark(mark);return false;}}return true;});}
}
