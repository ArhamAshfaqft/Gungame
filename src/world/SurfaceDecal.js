import * as THREE from 'three';
import {DecalGeometry} from 'three/examples/jsm/geometries/DecalGeometry.js';
export const surfaceRevision=mesh=>`${mesh.geometry.uuid}:${mesh.geometry.attributes.position.version}:${mesh.geometry.index?.version??0}`;
export function projectSurfaceMark(entry){
 const {mesh,decal}=entry,motion=decal.userData.motionBatch;motion?.detach(decal);mesh.updateWorldMatrix(true,false);
 const point=mesh.localToWorld(entry.local.clone()),rotation=mesh.getWorldQuaternion(new THREE.Quaternion()).multiply(entry.rotation);
 const geometry=new DecalGeometry(mesh,point,new THREE.Euler().setFromQuaternion(rotation),entry.size);
 // Decals are real surface triangles, clipped to existing material, not floating
 // quads. Parent them to the damaged object so doors carry their marks naturally.
 const p=geometry.attributes.position,n=geometry.attributes.normal,world=new THREE.Vector3();
 const inverse=mesh.matrixWorld.clone().invert();
 for(let i=0;i<p.count;i++){world.fromBufferAttribute(p,i);if(n)world.addScaledVector(new THREE.Vector3().fromBufferAttribute(n,i),.0015);p.setXYZ(i,world.x,world.y,world.z);}
 geometry.applyMatrix4(inverse);
 const indices=[],a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3();
 for(let i=0;i<p.count;i+=3){a.fromBufferAttribute(p,i);b.fromBufferAttribute(p,i+1).sub(a);c.fromBufferAttribute(p,i+2).sub(a);if(b.cross(c).lengthSq()>1e-14)indices.push(i,i+1,i+2);}
 geometry.setIndex(indices);
 geometry.computeBoundingSphere();decal.geometry.dispose();decal.geometry=geometry;decal.position.set(0,0,0);decal.quaternion.identity();decal.scale.set(1,1,1);
 mesh.add(decal);entry.revision=surfaceRevision(mesh);entry.sourceIndex=mesh.geometry.index;entry.sourcePositions=mesh.geometry.attributes.position;
 if(indices.length&&motion)motion.add(decal);return indices.length>0;
}
export function removeSurfaceMark(entry){entry.removed=true;entry.decal.userData.motionBatch?.detach(entry.decal);entry.decal.removeFromParent();entry.decal.geometry.dispose();}
export function projectFloorMark(entry){
 if(!projectSurfaceMark(entry))return false;
 const geo=entry.decal.geometry,n=geo.attributes.normal,indices=[],matrix=new THREE.Matrix3().getNormalMatrix(entry.mesh.matrixWorld),normal=new THREE.Vector3();
 for(let i=0;i<n.count;i+=3){normal.fromBufferAttribute(n,i).applyMatrix3(matrix).normalize();if(normal.y>.9)indices.push(i,i+1,i+2);}
 geo.setIndex(indices);return indices.length>0;
}
