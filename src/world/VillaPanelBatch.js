import * as THREE from 'three';
import {mergeGeometries} from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Static breakable panels share render submissions while retaining independent
// source geometry, hit metadata and collision. A removed cell updates only its
// own index range in the shared GPU buffer; neighbouring panels are untouched.
export function batchVillaPanels(map){
 const groups=new Map();map.fractureBatches=[];
 for(const panel of map.panels){if(panel.isDoor)continue;const mat=panel.mesh.material;if(!groups.has(mat))groups.set(mat,[]);groups.get(mat).push(panel);}
 for(const [material,panels] of groups){
  const geometries=[],records=new Map();let vertexStart=0,indexStart=0;
  for(const panel of panels){panel.mesh.updateWorldMatrix(true,false);const g=panel.mesh.geometry.clone().applyMatrix4(panel.mesh.matrixWorld);records.set(panel,{vertexStart,indexStart});vertexStart+=g.attributes.position.count;indexStart+=g.index.count;geometries.push(g);}
  const geometry=mergeGeometries(geometries,false);for(const g of geometries)g.dispose();
  geometry.index.setUsage(THREE.DynamicDrawUsage);geometry.computeBoundingBox();geometry.computeBoundingSphere();
  const mesh=new THREE.Mesh(geometry,material);mesh.name='Villa breakable surface batch';mesh.castShadow=panels[0].kind!=='glass';mesh.receiveShadow=true;mesh.userData={isShootable:true,fractureBatch:true};
  if(panels[0].kind==='glass'){mesh.userData.width=1;mesh.userData.breakable=true;}
  const bounds=geometry.boundingBox.clone(),active=new Set(panels);
  mesh.raycast=(raycaster,hits)=>{if(!raycaster.ray.intersectsBox(bounds))return;for(const panel of active)if(!panel.destroyed&&panel.mesh.visible)panel.mesh.raycast(raycaster,hits);};
  const batch={mesh,panels,removePiece(panel,piece){const record=records.get(panel);geometry.index.array.fill(record.vertexStart,record.indexStart+piece.start,record.indexStart+piece.start+piece.count);geometry.index.needsUpdate=true;},detach(panel){if(!active.delete(panel))return;const r=records.get(panel);geometry.index.array.fill(r.vertexStart,r.indexStart,r.indexStart+panel.mesh.geometry.index.count);geometry.index.needsUpdate=true;panel.mesh.layers.set(0);panel.renderBatch=null;}};
  for(const panel of panels){panel.renderBatch=batch;panel.mesh.layers.set(2);}
  map.scene.add(mesh);map.fractureBatches.push(batch);
 }
}

// Furniture and hard structure can share draws too. On the first hit, just that
// source mesh leaves its batch and resumes ordinary rendering before it is
// chipped/destroyed, preserving existing surface damage and attached decals.
export {batchStaticParts as batchVillaProps} from '../environment/PartBatching.js';
