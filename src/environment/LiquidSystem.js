import * as T from 'three';
import {DebrisPool} from '../world/DebrisPool.js';
import {supportCandidates} from '../world/SupportIndex.js';
import {soundEngine} from '../audio/SoundEngine.js';
import {findWallLeaks,leakFlow} from './WaterLeaks.js';
const V=(x=0,y=0,z=0)=>new T.Vector3(x,y,z),CELL=.4;
const revision=mesh=>`${Number(mesh.visible)}:${mesh.geometry.uuid}:${mesh.geometry.index?.version||0}:${mesh.geometry.attributes.position.version}`;

export class LiquidSystem{
 constructor(map,{maxCells=768}={}){
  this.map=map;this.scene=map.scene;this.bodies=[];this.cells=new Map();this.maxCells=maxCells;this.time=0;this.clock=0;this.flowCache=new Map();this.spilled=0;this.floorCursor=0;
  const material=new T.MeshPhysicalMaterial({color:0xa9d4de,roughness:.12,metalness:.1,transparent:true,opacity:.85,depthWrite:false});
  this.drops=new DebrisPool(this.scene,new T.SphereGeometry(1,4,3),material,160,{gravity:9.81,drag:.4,groundHeight:(p,c)=>map.rubbleFloor(p,c),supportInterval:.12});
  const ringMaterial=new T.MeshBasicMaterial({color:0xcce9e8,transparent:true,opacity:.7,side:T.DoubleSide,depthWrite:false});
  this.rings=new T.InstancedMesh(new T.RingGeometry(.96,1,32),ringMaterial,48);this.rings.instanceMatrix.setUsage(T.DynamicDrawUsage);this.rings.count=0;this.rings.frustumCulled=false;this.scene.add(this.rings);this.ripples=[];
  // The colour shader clips each ring to its water body. The SSAO override
  // ignores that shader, so including this transparent effect there would
  // leave an opaque ring-shaped shadow on the tub walls and surrounding floor.
  this.rings.userData.ssao=false;
  this.rippleBounds=new T.InstancedBufferAttribute(new Float32Array(48*4),4);this.rippleAlpha=new T.InstancedBufferAttribute(new Float32Array(48),1);
  this.rings.geometry.setAttribute('rippleBounds',this.rippleBounds);this.rings.geometry.setAttribute('rippleAlpha',this.rippleAlpha);
  ringMaterial.onBeforeCompile=shader=>{
   shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nattribute vec4 rippleBounds; attribute float rippleAlpha; varying vec4 vBounds; varying vec3 vRippleWorld; varying float vRippleAlpha;').replace('#include <begin_vertex>','#include <begin_vertex>\nvBounds=rippleBounds; vRippleAlpha=rippleAlpha; vRippleWorld=(modelMatrix*instanceMatrix*vec4(position,1.0)).xyz;');
   shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying vec4 vBounds; varying vec3 vRippleWorld; varying float vRippleAlpha;').replace('#include <color_fragment>','#include <color_fragment>\nif(vRippleWorld.x<vBounds.x||vRippleWorld.x>vBounds.y||vRippleWorld.z<vBounds.z||vRippleWorld.z>vBounds.w)discard; diffuseColor.a*=vRippleAlpha;');
  };ringMaterial.customProgramCacheKey=()=> 'bounded-water-ripple-v1';
  const wetMaterial=new T.MeshPhysicalMaterial({color:0x213e42,roughness:.16,metalness:0,clearcoat:.8,ior:1.33,transparent:true,opacity:.3,depthWrite:false,side:T.DoubleSide,polygonOffset:true,polygonOffsetFactor:-1});
  wetMaterial.onBeforeCompile=shader=>{shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>','#include <color_fragment>\ndiffuseColor.a *= 1.0-smoothstep(0.29,0.5,length(vUv-0.5));');};
  // UVs are used by the soft puddle edge even before a normal map is available.
  wetMaterial.defines={USE_UV:''};
  this.puddles=new T.InstancedMesh(new T.CircleGeometry(.31,16),wetMaterial,maxCells);this.puddles.instanceMatrix.setUsage(T.DynamicDrawUsage);this.puddles.frustumCulled=false;this.puddles.count=0;this.scene.add(this.puddles);
  this.puddles.userData={water:true,isShootable:true,waterSystem:this};
 }
 add(mesh,options={}){const body=new WaterBody(this,mesh,options);this.bodies.push(body);mesh.userData.waterBody=body;mesh.userData.water=true;mesh.userData.isShootable=true;this.puddles.material.normalMap=mesh.material.normalMap;this.puddles.material.normalScale.set(.12,.12);this.puddles.material.needsUpdate=true;return body;}
 splash(point,strength=34,{kind='bullet',body=null}={}){
  const profiles={bullet:[20,1.6,5.8,.012,.85],grenade:[20,1.3,2,.014,.8],player:[30,2,3,.016,.85],blast:[48,3.2,5.5,.019,1.2],wade:[6,.5,.8,.008,.35]},profile=profiles[kind]||profiles.bullet;
  const bullet=kind==='bullet',energy=T.MathUtils.clamp(Math.sqrt(Math.max(1,strength)/100),bullet?.7:.5,bullet?1.35:2);
  for(let i=0;i<profile[0];i++){const a=Math.random()*Math.PI*2,speed=profile[1]*energy*(.4+Math.random()*.6),size=profile[3]*(.5+Math.random());
   this.drops.spawn(point,V(Math.cos(a)*speed,profile[2]*energy*(bullet?.65+Math.random()*.35:.5+Math.random()*.5),Math.sin(a)*speed),new T.Matrix4().makeScale(size,size*(bullet?3:2),size),V(),profile[4]+Math.random()*.25);
  }
  const bounds=body?[body.x-body.width/2,body.x+body.width/2,body.z-body.depth/2,body.z+body.depth/2]:[point.x-.2,point.x+.2,point.z-.2,point.z+.2];
  this.ripples.push({point:point.clone(),age:0,strength:Math.min(1,strength/150),bounds,body,kind});if(this.ripples.length>48)this.ripples.shift();
  // Foot-contact audio owns wading cadence; these visual ripples must not add
  // a second unsynchronised splash sound every .45 seconds.
  if(kind!=='wade')soundEngine.playWaterImpact?.(strength,kind,point);
 }
 crossing(from,to,kind='grenade',speed=3){
  for(const body of this.bodies){if(!body.mesh.visible||from.y<body.level||to.y>=body.level||from.y===to.y)continue;
   const p=from.clone().lerp(to,(from.y-body.level)/(from.y-to.y));
   if(Math.abs(p.x-body.x)<=body.width/2&&Math.abs(p.z-body.z)<=body.depth/2)body.impact(p,Math.max(20,speed*speed*3),{kind});
  }
 }
 playerContact(position,height=1.65,speed=0,dt=0){
  if(dt<=0)return;
  const foot=position.clone();foot.y-=height;this.playerSplashClock=Math.max(0,(this.playerSplashClock||0)-dt);
  if(this.playerFoot){this.crossing(this.playerFoot,foot,'player',Math.min(10,Math.abs(foot.y-this.playerFoot.y)/Math.max(.001,dt)));
   if(!this.playerSplashClock&&speed>.7){const body=this.bodies.find(b=>b.mesh.visible&&Math.abs(foot.x-b.x)<b.width/2&&Math.abs(foot.z-b.z)<b.depth/2&&foot.y>=b.bottom-.03&&foot.y<b.level&&position.y>b.bottom);if(body){body.impact(foot,18,{kind:'wade'});this.playerSplashClock=.45;}}
  }this.playerFoot=foot;
 }
 explosion(point,radius,power=330){for(const body of this.bodies){const p=body.mesh.position.clone();p.x=T.MathUtils.clamp(point.x,body.x-body.width/2,body.x+body.width/2);p.z=T.MathUtils.clamp(point.z,body.z-body.depth/2,body.z+body.depth/2);p.y=body.level;const d=p.distanceTo(point);if(d<radius&&body.mesh.visible)body.impact(p,power/(1+d*d),{kind:'blast'});}}
 getCell(point,create=true){
  const known=this.cells.get(`${Math.floor(point.x/CELL)},${Math.floor(point.z/CELL)},${Math.round(point.y*20)}`);if(known)return known;
  const x=Math.floor(point.x/CELL),z=Math.floor(point.z/CELL),floor=this.map.rubbleFloor(V((x+.5)*CELL,point.y+.1,(z+.5)*CELL),point.y+.15),key=`${x},${z},${Math.round(floor*20)}`;
  let c=this.cells.get(key);if(!c&&create&&this.cells.size<this.maxCells){c={key,x,z,floor,volume:0};this.cells.set(key,c);}return c;
 }
 spill(point,volume){const c=this.getCell(point);if(c){c.volume+=volume;this.spilled+=volume;}else if(this.cells.size){const near=[...this.cells.values()].reduce((a,b)=>Math.hypot(b.x*CELL-point.x,b.z*CELL-point.z)<Math.hypot(a.x*CELL-point.x,a.z*CELL-point.z)?b:a);near.volume+=volume;this.spilled+=volume;}}
 canFlow(a,b){
  const key=`${a.key}>${b.key}`,old=this.flowCache.get(key);if(old!==undefined)return old;
  if(b.floor>a.floor+.035){this.flowCache.set(key,false);return false;}
  const from=V((a.x+.5)*CELL,a.floor+.025,(a.z+.5)*CELL),to=V((b.x+.5)*CELL,b.floor+.025,(b.z+.5)*CELL),direction=to.clone().sub(from),ray=new T.Raycaster(from,direction.clone().normalize(),.008,direction.length()-.008);ray.layers.enableAll();
  const checked=new Set();let clear=true;
  for(const box of supportCandidates(this.map,from.clone().lerp(to,.5))){
   if(box.max.y<=Math.min(a.floor,b.floor)+.008||box.min.y>Math.max(a.floor,b.floor)+.05)continue;
   const mesh=box.supportMesh||box.villaPanel?.mesh;if(box.dynamicEnvironment||!mesh?.visible||checked.has(mesh))continue;checked.add(mesh);if(ray.intersectObject(mesh,false).length){clear=false;break;}
  }
  this.flowCache.set(key,clear);return clear;
 }
 flow(dt){
  // Moving books aren't watertight barriers. Their transforms must not discard
  // every cached wall/floor flow query each frame; structural edits still do.
  const rev=this.map.colliders.staticSupportRevision||0;if(this.flowRevision!==rev){this.flowCache.clear();this.flowRevision=rev;}
  const cells=[...this.cells.values()],changes=new Map();
  for(const c of cells){if(c.volume<.00002)continue;let remaining=c.volume;
   for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]){
    const next=this.getCell(V((c.x+dx+.5)*CELL,c.floor,(c.z+dz+.5)*CELL));if(!next||!this.canFlow(c,next))continue;
    const difference=c.floor+c.volume/(CELL*CELL)-next.floor-next.volume/(CELL*CELL);if(difference<=.0005)continue;
    const transfer=Math.min(remaining*.22,difference*CELL*CELL*dt*2.2);remaining-=transfer;changes.set(c,(changes.get(c)||0)-transfer);changes.set(next,(changes.get(next)||0)+transfer);
   }
  }
  for(const [cell,change] of changes)cell.volume=Math.max(0,cell.volume+change);
  // Recheck a bounded set of wet cells for a newly breached floor. Water can
  // descend to the next real support instead of staying suspended over a hole.
  for(let n=0;n<16&&cells.length;n++){
   const c=cells[this.floorCursor++%cells.length];if(c.volume<.00001)continue;
   const point=V((c.x+.5)*CELL,c.floor,(c.z+.5)*CELL),floor=this.map.rubbleFloor(point,c.floor+.04);
   if(floor<c.floor-.15){const volume=c.volume;c.volume=0;const lower=this.getCell(V(point.x,floor,point.z));if(lower)lower.volume+=volume;else c.volume=volume;}
  }
 }
 update(dt){
  this.time+=dt;for(const body of this.bodies)body.update(dt);this.drops.update(dt);
  this.clock+=dt;if(this.clock>=.1){this.flow(Math.min(.2,this.clock));this.clock=0;}
  const matrix=new T.Matrix4(),rotation=new T.Quaternion().setFromAxisAngle(V(1,0,0),-Math.PI/2);let count=0;
  for(const c of this.cells.values()){if(c.volume<.00001)continue;const radius=T.MathUtils.clamp(Math.sqrt(c.volume/.0006),.15,1);matrix.compose(V((c.x+.5)*CELL,c.floor+.007+Math.min(.025,c.volume/(CELL*CELL))*.1,(c.z+.5)*CELL),rotation,V(radius,radius,1));this.puddles.setMatrixAt(count++,matrix);}
  this.puddles.count=count;if(count){this.puddles.instanceMatrix.needsUpdate=true;this.puddles.boundingSphere=null;}
  this.ripples=this.ripples.filter(r=>{r.age+=dt;return r.age<1.2&&(!r.body||r.body.mesh.visible&&Math.abs(r.body.level-r.point.y)<.04);});count=0;
  for(const r of this.ripples){const bullet=r.kind==='bullet',size=.04+r.age*((bullet?1.5:.7)+r.strength*.7);matrix.compose(r.point.clone().add(V(0,.006,0)),rotation,V(size,size,1));this.rippleBounds.setXYZW(count,...r.bounds);this.rippleAlpha.setX(count,(bullet?1:.6)*(1-r.age/1.2)**2);this.rings.setMatrixAt(count++,matrix);}
  this.rings.count=count;if(count){this.rings.instanceMatrix.needsUpdate=true;this.rippleBounds.needsUpdate=true;this.rippleAlpha.needsUpdate=true;}
 }
}

