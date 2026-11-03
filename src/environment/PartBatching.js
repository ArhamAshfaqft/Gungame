import * as THREE from 'three';
import {mergeGeometries} from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export function batchStaticParts(map,selection=null){
 const groups=new Map();map.propBatches??=[];if(!selection)map.propBatches=[];map.scene.updateMatrixWorld(true);
 const include=object=>{if(!object.isMesh||object.userData.renderBatch||(!object.userData.collider&&!object.userData.damageablePart)||Array.isArray(object.material))return;const material=object.material;if(!groups.has(material))groups.set(material,[]);groups.get(material).push(object);};
 if(selection)selection.forEach(include);else map.scene.traverse(include);
 for(const [material,objects] of groups){if(objects.length<3)continue;
  const records=new Map(),geometries=[],sourceBounds=new Map();let indexStart=0,vertexStart=0;
  for(const object of objects){const g=object.geometry.clone().applyMatrix4(object.matrixWorld);g.deleteAttribute('color');records.set(object,{indexStart,vertexStart,count:g.index?.count||g.attributes.position.count});if(!g.index)g.setIndex(Array.from({length:g.attributes.position.count},(_,i)=>i));indexStart+=g.index.count;vertexStart+=g.attributes.position.count;geometries.push(g);}
  for(const object of objects){if(!object.geometry.boundingBox)object.geometry.computeBoundingBox();sourceBounds.set(object,object.geometry.boundingBox.clone().applyMatrix4(object.matrixWorld));}
  const geometry=mergeGeometries(geometries,false);for(const g of geometries)g.dispose();if(!geometry)continue;
  geometry.index.setUsage(THREE.DynamicDrawUsage);geometry.computeBoundingBox();geometry.computeBoundingSphere();const bounds=geometry.boundingBox.clone(),active=new Set(objects);
  const mesh=new THREE.Mesh(geometry,material);mesh.name='Environment material batch';mesh.castShadow=true;mesh.receiveShadow=true;mesh.userData={isShootable:true,propBatch:true};
  mesh.raycast=(raycaster,hits)=>{if(!raycaster.ray.intersectsBox(bounds))return;for(const object of active)if(object.visible&&raycaster.ray.intersectsBox(sourceBounds.get(object)))object.raycast(raycaster,hits);};
  const batch={mesh,objects,detach(object){if(!active.delete(object))return;const r=records.get(object);geometry.index.array.fill(r.vertexStart,r.indexStart,r.indexStart+r.count);geometry.index.needsUpdate=true;object.layers.set(0);object.matrixAutoUpdate=true;object.matrixWorldAutoUpdate=true;delete object.userData.renderBatch;if(!active.size){mesh.removeFromParent();geometry.dispose();const index=map.propBatches.indexOf(batch);if(index>=0)map.propBatches.splice(index,1);}}};
  for(const object of objects){object.layers.set(2);object.userData.renderBatch=batch;object.matrixAutoUpdate=false;object.matrixWorldAutoUpdate=false;}map.scene.add(mesh);map.propBatches.push(batch);
 }
}
