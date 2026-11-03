import * as T from 'three';

// GPU multi-draw keeps the original geometry, UVs, material and individual
// transforms of loose objects. Physics and hit testing still use their sources.
export class MotionBatch {
 constructor(scene){this.scene=scene;this.groups=new Map();this.entries=new WeakMap();}
 add(object){
  if(!object.isMesh||Array.isArray(object.material)||!object.visible)return;
  if(this.entries.has(object)){this.sync(object);return;}
  object.userData.renderBatch?.detach(object);object.updateWorldMatrix(true,false);
  if(!object.geometry.attributes.position.count)return;
  const key=`${object.material.id}:${Number(object.castShadow)}:${Number(object.receiveShadow)}:${object.renderOrder}`;
  let group=this.groups.get(key);
  if(!group){
   const mesh=new T.BatchedMesh(64,4096,8192,object.material);mesh.name='Moving environment material batch';mesh.frustumCulled=false;mesh.sortObjects=!!object.material.transparent;mesh.castShadow=object.castShadow;mesh.receiveShadow=object.receiveShadow;mesh.renderOrder=object.renderOrder;mesh.userData={isShootable:true,propBatch:true};
   group={mesh,objects:new Map(),vertices:4096,indices:8192,capacity:64};this.groups.set(key,group);this.scene.add(mesh);
   mesh.raycast=(ray,hits)=>{for(const [source,entry] of group.objects)if(source.visible&&source.userData.isShootable&&ray.ray.intersectsBox(entry.bounds))source.raycast(ray,hits);};
  }
  const {mesh}=group,geometry=new T.BufferGeometry().copy(object.geometry);geometry.deleteAttribute('color');
  if(!geometry.attributes.normal)geometry.computeVertexNormals();
  if(!geometry.attributes.uv)geometry.setAttribute('uv',new T.Float32BufferAttribute(new Float32Array(geometry.attributes.position.count*2),2));
  if(!geometry.index)geometry.setIndex(Array.from({length:geometry.attributes.position.count},(_,i)=>i));
  const vertices=geometry.attributes.position.count,indices=geometry.index.count;
  if(mesh.unusedVertexCount<vertices||mesh.unusedIndexCount<indices){
   mesh.optimize();
   while(mesh.unusedVertexCount<vertices||mesh.unusedIndexCount<indices){group.vertices*=2;group.indices*=2;mesh.setGeometrySize(group.vertices,group.indices);}
  }
  if(group.objects.size>=group.capacity){group.capacity*=2;mesh.setInstanceCount(group.capacity);}
  const geometryId=mesh.addGeometry(geometry),id=mesh.addInstance(geometryId);geometry.dispose();
  const entry={group,id,geometryId,geometry:object.geometry,version:object.geometry.attributes.position.version,indexVersion:object.geometry.index?.version,bounds:new T.Box3()};
  group.objects.set(object,entry);this.entries.set(object,entry);object.userData.motionBatch=this;object.layers.set(2);mesh.visible=true;this.sync(object);
 }
 sync(object){
  const entry=this.entries.get(object);if(!entry)return;
  if(entry.geometry!==object.geometry||entry.version!==object.geometry.attributes.position.version||entry.indexVersion!==object.geometry.index?.version){this.detach(object);this.add(object);return;}
  object.updateWorldMatrix(true,false);if(!object.geometry.boundingBox)object.geometry.computeBoundingBox();entry.bounds.copy(object.geometry.boundingBox).applyMatrix4(object.matrixWorld);entry.group.mesh.setMatrixAt(entry.id,object.matrixWorld);
 }
 addTree(object){object.traverse(mesh=>{if(mesh.isMesh&&mesh.visible)this.add(mesh);});}
 syncTree(object){object.traverse(mesh=>{if(mesh.userData.motionBatch===this)this.sync(mesh);});}
 detachTree(object){object.traverse(mesh=>this.detach(mesh));}
 detach(object){
  const entry=this.entries.get(object);if(!entry)return;
  entry.group.mesh.deleteGeometry(entry.geometryId);entry.group.objects.delete(object);if(!entry.group.objects.size)entry.group.mesh.visible=false;
  this.entries.delete(object);delete object.userData.motionBatch;object.layers.set(0);
 }
 dispose(){for(const group of this.groups.values()){for(const object of group.objects.keys()){delete object.userData.motionBatch;object.layers.set(0);}group.mesh.removeFromParent();group.mesh.dispose();}this.groups.clear();this.entries=new WeakMap();}
}