export class WaterBody{
 streamMaterial(){if(!this._streamMaterial){const material=this.mesh.material.clone();material.onBeforeCompile=()=>{};material.customProgramCacheKey=()=> 'water-stream';this._streamMaterial=material;}return this._streamMaterial;}
 constructor(system,mesh,{bottom=mesh.position.y-.3,walls=[],floor=bottom,area=null}={}){
  Object.assign(this,{system,mesh,bottom,walls,floor,x:mesh.position.x,z:mesh.position.z,width:mesh.geometry.parameters.width,depth:mesh.geometry.parameters.height,level:mesh.position.y,initialLevel:mesh.position.y,leaks:[],streams:[],clock:0});
  this.area=area||this.width*this.depth;this.volume=(this.level-bottom)*this.area;this.initialVolume=this.volume;
  this.rippleUniform=Array.from({length:8},()=>new T.Vector4(0,0,-100,0));this.timeUniform={value:0};this.rippleCursor=0;
  mesh.material.onBeforeCompile=shader=>{
   shader.uniforms.waterTime=this.timeUniform;shader.uniforms.waterRipples={value:this.rippleUniform};
   shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nuniform float waterTime; uniform vec4 waterRipples[8];').replace('#include <begin_vertex>',`#include <begin_vertex>
    for(int i=0;i<8;i++){float age=waterTime-waterRipples[i].z;float d=distance(position.xy,waterRipples[i].xy);if(age>=0.0&&age<3.0)transformed.z+=sin(d*24.0-age*16.0)*waterRipples[i].w*exp(-age*2.2)*exp(-abs(d-age*1.2)*5.0);}`);
  };mesh.material.customProgramCacheKey=()=> 'interactive-water-ripples-v1';
 }
 impact(point,strength,options={}){const local=this.mesh.worldToLocal(point.clone()),bullet=!options.kind||options.kind==='bullet',amplitude=bullet?Math.min(.06,.018+strength*.0003):Math.min(.075,.006+strength*.0002);this.rippleUniform[this.rippleCursor++%8].set(local.x,local.y,this.system.time,amplitude);this.system.splash(V(point.x,this.level,point.z),strength,{...options,body:this});}
 inspectLeaks(){
  this.leakCache??=new WeakMap();this.leaks=[];
  for(const wall of this.walls){
   const signature=revision(wall),cached=this.leakCache.get(wall);
   const leaks=cached?.signature===signature?cached.leaks:findWallLeaks(this,wall);
   if(cached?.signature!==signature)this.leakCache.set(wall,{signature,leaks});
   this.leaks.push(...leaks);
  }
 }
 update(dt){
  this.timeUniform.value=this.system.time;this.clock+=dt;
  if(this.clock>.2){this.clock=0;const signature=this.walls.map(revision).join('|');if(signature!==this.wallRevision){this.wallRevision=signature;this.inspectLeaks();}}
  // Every outlet sees the same level this tick. Sum first, then drain once;
  // iterating holes must not give the last opening artificially lower pressure.
  const rates=this.leaks.map(leak=>leakFlow(leak,this.level)),total=rates.reduce((sum,r)=>sum+r.flow,0);
  const sill=this.leaks.reduce((low,l)=>Math.min(low,l.sill),this.level);
  const amount=Math.min(this.volume,Math.max(0,(this.level-sill)*this.area),total*dt),scale=total>0?amount/total:0;
  this.volume-=amount;this.level=this.bottom+this.volume/this.area;
  let count=0;this.streams=[];
  if(total>0&&!this.streamMesh){
   // 64 simultaneous outlets exceed the tub's four walls x 12 damage cuts.
   // Five short ballistic segments per outlet share one draw call and geometry.
   this.streamMesh=new T.InstancedMesh(new T.CylinderGeometry(1,1,1,6),this.streamMaterial(),64*5);
   this.streamMesh.instanceMatrix.setUsage(T.DynamicDrawUsage);this.streamMesh.frustumCulled=false;this.streamMesh.userData.ssao=false;this.streamMesh.count=0;this.system.scene.add(this.streamMesh);
   this.streamMatrix=new T.Matrix4();this.streamRotation=new T.Quaternion();
  }
  for(let i=0;i<this.leaks.length;i++){
   const leak=this.leaks[i],rate=rates[i];if(!rate.flow||!amount)continue;
   const start=rate.point.clone().addScaledVector(leak.normal,.002),speed=Math.sqrt(2*9.81*rate.head);
   const fallTime=Math.sqrt(Math.max(0,2*(start.y-this.floor)/9.81)),reach=speed*fallTime;
   const outside=start.clone().addScaledVector(leak.normal,reach);outside.y=this.floor;this.system.spill(outside,rate.flow*scale);
   this.streams.push({point:start,flow:rate.flow,head:rate.head});
   if(count>=64*5)continue;
   const sample=t=>start.clone().addScaledVector(leak.normal,reach*t).add(V(0,-.5*9.81*(fallTime*t)**2,0));
   for(let n=0;n<5;n++){
    const a=sample(n/5),b=sample((n+1)/5),length=a.distanceTo(b),direction=b.clone().sub(a).normalize();
    // Jet cross-section follows discharge; gravity stretches/thins it below.
    const radius=Math.min(.06,Math.sqrt(rate.flow/(Math.PI*Math.max(.1,speed))))*(1-n*.07);
    this.streamRotation.setFromUnitVectors(V(0,1,0),direction);
    this.streamMatrix.compose(a.lerp(b,.5),this.streamRotation,V(radius,length+.002,radius));this.streamMesh.setMatrixAt(count++,this.streamMatrix);
   }
  }
  if(this.streamMesh){this.streamMesh.count=count;this.streamMesh.visible=count>0;if(count)this.streamMesh.instanceMatrix.needsUpdate=true;}
  this.mesh.position.y=this.level;this.mesh.visible=this.volume>.0001;
  if(this.gameplayArea)this.gameplayArea.surface=this.level;
 }
}
