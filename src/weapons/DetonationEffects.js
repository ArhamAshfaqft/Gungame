import * as T from 'three';
import {seededRandom} from '../world/FractureGeometry.js';

// Fixed GPU particle pool: one draw call, no particle collisions, no per-frame
// geometry allocations or lights. New bursts overwrite the oldest slots.
export class DetonationEffects{
 constructor(scene,capacity=96){
  this.scene=scene;this.capacity=capacity;this.cursor=0;this.time=0;this.until=0;
  const geometry=new T.PlaneGeometry(1,1);this.attributes={};
  for(const [name,size] of [['origin',3],['velocity',3],['timing',4]]){const attribute=new T.InstancedBufferAttribute(new Float32Array(capacity*size),size);attribute.setUsage(T.DynamicDrawUsage);geometry.setAttribute('fx'+name,attribute);this.attributes[name]=attribute;}
  for(let i=0;i<capacity;i++)this.attributes.timing.setXYZW(i,-1000,1,0,0);
  this.material=new T.ShaderMaterial({transparent:true,depthWrite:false,uniforms:{time:{value:0}},vertexShader:`
   uniform float time;attribute vec3 fxorigin,fxvelocity;attribute vec4 fxtiming;varying vec2 vUv;varying float vAlpha,vKind;
   void main(){float age=time-fxtiming.x,life=fxtiming.y,t=age/life;vUv=uv;vKind=fxtiming.w;
    if(age<0.||t>=1.){vAlpha=0.;gl_Position=vec4(2.,2.,2.,1.);return;}
    vec3 p=fxorigin+fxvelocity*age;p.y-=age*age*mix(.7,4.9,vKind);
    vec4 view=viewMatrix*vec4(p,1.);float size=fxtiming.z*mix(.5+t*2.5,1.-t*.6,vKind);view.xy+=position.xy*size;
    vAlpha=(1.-t)*(1.-t)*mix(.28,1.,vKind);gl_Position=projectionMatrix*view;
   }`,fragmentShader:`varying vec2 vUv;varying float vAlpha,vKind;void main(){float r=length(vUv-.5)*2.;float a=pow(max(0.,1.-r),1.3)*vAlpha;if(a<.004)discard;gl_FragColor=vec4(mix(vec3(.27,.24,.2),vec3(1.,.77,.4),vKind),a);#include <tonemapping_fragment>
   #include <colorspace_fragment>
   }`.replace(';#include',';\n#include')});
  this.mesh=new T.InstancedMesh(geometry,this.material,capacity);this.mesh.frustumCulled=false;this.mesh.visible=false;this.mesh.userData.ssao=false;scene.add(this.mesh);
 }
 burst(type,point){
  const random=seededRandom(1234+this.cursor),count=type==='flash'?5:24;
  for(let i=0;i<count;i++){
   const index=this.cursor++%this.capacity,angle=random()*Math.PI*2,spark=type==='flash'||i<6,speed=(spark?3:1.2)*(random()+.5),life=spark?.12+random()*.18:.8+random()*.45;
   this.attributes.origin.setXYZ(index,point.x,point.y+.05,point.z);
   this.attributes.velocity.setXYZ(index,Math.cos(angle)*speed,.6+random()*(spark?2.8:1.8),Math.sin(angle)*speed);
   this.attributes.timing.setXYZW(index,this.time,life,spark?.025+random()*.025:.8+random()*.6,spark?1:0);
   this.until=Math.max(this.until,this.time+life);
  }
  for(const attribute of Object.values(this.attributes))attribute.needsUpdate=true;this.mesh.visible=true;
 }
 update(delta){this.time+=delta;this.material.uniforms.time.value=this.time;this.mesh.visible=this.time<this.until;}
 warm(renderer,camera){
  const scene=new T.Scene(),mesh=this.mesh.clone(),target=new T.WebGLRenderTarget(1,1),previous=renderer.getRenderTarget();mesh.visible=true;scene.add(mesh);
  renderer.setRenderTarget(target);renderer.render(scene,camera);renderer.setRenderTarget(previous);mesh.dispose();target.dispose();
 }
}
