import * as THREE from 'three';
import {projectSurfaceMark,removeSurfaceMark,surfaceRevision} from './SurfaceDecal.js';
import {pipelineFor} from '../environment/DestructionPipeline.js';

// Small surface cracks and dust staining, clipped to surviving geometry.
export class BlastScars {
 constructor(){
  this.entries=[];
  const n=96,data=new Uint8Array(n*n*4),lines=[];
  for(let branch=0;branch<5;branch++){
   let last=new THREE.Vector2();
   for(let i=1;i<=6;i++){const angle=branch*1.256+Math.sin(i*7+branch)*.16,r=i/7;const next=new THREE.Vector2(Math.cos(angle)*r,Math.sin(angle)*r);lines.push([last,next]);last=next;}
  }
  for(let y=0;y<n;y++)for(let x=0;x<n;x++){
   const p=new THREE.Vector2(x/(n-1)*2-1,y/(n-1)*2-1),r=p.length();let distance=1;
   for(const [a,b] of lines){const d=b.clone().sub(a),t=THREE.MathUtils.clamp(p.clone().sub(a).dot(d)/d.lengthSq(),0,1);distance=Math.min(distance,p.distanceTo(a.clone().addScaledVector(d,t)));}
   const i=(y*n+x)*4;data[i]=45;data[i+1]=37;data[i+2]=29;data[i+3]=r<.95?Math.max(0,Math.round((1-r)**2*70+Math.max(0,1-distance/.016)*150)):0;
  }
  const texture=new THREE.DataTexture(data,n,n);texture.colorSpace=THREE.SRGBColorSpace;texture.needsUpdate=true;
  this.material=new THREE.MeshStandardMaterial({map:texture,transparent:true,depthWrite:false,roughness:1,polygonOffset:true,polygonOffsetFactor:-2});
 }
 create(panel,point,origin){
  const mesh=panel.mesh,normal=new THREE.Vector3(0,0,1).transformDirection(mesh.matrixWorld);
  if(normal.dot(origin.clone().sub(point))<0)normal.negate();
  const rotation=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,0,1),normal),decal=new THREE.Mesh(new THREE.BufferGeometry(),this.material);
  const size=.35+.6*Math.max(0,1-origin.distanceTo(point)/4.5);
  const entry={mesh,decal,local:mesh.worldToLocal(point.clone().addScaledVector(normal,.09)),rotation:mesh.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(rotation),size:new THREE.Vector3(size,size,.25)};
  return entry;
 }
 retain(entry){this.entries.push(entry);if(this.entries.length>64)removeSurfaceMark(this.entries.shift());}
 add(panel,point,origin){
  const entry=this.create(panel,point,origin);
  if(projectSurfaceMark(entry))this.retain(entry);else removeSurfaceMark(entry);
 }
 update(){this.entries=this.entries.filter(e=>{if(e.removed||!e.mesh.visible){removeSurfaceMark(e);return false;}if(!e.pending&&e.revision!==surfaceRevision(e.mesh)){let scene=e.mesh;while(scene.parent)scene=scene.parent;const pipeline=pipelineFor(scene);if(pipeline)pipeline.refreshMark(e,()=>removeSurfaceMark(e));else if(!projectSurfaceMark(e)){removeSurfaceMark(e);return false;}}return true;});}
}
