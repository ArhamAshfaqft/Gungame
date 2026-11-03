import * as T from 'three';
import {DebrisPool} from '../world/DebrisPool.js';
import {supportCandidates} from '../world/SupportIndex.js';
import {soundEngine} from '../audio/SoundEngine.js';
const V=(x=0,y=0,z=0)=>new T.Vector3(x,y,z),CELL=.4;
const revision=mesh=>`${Number(mesh.visible)}:${mesh.geometry.uuid}:${mesh.geometry.index?.version||0}:${mesh.geometry.attributes.position.version}`;

export class LiquidSystem{
 constructor(map,{maxCells=768}={}){
  this.map=map;this.scene=map.scene;this.bodies=[];this.cells=new Map();this.maxCells=maxCells;this.time=0;this.clock=0;this.flowCache=new Map();this.spilled=0;this.floorCursor=0;
  const material=new T.MeshPhysicalMaterial({color:0x77afbb,roughness:.12,metalness:.1,transparent:true,opacity:.7,depthWrite:false});
  this.drops=new DebrisPool(this.scene,new T.SphereGeometry(1,4,3),material,160,{gravity:9.81,drag:.4,groundHeight:(p,c)=>map.rubbleFloor(p,c),supportInterval:.12});
  const ringMaterial=new T.MeshBasicMaterial({color:0xcce9e8,transparent:true,opacity:.42,side:T.DoubleSide,depthWrite:false});
  this.rings=new T.InstancedMesh(new T.RingGeometry(.89,1,32),ringMaterial,48);this.rings.instanceMatrix.setUsage(T.DynamicDrawUsage);this.rings.count=0;this.rings.frustumCulled=false;this.scene.add(this.rings);this.ripples=[];
  const wetMaterial=new T.MeshPhysicalMaterial({color:0x213e42,roughness:.16,metalness:0,clearcoat:.8,ior:1.33,transparent:true,opacity:.3,depthWrite:false,side:T.DoubleSide,polygonOffset:true,polygonOffsetFactor:-1});
  wetMaterial.onBeforeCompile=shader=>{shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>','#include <color_fragment>\ndiffuseColor.a *= 1.0-smoothstep(0.29,0.5,length(vUv-0.5));');};
  // UVs are used by the soft puddle edge even before a normal map is available.
  wetMaterial.defines={USE_UV:''};
  this.puddles=new T.InstancedMesh(new T.CircleGeometry(.31,16),wetMaterial,maxCells);this.puddles.instanceMatrix.setUsage(T.DynamicDrawUsage);this.puddles.frustumCulled=false;this.puddles.count=0;this.scene.add(this.puddles);
  this.puddles.userData={water:true,isShootable:true,waterSystem:this};
 }
 add(mesh,options={}){const body=new WaterBody(this,mesh,options);this.bodies.push(body);mesh.userData.waterBody=body;mesh.userData.water=true;mesh.userData.isShootable=true;this.puddles.material.normalMap=mesh.material.normalMap;this.puddles.material.normalScale.set(.12,.12);this.puddles.material.needsUpdate=true;return body;}
 splash(point,strength=34){
  const count=Math.min(24,6+Math.round(Math.sqrt(strength)*1.1));
  for(let i=0;i<count;i++){const a=Math.random()*Math.PI*2,speed=.5+Math.random()*Math.sqrt(strength)*.12,s=.009+Math.random()*.009;
   this.drops.spawn(point,V(Math.cos(a)*speed,1+Math.random()*Math.sqrt(strength)*.22,Math.sin(a)*speed),new T.Matrix4().makeScale(s,s*1.7,s),V(),.6+Math.random()*.5);
  }
  this.ripples.push({point:point.clone(),age:0,strength:Math.min(1,strength/100)});if(this.ripples.length>48)this.ripples.shift();soundEngine.playWaterImpact?.(strength);
 }
 explosion(point,radius,power=330){for(const body of this.bodies){const p=body.mesh.position.clone();p.x=T.MathUtils.clamp(point.x,body.x-body.width/2,body.x+body.width/2);p.z=T.MathUtils.clamp(point.z,body.z-body.depth/2,body.z+body.depth/2);p.y=body.level;const d=p.distanceTo(point);if(d<radius)body.impact(p,power/(1+d*d));}}
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
  this.ripples=this.ripples.filter(r=>{r.age+=dt;return r.age<1.2;});count=0;
  for(const r of this.ripples){const size=.04+r.age*(.7+r.strength*.7);matrix.compose(r.point.clone().add(V(0,.006,0)),rotation,V(size,size,1));this.rings.setMatrixAt(count++,matrix);}
  this.rings.count=count;if(count)this.rings.instanceMatrix.needsUpdate=true;
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
 impact(point,strength){const local=this.mesh.worldToLocal(point.clone());this.rippleUniform[this.rippleCursor++%8].set(local.x,local.y,this.system.time,Math.min(.075,.006+strength*.0002));this.system.splash(V(point.x,this.level,point.z),strength);}
 inspectLeaks(){
  this.leaks=[];
  for(const wall of this.walls){
   if(wall.visible&&!wall.userData.fractureSolids)continue;
   wall.updateWorldMatrix(true,false);if(!wall.geometry.boundingBox)wall.geometry.computeBoundingBox();const box=wall.geometry.boundingBox.clone().applyMatrix4(wall.matrixWorld),size=box.getSize(V()),center=box.getCenter(V()),axis=size.x>size.z?'x':'z',normal=axis==='x'?V(0,0,Math.sign(center.z-this.z)):V(Math.sign(center.x-this.x),0,0),width=size[axis],cols=Math.min(48,Math.ceil(width/.08)),rows=Math.ceil((this.initialLevel-this.bottom)/.045);let count=0,sum=V(),sill=Infinity;
   for(let col=0;col<cols;col++)for(let row=0;row<rows;row++){
    const p=center.clone();p[axis]=box.min[axis]+width*(col+.5)/cols;p.y=this.bottom+(this.initialLevel-this.bottom)*(row+.5)/rows;
    const ray=new T.Raycaster(p.clone().addScaledVector(normal,-.3),normal,0,.6);ray.layers.enableAll();
    if(!wall.visible||!ray.intersectObject(wall,false).length){count++;sum.add(p);sill=Math.min(sill,p.y-(this.initialLevel-this.bottom)/rows/2);}
   }
   if(count){const point=sum.multiplyScalar(1/count);this.leaks.push({point,normal,sill,area:count*width/cols*(this.initialLevel-this.bottom)/rows,wall});}
  }
 }
 update(dt){
  this.timeUniform.value=this.system.time;this.clock+=dt;
  if(this.clock>.2){this.clock=0;const signature=this.walls.map(revision).join('|');if(signature!==this.wallRevision){this.wallRevision=signature;this.inspectLeaks();}}
  for(let i=0;i<this.leaks.length;i++){
   const leak=this.leaks[i],head=Math.max(0,this.level-leak.sill),flow=.62*leak.area*Math.sqrt(2*9.81*head),amount=Math.min(this.volume,head*this.area,flow*dt);
   if(amount<=0){if(this.streams[i])this.streams[i].visible=false;continue;}
   this.volume-=amount;this.level=this.bottom+this.volume/this.area;
   const start=leak.point.clone();start.y=Math.min(this.level,Math.max(leak.sill+.015,leak.point.y));
   const speed=Math.sqrt(2*9.81*head),fallTime=Math.sqrt(Math.max(.01,2*(start.y-this.floor)/9.81)),reach=Math.min(.9,speed*fallTime),outside=leak.point.clone().addScaledVector(leak.normal,Math.max(.14,reach));outside.y=this.floor;this.system.spill(outside,amount);
   if(!this.streams[i]){
    const stream=new T.Group(),material=this.streamMaterial();
    const geometry=new T.CylinderGeometry(1,1,1,8);for(let n=0;n<5;n++)stream.add(new T.Mesh(geometry,material));this.system.scene.add(stream);this.streams[i]=stream;
   }
   const stream=this.streams[i];stream.visible=true;
   const sample=t=>start.clone().addScaledVector(leak.normal,Math.max(.14,reach)*t).add(V(0,-.5*9.81*(fallTime*t)**2,0));
   for(let n=0;n<5;n++){const a=sample(n/5),b=sample((n+1)/5),delta=b.clone().sub(a),segment=stream.children[n],radius=Math.min(.055,.006+Math.sqrt(flow)*.12)*(1-n*.06);segment.position.copy(a).lerp(b,.5);segment.quaternion.setFromUnitVectors(V(0,1,0),delta.normalize());segment.scale.set(radius,a.distanceTo(b)+.003,radius);}
  }
  for(let i=this.leaks.length;i<this.streams.length;i++)this.streams[i].visible=false;
  this.mesh.position.y=this.level;this.mesh.visible=this.volume>.0001;
  if(this.gameplayArea)this.gameplayArea.surface=this.level;
 }
}
