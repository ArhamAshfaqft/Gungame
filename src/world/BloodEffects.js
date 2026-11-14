import * as THREE from 'three';
import {projectSurfaceMark,projectFloorMark,removeSurfaceMark,surfaceRevision} from './SurfaceDecal.js';

// Visual effects only: no extra rigid bodies, collision pairs or lights.
export function bloodImpactProfile(weapon='pistol',damage=34,distance=0){
 const strength=weapon==='primary'?1:weapon==='frag'?.85:weapon==='assault'?.55:.35;
 const energy=THREE.MathUtils.clamp(strength*(1-Math.min(distance,160)/240)*Math.sqrt(Math.max(1,damage)/34),.2,1.4);
 return {size:.12+energy*.2,count:Math.round(7+energy*10),speed:1+energy*1.8,reach:1.2+energy*2};
}
function bloodTexture(pool=false,seed=1){
 const size=128,data=new Uint8Array(size*size*4),spots=[];
 let state=seed;const random=()=>{state=(state*1664525+1013904223)>>>0;return state/4294967296;};
 const phase=random()*6.28,stretch=.75+random()*.5,lobes=Array.from({length:7},()=>random()*6.28);
 for(let i=0;i<22;i++){const angle=random()*Math.PI*2,r=.38+random()*.52;spots.push([Math.cos(angle)*r,Math.sin(angle)*r,.015+random()*.045]);}
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  const dx=(x+.5)/size*2-1,dy=(y+.5)/size*2-1,r=Math.hypot(dx*stretch,dy/stretch),a=Math.atan2(dy,dx)+phase;
  const edge=(pool?.6:.34)+.09*Math.sin(a*3+lobes[0])+.065*Math.sin(a*5+lobes[1])+.04*Math.sin(a*9+lobes[2])+(!pool?.12*Math.pow(Math.max(0,Math.sin(a*11+lobes[3])),6):0);
  let alpha=THREE.MathUtils.clamp((edge-r)*50,0,1);
  if(!pool)for(const [sx,sy,sr]of spots)alpha=Math.max(alpha,THREE.MathUtils.clamp((sr-Math.hypot(dx-sx,dy-sy))*100,0,1));
  const i=(y*size+x)*4,tone=1-.3*Math.min(1,r/.7);data[i]=Math.round(104*tone);data[i+1]=5;data[i+2]=9;data[i+3]=Math.round(alpha*235);
 }
 const texture=new THREE.DataTexture(data,size,size);texture.colorSpace=THREE.SRGBColorSpace;texture.needsUpdate=true;return texture;
}
function streakTexture(){
 const width=64,height=128,data=new Uint8Array(width*height*4);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const u=(x+.5)/width,v=(y+.5)/height;let alpha=0;
  for(const [center,thickness,phase]of [[.3,.065,0],[.52,.12,2],[.76,.035,4]]){
   const path=center+.022*Math.sin(v*11+phase),radius=thickness*(.65+.35*v);
   alpha=Math.max(alpha,THREE.MathUtils.clamp((radius-Math.abs(u-path))*150,0,1));
  }
  const i=(y*width+x)*4;data[i]=78;data[i+1]=4;data[i+2]=8;data[i+3]=Math.round(alpha*245);
 }
 const texture=new THREE.DataTexture(data,width,height);texture.colorSpace=THREE.SRGBColorSpace;texture.needsUpdate=true;return texture;
}
export class BloodEffects{
 constructor(scene){
  this.scene=scene;this.marks=[];this.pending=[];this.streams=[];this.landings=[];this.wounds=new WeakMap();this.cursor=0;this.textures=[3,17,41,71,113,191].map(seed=>bloodTexture(false,seed));this.textures.push(...[9,29,83,137,211,307].map(seed=>bloodTexture(true,seed)));
  this.streakTexture=streakTexture();
  this.splatMaterials=this.textures.slice(0,6).map(map=>new THREE.MeshBasicMaterial({map,transparent:true,alphaTest:.04,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-3}));
  this.capacity=192;this.next=0;this.active=0;
  this.positions=new Float32Array(this.capacity*3);this.positions.fill(-10000);this.velocities=new Float32Array(this.capacity*3);this.life=new Float32Array(this.capacity);
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(this.positions,3).setUsage(THREE.DynamicDrawUsage));
  this.drops=new THREE.Points(geometry,new THREE.PointsMaterial({map:this.textures[0],color:0xb63b3b,size:.035,transparent:true,alphaTest:.08,depthWrite:false}));
  this.drops.frustumCulled=false;this.drops.visible=false;scene.add(this.drops);
 }
 targets(){const meshes=[];this.scene.traverseVisible(o=>{if(o.isMesh&&!o.isSkinnedMesh&&o.userData.isShootable&&!o.userData.bot&&!o.userData.waterBody&&!o.userData.waterSystem)meshes.push(o);});return meshes;}
 surface(origin,direction,range,targets){
  const ray=new THREE.Raycaster(origin,direction,.015,range);
  return ray.intersectObjects(targets.filter(m=>!m.userData.bot&&!m.isSkinnedMesh&&m.visible&&!m.userData.waterBody&&!m.userData.waterSystem),false)[0];
 }
 hit(point,direction,weapon,damage,distance=0,targets=null){
  if(!point?.isVector3||!direction?.lengthSq())return;
  const profile=bloodImpactProfile(weapon,damage,distance),axis=direction.clone().normalize();
  for(let j=0;j<profile.count;j++){
   const i=this.next++%this.capacity,o=i*3,v=axis.clone().multiplyScalar(profile.speed*(.35+Math.random()*.65));
   v.x+=(Math.random()-.5)*1.4;v.y+=(Math.random()-.25)*1.4;v.z+=(Math.random()-.5)*1.4;
   point.toArray(this.positions,o);v.toArray(this.velocities,o);if(!this.life[i])this.active++;this.life[i]=.12+Math.random()*.16;
  }
  this.drops.visible=true;
  // One projection per hit. Distant walls receive no arbitrary blood marks.
  const hit=this.surface(point.clone().addScaledVector(axis,.04),axis,profile.reach,targets||this.targets());
  if(hit)this.mark(hit,profile.size*(1+hit.distance*.12),false);
 }
 wound(bot,point,weapon,damage){
  if(!point?.isVector3||!bot.rig)return;
  bot.model.updateMatrixWorld(true);
  const names=['Head','Neck','Spine2','Spine1','Hips','LeftArm','LeftForeArm','LeftHand','RightArm','RightForeArm','RightHand','LeftUpLeg','LeftLeg','LeftFoot','RightUpLeg','RightLeg','RightFoot'];
  let bone=null,best=Infinity;
  for(const name of names){const candidate=bot.rig.bones[name];if(!candidate)continue;const distance=candidate.getWorldPosition(new THREE.Vector3()).distanceToSquared(point);if(distance<best){best=distance;bone=candidate;}}
  if(!bone)return;
  const list=this.wounds.get(bot)||[];
  list.push({bone,local:bone.worldToLocal(point.clone()),weapon,damage});if(list.length>3)list.shift();this.wounds.set(bot,list);
 }
 clearWounds(bot){this.wounds.delete(bot);}
 death(bot){
  if(this.pending.some(entry=>entry.bot===bot))return;
  // Follow the last wounds in bone-local space as the ragdoll falls.
  const wounds=(this.wounds.get(bot)||[]).slice(-2);
  for(const wound of wounds)this.pending.push({bot,wound,age:0});
 }
 drop(point,velocity,life){
  const i=this.next++%this.capacity,o=i*3;point.toArray(this.positions,o);velocity.toArray(this.velocities,o);if(!this.life[i])this.active++;this.life[i]=life;this.drops.visible=true;
 }
 overflow(hit,size,targets){
  if(this.streams.length>=8)return;
  const mesh=hit.object,box=new THREE.Box3().setFromObject(mesh),point=hit.point;
  // Only overflow a nearby edge of the supporting surface, never through its centre.
  const edges=[['x',box.min.x,-1],['x',box.max.x,1],['z',box.min.z,-1],['z',box.max.z,1]].sort((a,b)=>Math.abs(point[a[0]]-a[1])-Math.abs(point[b[0]]-b[1]));
  const [axis,value,sign]=edges[0];if(Math.abs(point[axis]-value)>size*.48)return;
  const edge=point.clone();edge[axis]=value+sign*.04;edge.y+=.025;
  const landing=this.surface(edge,new THREE.Vector3(0,-1,0),4,targets);
  if(!landing||landing.point.y>point.y-.18||landing.face.normal.clone().applyNormalMatrix(new THREE.Matrix3().getNormalMatrix(landing.object.matrixWorld)).y<.9)return;
  const normal=new THREE.Vector3();normal[axis]=sign;
  const sideOrigin=edge.clone().addScaledVector(normal,.08);sideOrigin.y=point.y-.025;
  const sideHit=this.surface(sideOrigin,normal.clone().negate(),.2,[mesh]);
  let bottom=edge.clone();
  if(sideHit){
   // Project onto real vertical triangles so thin tabletops get a short stain,
   // while cabinet sides can carry a longer trail. Nothing floats below the wood.
   const height=Math.min(.65,Math.max(.035,point.y-box.min.y));
   const center=sideHit.point.clone();center.y=point.y-height*.5;
   this.mark({...sideHit,point:center},.19,false,{streak:true,height:height+.025});
   bottom.y=point.y-height+.008;
  }
  this.streams.push({mesh,revision:surfaceRevision(mesh),edge:mesh.worldToLocal(bottom),landing,remaining:9,next:1.6,pool:null});
 }

 mark(hit,size,pool,options={}){
  const mesh=hit.object;if(!hit.face)return;
  mesh.updateWorldMatrix(true,false);
  const normal=hit.face.normal.clone().applyNormalMatrix(new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld)).normalize();
  if(pool&&normal.y<.9)return;
  const rotation=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,0,1),normal).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),options.streak?0:Math.random()*Math.PI*2));
  let material=this.splatMaterials[Math.floor(Math.random()*this.splatMaterials.length)],growth=null;
  if(pool||options.streak){
   material=new THREE.MeshBasicMaterial({map:options.streak?this.streakTexture:this.textures[6+Math.floor(Math.random()*6)],transparent:true,alphaTest:.04,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-3});
   growth={value:.04};material.onBeforeCompile=shader=>{shader.uniforms.bloodGrowth=growth;shader.fragmentShader='uniform float bloodGrowth;\n'+shader.fragmentShader;shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>','#include <map_fragment>\n diffuseColor.a *= 1.0-smoothstep(bloodGrowth-.08,bloodGrowth,'+(options.streak?'1.0-vMapUv.y':'length(vMapUv-vec2(.5))*2.0')+');');};
   material.customProgramCacheKey=()=> options.streak?'blood-streak-growth-v1':'blood-pool-growth-v1';
  }
  const decal=new THREE.Mesh(new THREE.BufferGeometry(),material);decal.renderOrder=2;
  const entry={mesh,decal,local:mesh.worldToLocal(hit.point.clone()),rotation:mesh.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(rotation),size:new THREE.Vector3(size*(.8+Math.random()*.4),options.height||size*(.8+Math.random()*.4),.055),pool,streak:!!options.streak,growth,age:0};
  if(!(pool?projectFloorMark(entry):projectSurfaceMark(entry))){decal.geometry.dispose();if(pool||options.streak)material.dispose();return;}
  if(this.marks.length>=72)this.remove(this.marks.shift());this.marks.push(entry);return entry;
 }
 remove(entry){removeSurfaceMark(entry);if(entry.pool||entry.streak)entry.decal.material.dispose();}
 update(delta){
  const dt=Math.min(delta,.05);
  if(this.active){for(let i=0;i<this.capacity;i++){if(!this.life[i])continue;const o=i*3;this.life[i]=Math.max(0,this.life[i]-dt);if(!this.life[i]){this.positions[o+1]=-10000;this.active--;continue;}this.velocities[o+1]-=9.81*dt;for(let a=0;a<3;a++)this.positions[o+a]+=this.velocities[o+a]*dt;}this.drops.geometry.attributes.position.needsUpdate=true;this.drops.visible=this.active>0;}
  let projected=false;
  for(let i=this.pending.length-1;i>=0;i--){const entry=this.pending[i],bot=entry.bot;entry.age+=dt;if(bot.isAlive){this.pending.splice(i,1);continue;}if(projected||!bot.ragdoll?.sleeping&&entry.age<3)continue;
   const point=entry.wound.bone.localToWorld(entry.wound.local.clone()),targets=this.targets();
   const hit=this.surface(point.clone().add(new THREE.Vector3(0,.06,0)),new THREE.Vector3(0,-1,0),2.4,targets);
   if(hit){const size=(entry.wound.weapon==='primary'?1.15:.9)*(.9+Math.random()*.3);this.mark(hit,size,true);this.overflow(hit,size,targets);}this.pending.splice(i,1);projected=true;
  }
  for(let i=this.streams.length-1;i>=0;i--){const stream=this.streams[i];stream.next-=dt;
   if(!stream.mesh.visible||stream.revision!==surfaceRevision(stream.mesh)){this.streams.splice(i,1);continue;}
   if(stream.next>0)continue;
   const start=stream.mesh.localToWorld(stream.edge.clone()),height=start.y-stream.landing.point.y;
   if(height>.1){const duration=Math.sqrt(2*height/9.81);this.drop(start,new THREE.Vector3(0,0,0),duration);this.landings.push({hit:stream.landing,time:duration,revision:surfaceRevision(stream.landing.object),size:.38+Math.random()*.1,stream});}
   stream.remaining--;stream.next=.38+Math.random()*.4;if(!stream.remaining)this.streams.splice(i,1);
  }
  for(let i=this.landings.length-1;i>=0;i--){const landing=this.landings[i];landing.time-=dt;if(landing.time>0)continue;
   if(landing.hit.object.visible&&surfaceRevision(landing.hit.object)===landing.revision&&!landing.stream.pool)landing.stream.pool=this.mark(landing.hit,landing.size,true);this.landings.splice(i,1);
  }
  for(const entry of this.marks){if(entry.growth){entry.age+=dt;entry.growth.value=Math.min(1,.04+entry.age/(entry.streak?1.6:7));if(entry.growth.value===1)entry.growth=null;}}
  // Check one retained decal per frame; reclip when its supporting surface breaks.
  if(this.marks.length){this.cursor%=this.marks.length;const entry=this.marks[this.cursor++];if(!entry.mesh.visible||entry.revision!==surfaceRevision(entry.mesh)||entry.sourceIndex!==entry.mesh.geometry.index||entry.sourcePositions!==entry.mesh.geometry.attributes.position){if(!entry.mesh.visible||!(entry.pool?projectFloorMark(entry):projectSurfaceMark(entry))){this.remove(entry);this.marks.splice(this.cursor-1,1);this.cursor--;}}}
 }
 dispose(){for(const entry of this.marks)this.remove(entry);this.marks=[];this.pending=[];this.streams=[];this.landings=[];this.drops.removeFromParent();this.drops.geometry.dispose();this.drops.material.dispose();for(const material of this.splatMaterials)material.dispose();for(const texture of this.textures)texture.dispose();this.streakTexture.dispose();}
}
