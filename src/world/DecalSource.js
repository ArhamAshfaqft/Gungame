import * as THREE from 'three';

const caches=new WeakMap();
// DecalGeometry allocates objects for every source vertex before clipping.
// Reject triangles outside a conservative projector box first; retain the
// original triangles and order, including puncture edges and removed cells.
export function decalSource(mesh,point,rotation,size){
 const g=mesh.geometry,p=g.attributes.position,index=g.index;
 if((index?.count??p.count)<384)return mesh;
 let cached=caches.get(g);
 if(!cached||cached.p!==p||cached.pv!==p.version||cached.index!==index||cached.iv!==index?.version){
  const count=index?.count??p.count,bounds=new Float64Array(Math.ceil(count/3)*6);
  for(let i=0;i<count;i+=3){
   const a=index?index.getX(i):i,b=index?index.getX(i+1):i+1,c=index?index.getX(i+2):i+2,o=i*2;
   bounds[o]=Math.min(p.getX(a),p.getX(b),p.getX(c));bounds[o+1]=Math.min(p.getY(a),p.getY(b),p.getY(c));bounds[o+2]=Math.min(p.getZ(a),p.getZ(b),p.getZ(c));
   bounds[o+3]=Math.max(p.getX(a),p.getX(b),p.getX(c));bounds[o+4]=Math.max(p.getY(a),p.getY(b),p.getY(c));bounds[o+5]=Math.max(p.getZ(a),p.getZ(b),p.getZ(c));
  }
  cached={p,pv:p.version,index,iv:index?.version,bounds};caches.set(g,cached);
 }
 const projector=new THREE.Matrix4().compose(point,rotation,new THREE.Vector3(1,1,1));
 projector.premultiply(mesh.matrixWorld.clone().invert());
 const box=new THREE.Box3(size.clone().multiplyScalar(-.5),size.clone().multiplyScalar(.5)).applyMatrix4(projector).expandByScalar(1e-7),selected=[],bounds=cached.bounds;
 for(let i=0;i<bounds.length;i+=6){
  if(bounds[i]>box.max.x||bounds[i+1]>box.max.y||bounds[i+2]>box.max.z||bounds[i+3]<box.min.x||bounds[i+4]<box.min.y||bounds[i+5]<box.min.z)continue;
  const k=i/2;selected.push(index?index.getX(k):k,index?index.getX(k+1):k+1,index?index.getX(k+2):k+2);
 }
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',p);if(g.attributes.normal)geometry.setAttribute('normal',g.attributes.normal);geometry.setIndex(selected);
 return {geometry,matrixWorld:mesh.matrixWorld};
}
