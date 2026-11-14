import {SSAOPass} from 'three/examples/jsm/postprocessing/SSAOPass.js';

// Hide lines, points and explicitly excluded surface effects during the normal
// pass. Avoid caching visibility for every damageable furniture part.
export class WorldSSAOPass extends SSAOPass {
 render(renderer,writeBuffer,readBuffer,delta,mask){
  if(!this.depthOnly)return super.render(renderer,writeBuffer,readBuffer,delta,mask);
  this.overrideVisibility();
  try{this.renderOverride(renderer,this.normalMaterial,this.normalRenderTarget,0x7777ff,1);}
  finally{this.restoreVisibility();}
 }
 overrideVisibility(){
  this.scene.traverseVisible(object=>{
   if(object.isPoints||object.isLine||object.userData.ssao===false){this._visibilityCache.set(object,true);object.visible=false;}
  });
 }
 restoreVisibility(){
  for(const [object,visible] of this._visibilityCache)object.visible=visible;
  this._visibilityCache.clear();
 }
}
