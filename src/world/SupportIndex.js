import * as THREE from 'three';
const indexes=new WeakMap();
// Small X/Z buckets narrow support queries without changing triangle collision.
// Rebuild only after collision topology or a supporting transform changes.
export function supportCandidates(map,point){
 const colliders=map.colliders,revision=colliders.supportRevision||0;
 let entry=indexes.get(colliders);
 // The map and all damage-particle pools query the same collision world.
 // Share its index instead of rebuilding it independently after each motion.
 const staticRevision=colliders.staticSupportRevision||0;
 if(!entry||entry.staticRevision!==staticRevision||entry.count!==colliders.length||entry.revision!==revision&&colliders.some(box=>!entry.ranges.has(box))){
  const grid=new Map(),ranges=new Map();
  for(const box of colliders){
   ranges.set(box,[Math.floor(box.min.x/2),Math.floor(box.max.x/2),Math.floor(box.min.z/2),Math.floor(box.max.z/2)]);
   for(let x=Math.floor(box.min.x/2);x<=Math.floor(box.max.x/2);x++)for(let z=Math.floor(box.min.z/2);z<=Math.floor(box.max.z/2);z++){
    const key=`${x},${z}`;if(!grid.has(key))grid.set(key,[]);grid.get(key).push(box);
   }
  }
  entry={grid,ranges,staticRevision,revision,count:colliders.length};indexes.set(colliders,entry);
 }else if(entry.revision!==revision){
  // Most rubble motion stays inside its existing buckets. Only move changed
  // dynamic bounds between cells; retain the intact building's shared index.
  for(const box of colliders){
   const old=entry.ranges.get(box),x0=Math.floor(box.min.x/2),x1=Math.floor(box.max.x/2),z0=Math.floor(box.min.z/2),z1=Math.floor(box.max.z/2);
   if(old[0]===x0&&old[1]===x1&&old[2]===z0&&old[3]===z1)continue;
   for(let x=old[0];x<=old[1];x++)for(let z=old[2];z<=old[3];z++){const key=`${x},${z}`,bucket=entry.grid.get(key),i=bucket.indexOf(box);if(i>=0)bucket.splice(i,1);if(!bucket.length)entry.grid.delete(key);}
   for(let x=x0;x<=x1;x++)for(let z=z0;z<=z1;z++){const key=`${x},${z}`;if(!entry.grid.has(key))entry.grid.set(key,[]);entry.grid.get(key).push(box);}
   old[0]=x0;old[1]=x1;old[2]=z0;old[3]=z1;
  }
  entry.revision=revision;
 }
 map.supportIndex=entry.grid;map.supportIndexRevision=revision;map.supportIndexCount=entry.count;
 return entry.grid.get(`${Math.floor(point.x/2)},${Math.floor(point.z/2)}`)||[];
}
export function invalidateSupport(colliders,dynamic=false){colliders.supportRevision=(colliders.supportRevision||0)+1;if(!dynamic)colliders.staticSupportRevision=(colliders.staticSupportRevision||0)+1;}
export function supportHeight(map,point,ceiling=point.y+.01){
 const query=map.rubbleQuery??={origin:new THREE.Vector3(),down:new THREE.Vector3(0,-1,0),normal:new THREE.Vector3(),normalMatrix:new THREE.Matrix3(),checked:new Set(),hits:[]};
 const ray=map.rubbleRay||(map.rubbleRay=new THREE.Raycaster());ray.layers.enableAll();ray.set(query.origin.set(point.x,ceiling,point.z),query.down);ray.near=0;ray.far=Math.max(0,ceiling);
 let height=0,owner=null;const {checked,hits,normal,normalMatrix}=query;checked.clear();
 for(const box of supportCandidates(map,point)){
  if(point.x<box.min.x||point.x>box.max.x||point.z<box.min.z||point.z>box.max.z||box.min.y>ceiling||box.max.y<height)continue;
  if(box.ramp){const r=box.ramp,z=point.z-r.position.z,top=r.position.y+r.height*(.5-z/r.length);if(top<=ceiling&&top>height)height=top;continue;}
  const mesh=box.supportMesh||box.villaPanel?.mesh;if(!mesh||!mesh.visible||checked.has(mesh))continue;checked.add(mesh);mesh.updateWorldMatrix(true,false);
  hits.length=0;mesh.raycast(ray,hits);if(!hits.length)continue;normalMatrix.getNormalMatrix(mesh.matrixWorld);
  for(const hit of hits){normal.copy(hit.face.normal).applyNormalMatrix(normalMatrix);if(normal.y>.35&&hit.point.y>height){height=hit.point.y;owner=mesh;}}
 }
 hits.length=0;checked.clear();
 map.lastSupportMesh=owner;return height;
}
