import * as THREE from 'three';
import {environmentalDamage} from '../weapons/WeaponProfiles.js';
import {boxSolid,fracturePlanes,subtractSolid,solidsGeometry,projectileChannel} from './FractureSolid.js';
export function subtractBox(solid,cut){
 if(!solid.intersectsBox(cut))return[solid.clone()];
 const overlap=solid.clone().intersect(cut);if(overlap.isEmpty())return[solid.clone()];
 const out=[],core=solid.clone();
 for(const axis of ['x','y','z']){
  if(overlap.min[axis]>core.min[axis]+.0001){const slab=core.clone();slab.max[axis]=overlap.min[axis];out.push(slab);core.min[axis]=overlap.min[axis];}
  if(overlap.max[axis]<core.max[axis]-.0001){const slab=core.clone();slab.min[axis]=overlap.max[axis];out.push(slab);core.max[axis]=overlap.max[axis];}
 }return out;
}
export function chipBox(mesh,localPoint,localNormal,radius,depth){
 if(mesh.userData.surfaceCuts>=(mesh.userData.construction==='finish'?32:12))return false;
 if(!mesh.userData.fractureSolids){if(mesh.geometry.type!=='BoxGeometry')return false;mesh.geometry.computeBoundingBox();mesh.userData.fractureSolids=[boxSolid(mesh.geometry.boundingBox)];}
 const seed=(Math.round(localPoint.x*1000)^Math.round(localPoint.y*7919)^Math.round(localPoint.z*3571)^(mesh.userData.surfaceCuts||0)*101)>>>0;
 let grain=null;if(hitMaterial(mesh)==='wood'){const size=mesh.geometry.boundingBox.getSize(new THREE.Vector3()),axis=mesh.userData.grainAxis||['x','y','z'].sort((a,b)=>size[b]-size[a])[0];grain=new THREE.Vector3();grain[axis]=1;}
 const planes=fracturePlanes(localPoint,localNormal,radius,depth,seed,grain);
 const next=mesh.userData.fractureSolids.flatMap(solid=>subtractSolid(solid,planes));
 if(next.length>128)return false;
 if(!next.length){mesh.visible=false;mesh.userData.isShootable=false;mesh.userData.fractureSolids=[];return true;}
 const geometry=solidsGeometry(next);if(geometry.attributes.position.count>50000){geometry.dispose();return false;}
 mesh.geometry.dispose();mesh.geometry=geometry;mesh.userData.fractureSolids=next;mesh.userData.surfaceCuts=(mesh.userData.surfaceCuts||0)+1;return true;
}
export function hitMaterial(mesh){
 if(mesh.userData.physicalMaterial)return mesh.userData.physicalMaterial;
 if(mesh.userData.surface)return mesh.userData.surface;
 const m=Array.isArray(mesh.material)?mesh.material[0]:mesh.material;
 return m?.userData.surface || (m?.metalness>=.35?'metal':'concrete');
}
export function punctureProp(mesh,point,direction,thickness,energy){
 if((mesh.userData.projectileHoles?.length||0)>=16)return false;
 if(mesh.userData.projectileHoles?.some(p=>p.distanceToSquared(point)<.012**2))return false;
 if(!mesh.userData.fractureSolids){if(mesh.geometry.type!=='BoxGeometry')return false;mesh.geometry.computeBoundingBox();mesh.userData.fractureSolids=[boxSolid(mesh.geometry.boundingBox)];}
 const planes=projectileChannel(point,direction,thickness,energy),solids=mesh.userData.fractureSolids.flatMap(s=>subtractSolid(s,planes));if(solids.length>128)return false;
 const geometry=solidsGeometry(solids);if(geometry.attributes.position.count>50000){geometry.dispose();return false;}
 mesh.geometry.dispose();mesh.geometry=geometry;mesh.userData.fractureSolids=solids;(mesh.userData.projectileHoles??=[]).push(point.clone());return true;
}
// Environmental strength uses the same weapon damage baseline, with range and penetration loss.
export function impactParameters(slot,material,{distance=0,damage,incidence=1}={}){
 const strength=environmentalDamage(slot,distance,damage,incidence);
 const scale=Math.sqrt(strength/125),heavy=strength>=95;
 return{strength,radius:(.04*Math.pow(strength/125,.7))*(material==='wood'?1.3:1),chipRadius:.045+.135*scale,depth:.018+.112*scale,fragments:Math.max(3,Math.round(12*scale)),heavy};
}
