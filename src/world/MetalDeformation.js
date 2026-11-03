import * as THREE from 'three';

// Cosmetic local deformation; thick structural steel remains effectively rigid.
export function dentMetal(mesh,point,normal,strength,thickness){
 if((mesh.userData.metalDents||0)>=12)return false;
 if(!mesh.userData.metalPrepared){
  mesh.userData.metalPrepared=true;
  const source=mesh.geometry,p=source.parameters;
  if(source.type==='BoxGeometry'){
   mesh.geometry=new THREE.BoxGeometry(p.width,p.height,p.depth,...[p.width,p.height,p.depth].map(v=>Math.max(2,Math.min(160,Math.ceil(v/.05)))));
  }else mesh.geometry=source.clone();
 }
 const radius=.035+Math.sqrt(strength/125)*.09,depth=Math.min(thickness*.2,(thickness<.1?.012:.001)*strength/125);
 const positions=mesh.geometry.attributes.position;let changed=false;
 for(let i=0;i<positions.count;i++){
  const v=new THREE.Vector3().fromBufferAttribute(positions,i),delta=v.clone().sub(point),axial=delta.dot(normal),radial=delta.addScaledVector(normal,-axial).length();
  if(Math.abs(axial)>.015||radial>=radius)continue;
  v.addScaledVector(normal,-depth*(1-radial/radius)**2);positions.setXYZ(i,v.x,v.y,v.z);changed=true;
 }
 if(changed){positions.needsUpdate=true;mesh.geometry.computeVertexNormals();mesh.geometry.computeBoundingBox();mesh.geometry.computeBoundingSphere();mesh.userData.metalDents=(mesh.userData.metalDents||0)+1;}
 return changed;
}
