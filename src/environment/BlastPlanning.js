import * as T from 'three';
import {packGeometry,unpackGeometry} from './GeometryJobs.js';
import {physicalMaterial,blastImpact,propBlastImpact} from '../world/PhysicalMaterials.js';
import {WorldRayQuery} from './WorldRayQuery.js';
import {accelerateRaycast} from './RaycastCache.js';

// Copy a pre-blast snapshot. Workers never receive live scene objects or GPU buffers.
export function snapshotBlast(map,position,radius){
 map.scene.updateMatrixWorld(true);
 const sphere=new T.Sphere(position,radius),bounds=new T.Box3(),objects=[],lookup=new Map(),panels=[];
 map.scene.traverseVisible(mesh=>{
  const d=mesh.userData;
  if(!mesh.isMesh||!d.isShootable||d.water||d.bot||d.fractureBatch||d.propBatch||d.surface==='glass'&&!d.damageablePart)return;
  if(!mesh.geometry.boundingBox)mesh.geometry.computeBoundingBox();
  if(!bounds.copy(mesh.geometry.boundingBox).applyMatrix4(mesh.matrixWorld).intersectsSphere(sphere))return;
  lookup.set(mesh.id,mesh);
  objects.push({id:mesh.id,geometry:packGeometry(mesh.geometry,['position']),matrix:mesh.matrixWorld.toArray(),sides:(Array.isArray(mesh.material)?mesh.material:[mesh.material]).map(m=>m.side),material:physicalMaterial(mesh),brittleContainer:d.brittleContainer?{min:[...d.brittleContainer.min],max:[...d.brittleContainer.max]}:undefined,assemblyId:d.assemblyId,prop:!!map.surfaceDamage&&!!(d.collider||d.damageablePart)&&!d.breakable});
 });
 for(const p of map.panels){if(p.destroyed)continue;
  if(!p.mesh.geometry.boundingBox)p.mesh.geometry.computeBoundingBox();
  if(!bounds.copy(p.mesh.geometry.boundingBox).applyMatrix4(p.mesh.matrixWorld).intersectsSphere(sphere))continue;
  lookup.set(p.mesh.id,p.mesh);
  panels.push({id:p.mesh.id,matrix:p.mesh.matrixWorld.toArray(),width:p.width,height:p.height,kind:p.kind,material:physicalMaterial(p.mesh),toughness:p.toughness,cells:p.pieces.filter(c=>!p.broken.has(c.id)).map(c=>[c.id,c.center.x,c.center.y])});
 }
 return{payload:{position:position.toArray(),radius,objects,panels},lookup};
}

// Identical exposure rules to synchronous explosions, evaluated before any hole opens.
export function computeBlastPlan(data){
 const position=new T.Vector3().fromArray(data.position),{radius}=data,objects=data.objects.map(d=>{
  const materials=d.sides.map(side=>new T.MeshBasicMaterial({side})),mesh=new T.Mesh(unpackGeometry(d.geometry),materials.length===1?materials[0]:materials);
  mesh.matrixAutoUpdate=false;mesh.matrix.fromArray(d.matrix);mesh.updateMatrixWorld(true);mesh.userData={physicalMaterial:d.material.id||d.material.name,assemblyId:d.assemblyId};mesh.blastData=d;accelerateRaycast(mesh);return mesh;
 });
 const visibility=new WorldRayQuery(objects),ray=new T.Raycaster(),props=[],panels=[];ray.layers.enableAll();
 const profile=mesh=>mesh.blastData.material;
 for(const mesh of objects){const d=mesh.blastData;if(!d.prop)continue;const material=d.material;
  if(!['splinter','dent','brittle','tear','shatter'].includes(material.response))continue;
  const local=position.clone().applyMatrix4(mesh.matrixWorld.clone().invert()),point=mesh.geometry.boundingBox.clampPoint(local,new T.Vector3()).applyMatrix4(mesh.matrixWorld),delta=point.clone().sub(position),distance=delta.length();if(distance>radius)continue;
  const strength=propBlastImpact(material,distance,330,d.brittleContainer,local);if(strength<(material.response==='shatter'?2:material.response==='dent'?20:d.brittleContainer?15:60))continue;
  ray.set(position,delta.clone().normalize());ray.near=.01;ray.far=distance+.02;
  const hits=visibility.intersect(ray),hit=hits.find(h=>h.object===mesh),blockers=new Set();let transmission=1;
  if(hit)for(const h of hits){if(h.object===mesh||h.distance>=hit.distance-.01||blockers.has(h.object))continue;blockers.add(h.object);
   const p=profile(h.object),same=d.assemblyId&&d.assemblyId===h.object.blastData.assemblyId;
   if(p.response==='tear'||p.response==='shatter')transmission*=.8;
   else if(same&&p.response==='splinter'){const s=h.object.geometry.boundingBox.getSize(new T.Vector3());transmission*=Math.min(s.x,s.y,s.z)<=.04?.6:0;}
   else transmission=0;if(!transmission)break;
  }
  if(hit&&transmission>0)props.push({id:d.id,localPoint:hit.point.clone().applyMatrix4(mesh.matrixWorld.clone().invert()).toArray(),normal:hit.face.normal.toArray(),direction:delta.normalize().toArray(),strength:strength*transmission});
 }
 for(const p of data.panels){const matrix=new T.Matrix4().fromArray(p.matrix),inverse=matrix.clone().invert(),normal=new T.Vector3(0,0,1).transformDirection(matrix),exposed=[];let scarPoint=null;
  const clear=(point)=>{const delta=point.clone().sub(position),distance=delta.length();ray.set(position,delta.normalize());ray.near=.04;ray.far=Math.max(.04,distance-.04);return visibility.intersect(ray).every(hit=>hit.object.blastData.id===p.id);};
  if(p.kind!=='glass'){const local=position.clone().applyMatrix4(inverse);local.set(T.MathUtils.clamp(local.x,.05,p.width-.05),T.MathUtils.clamp(local.y,.05,p.height-.05),0);const point=local.applyMatrix4(matrix);if(point.distanceTo(position)<Math.min(radius,4.5)&&clear(point))scarPoint=point.toArray();}
  for(const [id,x,y] of p.cells){const point=new T.Vector3(x,y,0).applyMatrix4(matrix),delta=point.clone().sub(position),distance=delta.length();if(distance>=radius||p.kind!=='glass'&&blastImpact(p.material,distance,330,normal.dot(delta.normalize()))<p.toughness*.12)continue;if(clear(point))exposed.push(id);}
  if(exposed.length||scarPoint)panels.push({id:p.id,exposed,scarPoint});
 }
 for(const mesh of objects){mesh.geometry.boundsTree?.dispose?.();mesh.geometry.dispose();for(const mat of Array.isArray(mesh.material)?mesh.material:[mesh.material])mat.dispose();}
 return{props,panels};
}
