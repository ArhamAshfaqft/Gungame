import * as THREE from 'three';
import {boxSolid,subtractSolid,solidsGeometry} from './FractureSolid.js';
import {invalidateSupport} from './SupportIndex.js';
import {collisionVolumes} from '../environment/CollisionVolumes.js';

// A visual material can be overridden per part: e.g. a white mattress is cloth,
// a coloured book is paper, and a green bottle is glass rather than foliage.
export function materialPart(mesh,material,options={}){
 Object.assign(mesh.userData,{damageablePart:true,isShootable:true,physicalMaterial:material,surface:material,...options});
 if(material==='paper'||material==='glass')mesh.userData.looseItem=true;
 return mesh;
}
export function removeProp(mesh,colliders){
 for(const part of mesh.userData.damageParts||[mesh]){
  part.userData.renderBatch?.detach(part);part.userData.motionBatch?.detach(part);part.visible=false;part.userData.isShootable=false;
  part.traverse(child=>{if(child===part||!child.isMesh||child.userData.looseItem)return;child.userData.renderBatch?.detach(child);child.userData.motionBatch?.detach(child);child.visible=false;});
  if(part.userData.contactShadow)part.userData.contactShadow.visible=false;
  for(const box of part.userData.damageColliders||[part.userData.collider]){const index=colliders.indexOf(box);if(index>=0)colliders.splice(index,1);}
 }
 invalidateSupport(colliders);
}
export function syncDamagedCollision(mesh,colliders){
 if(!mesh.userData.collider)return;
 const previous=mesh.userData.damageColliders||[mesh.userData.collider];for(const box of previous){const i=colliders.indexOf(box);if(i>=0)colliders.splice(i,1);}
 const boxes=collisionVolumes(mesh).map(b=>b.clone().applyMatrix4(mesh.matrixWorld));
 for(const box of boxes){box.supportMesh=mesh;if(mesh.userData.dynamicEnvironment)box.dynamicEnvironment=true;}
 mesh.userData.damageColliders=boxes;if(boxes.length)mesh.userData.collider=boxes[0];colliders.push(...boxes);invalidateSupport(colliders,!!mesh.userData.dynamicEnvironment);
}
// Sever a narrow rail/slat at the hit, retaining its anchored ends. No whole
// decorative wall is erased; shots can pass through the new local opening.
export function severSlenderWood(mesh,point,colliders){
 if((mesh.userData.jointCuts||0)>=6)return false;
 mesh.geometry.computeBoundingBox();const box=mesh.geometry.boundingBox,size=box.getSize(new THREE.Vector3()),axes=['x','y','z'].sort((a,b)=>size[b]-size[a]);
 if(size[axes[0]]<.4||size[axes[1]]>.18||size[axes[2]]>.12)return false;
 const axis=axes[0],normal=new THREE.Vector3();normal[axis]=1;normal[axes[1]]=.11*Math.sin(point[axis]*19);normal[axes[2]]=.16*Math.cos(point[axis]*13);
 const half=Math.max(.08,Math.min(.16,size[axis]*.1));
 const projection=normal.dot(point),planes=[new THREE.Plane(normal.clone(),-projection-half),new THREE.Plane(normal.clone().negate(),projection-half)];
 mesh.userData.woodAnchors??={axis,min:box.min[axis],max:box.max[axis]};
 const anchors=mesh.userData.woodAnchors;
 const solids=(mesh.userData.fractureSolids||[boxSolid(box)]).flatMap(s=>subtractSolid(s,planes)).filter(s=>{
  const bounds=new THREE.Box3().setFromPoints(s.flat());return bounds.min[axis]<=anchors.min+.002||bounds.max[axis]>=anchors.max-.002;
 });
 const geometry=solidsGeometry(solids);mesh.geometry.dispose();mesh.geometry=geometry;mesh.userData.fractureSolids=solids;mesh.userData.jointCuts=(mesh.userData.jointCuts||0)+1;
 if(!solids.length)removeProp(mesh,colliders);else syncDamagedCollision(mesh,colliders);return true;
}
