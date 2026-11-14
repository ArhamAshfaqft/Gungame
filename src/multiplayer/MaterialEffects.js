import {Vector3} from 'three';
import {soundEngine} from '../audio/SoundEngine.js';

export function playMaterialEffect(effect,engine=soundEngine){
 const position=new Vector3().fromArray(effect.position);
 if(effect.kind==='glassBreak'){
  if(!engine.playSample('glassBreak',{volume:.6,position}))engine.playGlassBreak();
 }else if(effect.kind==='doorBreak')engine.playDoorBreak();
 else if(effect.kind==='doorOpen')engine.playDoorOpen();
}
export function waterImpact(mesh,impact){
 if(impact.surface!=='water')return false;
 const point=new Vector3().fromArray(impact.point);
 if(mesh?.userData.waterBody)mesh.userData.waterBody.impact(point,impact.strength||34);
 else mesh?.userData.waterSystem?.splash(point,impact.strength||34);
 return true;
}
