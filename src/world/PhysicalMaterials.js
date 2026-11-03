// Gameplay-scale material properties, not engineering measurements. Construction
// thickness is in metres; projectile energy is a consistent penetration budget.
export {MATERIALS as PHYSICAL_MATERIALS} from '../environment/MaterialCatalog.js';
import {MATERIALS as PHYSICAL_MATERIALS} from '../environment/MaterialCatalog.js';
export function physicalMaterial(meshOrName){
 const mat=Array.isArray(meshOrName?.material)?meshOrName.material[0]:meshOrName?.material;
 const key=typeof meshOrName==='string'?meshOrName:meshOrName?.userData?.physicalMaterial||meshOrName?.userData?.surface||mat?.userData?.surface||(mat?.metalness>=.35?'metal':'concrete');
 return PHYSICAL_MATERIALS[key]||PHYSICAL_MATERIALS.concrete;
}
export function surfaceThickness(mesh,localNormal){
 if(Number.isFinite(mesh.userData.thickness))return mesh.userData.thickness;
 mesh.geometry.computeBoundingBox();const size=mesh.geometry.boundingBox.getSize(localNormal.clone());
 const scale=mesh.getWorldScale(localNormal.clone());
 const axis=['x','y','z'].sort((a,b)=>Math.abs(localNormal[b])-Math.abs(localNormal[a]))[0];
 return Math.max(.003,size[axis]*Math.abs(scale[axis]));
}
const PROJECTILES=Object.freeze({primary:{energy:4500,decay:350},shotgun:{energy:160,decay:18},pistol:{energy:500,decay:90}});
export function transportEnergy(slot,energy,distance){return energy*Math.exp(-Math.max(0,distance)/(PROJECTILES[slot]||PROJECTILES.pistol).decay);}
export function projectileEnergy(slot,distance=0,multiplier=1){return transportEnergy(slot,(PROJECTILES[slot]||PROJECTILES.pistol).energy,distance)*Math.max(0,multiplier);}
export function penetrationResponse(material,thickness,energy,incidence=1){
 const profile=typeof material==='string'?physicalMaterial(material):material;
 const cost=profile.penetrationPerMetre*thickness/Math.max(.03,Math.abs(incidence));
 const remaining=energy-cost;
 return {penetrates:remaining>Math.max(50,energy*.08),damageMultiplier:Math.max(0,Math.min(.9,remaining/Math.max(1,energy)*profile.retention)),remainingEnergy:Math.max(0,remaining)};
}
export function blastImpact(material,distance,power,incidence=1){
 const p=typeof material==='string'?physicalMaterial(material):material;
 return power*p.blastScale/(1+(Math.max(0,distance)/p.blastReach)**2)*(.5+.5*Math.abs(incidence));
}

export function propBlastImpact(material,distance,power,container,localOrigin){
 const pressure=blastImpact(material,distance,power);
 if(!container||!['x','y','z'].every((axis,i)=>localOrigin[axis]>=container.min[i]&&localOrigin[axis]<=container.max[i]))return pressure;
 // A small hollow shell receives pressure across its interior. Use its volume
 // for pressure retention instead of treating the far side as a distant wall.
 const volume=container.max.reduce((v,n,i)=>v*Math.max(.001,n-container.min[i]),1),reach=Math.cbrt(volume)*.5;
 return Math.max(pressure,blastImpact(material,reach,power))*2;
}

// Thin brittle shells fail across an area under blast pressure, rather than
// receiving a bullet-sized crater. Thick masonry retains its local chip logic.
// Strength already contains distance loss and pre-blast cover transmission.
export function brittleBlastFracture(material,thickness,strength,container=false){
 const p=typeof material==='string'?physicalMaterial(material):material;
 if(container&&p.response==='brittle'&&thickness<=.18){
  if(strength>=p.fracture*1.05*Math.max(.6,thickness/.08))return{shatter:true};
  if(strength>=15)return{radius:Math.min(.85,.1+.4*Math.sqrt(strength/p.fracture)),depth:Math.min(thickness*1.8,.025+thickness*strength/p.fracture)};
  return null;
 }
 if(p.response!=='brittle'||thickness>.18||strength<p.fracture*.5*Math.max(.6,thickness/.08))return null;
 return{radius:Math.min(1.1,.3+.5*Math.sqrt(strength/p.fracture)),depth:Math.max(.06,thickness*1.8)};
}
