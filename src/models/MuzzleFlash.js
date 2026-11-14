import * as T from 'three';

let texture;
function flashTexture(){
 if(texture)return texture;
 const size=64,data=new Uint8Array(size*size*4);
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  const dx=(x+.5)/size*2-1,dy=(y+.5)/size*2-1,r=Math.hypot(dx,dy),a=Math.atan2(dy,dx);
  const edge=.47+.23*Math.pow(Math.abs(Math.cos(3*a+.4)),9)+.16*Math.pow(Math.abs(Math.sin(5*a)),15);
  const alpha=Math.max(0,1-r/edge),i=(y*size+x)*4;
  data[i]=255;data[i+1]=Math.round(105+150*Math.max(0,1-r*2));data[i+2]=Math.round(25+205*Math.max(0,1-r*3));data[i+3]=Math.round(255*alpha*alpha);
 }
 texture=new T.DataTexture(data,size,size);texture.needsUpdate=true;texture.colorSpace=T.SRGBColorSpace;return texture;
}

export function attachMuzzleFlash(model,slot){
 if(model.userData.shotFlash)return model.userData.shotFlash.sprite;
 model.updateWorldMatrix(true,true);
 const inverse=model.matrixWorld.clone().invert(),points=[];let front=Infinity;
 model.traverse(mesh=>{if(!mesh.isMesh||!mesh.visible)return;
  const position=mesh.geometry.attributes.position,matrix=inverse.clone().multiply(mesh.matrixWorld);
  for(let i=0;i<position.count;i++){const p=new T.Vector3().fromBufferAttribute(position,i).applyMatrix4(matrix);points.push(p);front=Math.min(front,p.z);}
 });
 const tip=points.filter(p=>p.z<front+.008),origin=new T.Vector3();for(const p of tip)origin.add(p);origin.divideScalar(Math.max(1,tip.length));origin.z=front-.025;
 const material=new T.SpriteMaterial({map:flashTexture(),transparent:true,depthWrite:false,blending:T.AdditiveBlending,toneMapped:false});
 const sprite=new T.Sprite(material);sprite.name='Brief muzzle gas flash';sprite.position.copy(origin);sprite.visible=false;model.add(sprite);
 model.userData.shotFlash={sprite,slot,shot:0};return sprite;
}

export function updateMuzzleFlash(model,elapsed,active){
 const flash=model?.userData.shotFlash;if(!flash)return;
 const {sprite,slot}=flash,duration=slot==='primary'?.045:.03;
 const visible=active&&elapsed>=0&&elapsed<duration;
 if(visible&&!sprite.visible){flash.shot++;sprite.material.rotation=flash.shot*2.39996;}
 sprite.visible=visible;
 if(!visible)return;
 const fade=1-elapsed/duration,size=(slot==='primary'?.17:slot==='assault'?.105:.085)*(1+.13*Math.sin(flash.shot*7));
 sprite.scale.set(size*(.7+.3*fade),size,1);sprite.material.opacity=fade*.9;
}

export function muzzleWorldPosition(model,target=new T.Vector3()){
 const muzzle=model?.userData.shotFlash?.sprite;if(!muzzle)return null;
 muzzle.updateWorldMatrix(true,false);return muzzle.getWorldPosition(target);
}
