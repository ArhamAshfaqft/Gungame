import * as THREE from 'three';
export const PAINTINGS=['mountain-lake','coastal-harbour','floral-still-life','woodland-path'];
export function paintingMaterial(map,index,width,height){
 map.paintingTextures??=new Map();map.paintingMaterials??=new Map();
 const name=PAINTINGS[index%PAINTINGS.length],key=`${name}:${width/height}`;
 if(map.paintingMaterials.has(key))return map.paintingMaterials.get(key);
 let texture=map.paintingTextures.get(name);
 if(!texture){texture=new THREE.TextureLoader().load(`/assets/paintings/${name}.webp`);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=4;map.paintingTextures.set(name,texture);}
 const material=new THREE.MeshStandardMaterial({map:texture,roughness:.96,side:THREE.DoubleSide});
 const fit=new THREE.Vector2(.92,.84),ratio=width*fit.x/(height*fit.y),imageRatio=1.5,crop=new THREE.Vector2(Math.min(1,ratio/imageRatio),Math.min(1,imageRatio/ratio));
 // Centre-crop within a slim cream mount without stretching the brushwork.
 // One plane and one draw, with shared image textures across the entire villa.
 material.onBeforeCompile=shader=>{
  shader.uniforms.paintingFit={value:fit};shader.uniforms.paintingCrop={value:crop};
  shader.fragmentShader='uniform vec2 paintingFit; uniform vec2 paintingCrop;\n'+shader.fragmentShader;
  shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`
   vec2 paintingUv=(vMapUv-vec2(0.5))/paintingFit+vec2(0.5);
   bool insidePainting=all(greaterThanEqual(paintingUv,vec2(0.0)))&&all(lessThanEqual(paintingUv,vec2(1.0)));
   diffuseColor.rgb*=insidePainting?texture2D(map,clamp((paintingUv-vec2(0.5))*paintingCrop+vec2(0.5),vec2(0.0),vec2(1.0))).rgb:vec3(0.82,0.78,0.68);
  `);
 };
 material.customProgramCacheKey=()=> 'solstice-oil-painting-mount-v1';
 map.paintingMaterials.set(key,material);return material;
}
