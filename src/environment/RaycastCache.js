import {Mesh} from 'three';
import {MeshBVH,acceleratedRaycast,CENTER} from 'three-mesh-bvh';

const original=Mesh.prototype.raycast,cache=new WeakMap();
// Indirect BVHs preserve the original index and face numbers used by fracture
// cells. Geometry edits invalidate the tree; moving a mesh does not.
export function accelerateRaycast(mesh){
 if(mesh.raycast!==original)return;
 mesh.raycast=function(ray,hits){
  const g=this.geometry,p=g.attributes.position,index=g.index,count=(index?.count||p.count)/3;
  if(count<128)return original.call(this,ray,hits);
  let entry=cache.get(g);
  if(!entry||entry.p!==p||entry.pv!==p.version||entry.index!==index||entry.iv!==index?.version||entry.start!==g.drawRange.start||entry.count!==g.drawRange.count){
   const tree=new MeshBVH(g,{indirect:true,strategy:CENTER,maxLeafTris:10});entry={p,pv:p.version,index,iv:index?.version,start:g.drawRange.start,count:g.drawRange.count,tree};cache.set(g,entry);
  }
  g.boundsTree=entry.tree;return acceleratedRaycast.call(this,ray,hits);
 };
}
export function accelerateSceneRaycasts(scene){scene.traverse(mesh=>{if(mesh.isMesh)accelerateRaycast(mesh);});}
