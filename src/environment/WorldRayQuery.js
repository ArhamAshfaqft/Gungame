import {Box3,Vector3} from 'three';

// Snapshot world bounds once for a group of queries (e.g. one explosion).
// Triangle hits still come from the original meshes and their original faces.
export class WorldRayQuery {
 constructor(objects){this.entries=objects.map(mesh=>{if(!mesh.geometry.boundingBox)mesh.geometry.computeBoundingBox();return{mesh,bounds:mesh.geometry.boundingBox.clone().applyMatrix4(mesh.matrixWorld)};});this.point=new Vector3();this.candidates=[];}
 intersect(raycaster){
  const list=this.candidates;list.length=0;const origin=raycaster.ray.origin,far=raycaster.far**2;
  for(const {mesh,bounds} of this.entries){if(bounds.containsPoint(origin)||raycaster.ray.intersectBox(bounds,this.point)&&this.point.distanceToSquared(origin)<=far+1e-7)list.push(mesh);}
  return raycaster.intersectObjects(list,false);
 }
}
