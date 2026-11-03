import {Box3} from 'three';
const caches=new WeakMap();
export function dirtyShadowRegion(map,mesh,region=null){
 if(region){(map.motionShadowBounds??=new Box3()).union(region);return;}
 mesh.updateWorldMatrix(true,false);if(!mesh.geometry.boundingBox)mesh.geometry.computeBoundingBox();
 (map.motionShadowBounds??=new Box3()).union(mesh.geometry.boundingBox.clone().applyMatrix4(mesh.matrixWorld));
}

// Re-render every relevant shadow at full quality. A moving object outside a
// light's entire shadow frustum cannot change that light's cached depth map.
export function updateShadowCache(renderer,scene,full=false,motionBounds=null){
 let lights=caches.get(scene);
 if(!lights||full){lights=[];scene.traverse(light=>{if(light.isLight&&light.castShadow){if(light.shadow.autoUpdate)light.shadow.needsUpdate=true;light.shadow.autoUpdate=false;lights.push(light);}});caches.set(scene,lights);full=true;}
 if(!full&&(!motionBounds||motionBounds.isEmpty()))return 0;
 let updated=0;
 for(const light of lights){
  let relevant=full||light.isPointLight;
  if(!relevant){light.updateWorldMatrix(true,false);light.target?.updateWorldMatrix(true,false);light.shadow.updateMatrices(light);relevant=light.shadow.getFrustum().intersectsBox(motionBounds);}
  if(relevant){light.shadow.needsUpdate=true;updated++;}
 }
 if(updated)renderer.shadowMap.needsUpdate=true;return updated;
}
