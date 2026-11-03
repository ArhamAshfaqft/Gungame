import * as THREE from 'three';
// Small X/Z buckets narrow support queries without changing triangle collision.
// Rebuild only after collision topology or a supporting transform changes.
export function supportCandidates(map,point){
 const revision=map.colliders.supportRevision||0;
 if(!map.supportIndex||map.supportIndexRevision!==revision||map.supportIndexCount!==map.colliders.length){
  const grid=new Map();
  for(const box of map.colliders){
   for(let x=Math.floor(box.min.x/2);x<=Math.floor(box.max.x/2);x++)for(let z=Math.floor(box.min.z/2);z<=Math.floor(box.max.z/2);z++){
    const key=`${x},${z}`;if(!grid.has(key))grid.set(key,[]);grid.get(key).push(box);
   }
  }
  map.supportIndex=grid;map.supportIndexRevision=revision;map.supportIndexCount=map.colliders.length;
 }
 return map.supportIndex.get(`${Math.floor(point.x/2)},${Math.floor(point.z/2)}`)||[];
}
export function invalidateSupport(colliders,dynamic=false){colliders.supportRevision=(colliders.supportRevision||0)+1;if(!dynamic)colliders.staticSupportRevision=(colliders.staticSupportRevision||0)+1;}
export function supportHeight(map,point,ceiling=point.y+.01){
 const ray=map.rubbleRay||(map.rubbleRay=new THREE.Raycaster());ray.layers.enableAll();ray.set(new THREE.Vector3(point.x,ceiling,point.z),new THREE.Vector3(0,-1,0));ray.near=0;ray.far=Math.max(0,ceiling);
 let height=0,owner=null;const checked=new Set();
 for(const box of supportCandidates(map,point)){
  if(point.x<box.min.x||point.x>box.max.x||point.z<box.min.z||point.z>box.max.z||box.min.y>ceiling||box.max.y<height)continue;
  if(box.ramp){const r=box.ramp,z=point.z-r.position.z,top=r.position.y+r.height*(.5-z/r.length);if(top<=ceiling&&top>height)height=top;continue;}
  const mesh=box.supportMesh||box.villaPanel?.mesh;if(!mesh||!mesh.visible||checked.has(mesh))continue;checked.add(mesh);mesh.updateWorldMatrix(true,false);
  const hits=[];mesh.raycast(ray,hits);const normalMatrix=new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld);
  for(const hit of hits){const normal=hit.face.normal.clone().applyNormalMatrix(normalMatrix);if(normal.y>.35&&hit.point.y>height){height=hit.point.y;owner=mesh;}}
 }
 map.lastSupportMesh=owner;return height;
}
