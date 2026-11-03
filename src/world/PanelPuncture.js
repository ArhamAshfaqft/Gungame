import * as THREE from 'three';
import {ConvexHull} from 'three/examples/jsm/math/ConvexHull.js';
import {subtractSolid,solidsGeometry} from './FractureSolid.js';
import {invalidateSupport} from './SupportIndex.js';
import {dirtyShadowRegion} from '../environment/ShadowCache.js';

function prism(piece,thickness){
 const front=piece.polygon.map(p=>new THREE.Vector3(p.x,p.y,thickness/2));
 const back=piece.polygon.map(p=>new THREE.Vector3(p.x,p.y,-thickness/2));
 return [front,[...back].reverse(),...front.map((p,i)=>{const j=(i+1)%front.length;return[back[i],back[j],front[j],p];})];
}

// Subtract a small tapered channel along the actual projectile direction. The
// entry stays narrow and the exit splinters wider; surrounding cells stay intact.
export function puncturePanel(panel,worldPoint,worldDirection,energy,{depth=null,radius:requestedRadius=null}={}){
 if((panel.punctures||0)>=48)return false;
 const inverse=panel.mesh.matrixWorld.clone().invert(),point=worldPoint.clone().applyMatrix4(inverse),direction=worldDirection.clone().transformDirection(inverse);
 if(Math.abs(direction.z)<.05)return false;
 const thickness=panel.mesh.userData.thickness;
 const radius=requestedRadius??(.009+.004*Math.sqrt(Math.min(1,energy/4500)));
 const entry=point.clone().addScaledVector(direction,(-Math.sign(direction.z)*thickness/2-point.z)/direction.z);
 const start=entry.clone().addScaledVector(direction,-.015),end=entry.clone().addScaledVector(direction,(depth??thickness)/Math.abs(direction.z)+(depth===null?.025:0));
 const u=new THREE.Vector3().crossVectors(direction,new THREE.Vector3(0,1,0)).normalize(),v=new THREE.Vector3().crossVectors(direction,u),points=[];
 for(let i=0;i<7;i++){
  const angle=i/7*Math.PI*2,r=radius*(.88+.12*Math.sin(i*11+(panel.punctures||0)));
  const offset=u.clone().multiplyScalar(Math.cos(angle)*r).addScaledVector(v,Math.sin(angle)*r);
  points.push(start.clone().add(offset),end.clone().addScaledVector(offset,1.65));
 }
 const hull=new ConvexHull().setFromPoints(points),planes=hull.faces.map(f=>new THREE.Plane(f.normal.clone(),-f.constant));
 const previous=panel.punctureSolids||new Map(),next=new Map(previous),bounds=new THREE.Box2().setFromPoints(points.map(p=>new THREE.Vector2(p.x,p.y)));let changed=false;
 for(const piece of panel.pieces){
  if(panel.broken.has(piece.id))continue;
  // Broad-phase against the channel's projection before clipping convex solids.
  if(!bounds.intersectsBox(piece.bounds))continue;
  const source=previous.get(piece.id)||[prism(piece,thickness)],cut=source.flatMap(s=>subtractSolid(s,planes));
  if(cut.length>96)return false;
  if(cut.length!==source.length||cut.some((s,i)=>s!==source[i])){next.set(piece.id,cut);changed=true;}
 }
 if(!changed)return false;
 const positions=[],normals=[],uvs=[],colors=[],facePieces=[],ranges=[],cache=new Map(panel.punctureGeometry||[]),created=[];
 for(const piece of panel.pieces){
  const start=positions.length/3;
  if(!panel.broken.has(piece.id)){
   const solids=next.get(piece.id),cached=cache.get(piece.id);
   let g=cached?.solids===solids?cached?.geometry:null;
   if(!g){g=solidsGeometry(solids||[prism(piece,thickness)]);cache.set(piece.id,{solids,geometry:g});created.push(g);}
   const p=g.attributes.position,n=g.attributes.normal;
   for(let i=0;i<p.count;i++){
    positions.push(p.getX(i),p.getY(i),p.getZ(i));normals.push(n.getX(i),n.getY(i),n.getZ(i));uvs.push(p.getX(i)/2,p.getY(i)/2);
    colors.push(...(Math.abs(n.getZ(i))>.99?[1,1,1]:panel.mesh.userData.physicalMaterial==='plaster'?[.7,.68,.64]:[.64,.43,.25]));
    if(i%3===0)facePieces.push(piece.id);
   }
  }
  ranges.push({piece,start,count:positions.length/3-start});
 }
 if(positions.length/3>60000){for(const g of created)g.dispose();return false;}
 const geometry=new THREE.BufferGeometry();
 for(const [key,data,size] of [['position',positions,3],['normal',normals,3],['uv',uvs,2],['color',colors,3]])geometry.setAttribute(key,new THREE.Float32BufferAttribute(data,size));
 geometry.setIndex(Array.from({length:positions.length/3},(_,i)=>i));geometry.index.setUsage(THREE.DynamicDrawUsage);geometry.computeBoundingBox();geometry.computeBoundingSphere();
 panel.renderBatch?.detach(panel);
 const old=panel.mesh.geometry;panel.mesh.geometry=geometry;old.dispose();
 panel.mesh.userData.fractureFacePieces=facePieces;
 for(const {piece,start,count} of ranges)Object.assign(piece,{start,count});
 panel.punctureSolids=next;panel.punctures=(panel.punctures||0)+1;dirtyShadowRegion(panel.map,panel.mesh);
 invalidateSupport(panel.map.colliders);
 for(const [id,old] of panel.punctureGeometry||[])if(old.geometry!==cache.get(id)?.geometry)old.geometry.dispose();
 panel.punctureGeometry=cache;
 panel.map.emitPanelDebris(panel.mesh.userData.physicalMaterial==='plaster'?'plaster':panel.kind,worldPoint,worldDirection,new THREE.Vector2(radius*1.5,radius*2),panel.mesh.material.color);
 return true;
}
