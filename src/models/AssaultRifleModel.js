import * as T from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import {attachHolographicSight} from './HolographicSight.js';
export {updateHolographicSight} from './HolographicSight.js';

export const ASSAULT_RIGHT_GRIP=new T.Vector3(.045,-.14,.11);
export const ASSAULT_LEFT_GRIP=new T.Vector3(-.065,-.05,-.33);
let templatePromise;
export async function loadAssaultRifleModel(){
 templatePromise??=(async()=>{
  const {scene}=await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync('/assets/weapons/m4a1.glb');
  const metal=new T.MeshStandardMaterial({color:0x30383b,metalness:.65,roughness:.4}),polymer=new T.MeshStandardMaterial({color:0x182022,metalness:.12,roughness:.75});
  scene.traverse(mesh=>{if(mesh.isMesh)mesh.material=/mesh_[235]$/.test(mesh.name)?polymer:metal;});
  for(const name of ['mag_ext','mag_ext_rounds','mag_fast','mag_fast_rounds']){const part=scene.getObjectByName(name);if(part)part.visible=false;}
  const magazine=scene.getObjectByName('mag_std'),rounds=scene.getObjectByName('mag_std_rounds');scene.updateMatrixWorld(true);if(magazine&&rounds)magazine.attach(rounds);
  scene.name='M4A1_Assault_Rifle';return scene;
 })();
 const model=(await templatePromise).clone(true),magazine=model.getObjectByName('mag_std'),carrier=model.getObjectByName('act_carrier'),handle=model.getObjectByName('act_handle');
 model.userData.triggerGrip=ASSAULT_RIGHT_GRIP.clone();model.userData.supportGrip=ASSAULT_LEFT_GRIP.clone();
 attachHolographicSight(model);
 model.userData.assaultParts={magazine,magazineRest:magazine.position.clone(),carrier,carrierRest:carrier.position.clone(),handle,handleRest:handle.position.clone()};
 return model;
}
const smooth=(a,b,t)=>T.MathUtils.smoothstep(t,a,b);
export function applyAssaultMechanics(model,reload=0,fire=0){
 const parts=model?.userData.assaultParts;if(!parts)return;
 const removal=smooth(.12,.32,reload),insertion=smooth(.5,.73,reload),drop=.23*(removal-insertion);
 parts.magazine.position.copy(parts.magazineRest);parts.magazine.position.y-=drop;parts.magazine.visible=!(reload>.32&&reload<.5);
 parts.handle.position.copy(parts.handleRest);parts.handle.position.z+=.045*Math.sin(Math.PI*smooth(.78,.94,reload));
 parts.carrier.position.copy(parts.carrierRest);parts.carrier.position.z+=fire>0?.025*Math.sin(fire*Math.PI):0;

}
export function assaultReloadMotion(progress){
 const reach=smooth(.04,.2,progress)*(1-smooth(.74,.98,progress));
 const target=new T.Vector3(-.02,-.16,-.115).sub(ASSAULT_LEFT_GRIP).multiplyScalar(reach);
 target.y-=.2*(smooth(.17,.36,progress)-smooth(.5,.7,progress));
 return {id:'assaultReload',progress,hands:{Left:{position:target,rotation:new T.Quaternion().setFromEuler(new T.Euler(0,0,-.3*reach))},Right:{position:new T.Vector3(),rotation:new T.Quaternion()}}};
}
