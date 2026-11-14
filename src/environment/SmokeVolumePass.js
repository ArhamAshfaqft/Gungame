import {ShaderMaterial,Vector3,Vector4,Matrix4,WebGLRenderTarget,NoBlending} from 'three';
import {Pass,FullScreenQuad} from 'three/examples/jsm/postprocessing/Pass.js';
import {smokeTexture} from '../weapons/SmokeCloud.js';

export const MAX_SMOKE_VOLUMES=8;
// Analytic ray/ellipsoid integration, not a ray-marched 3D simulation. Reuses the
// SSAO depth texture and runs one screen pass only while smoke is present.
export class SmokeVolumePass extends Pass{
 constructor(depth){
  super();this.enabled=false;this.needsSwap=true;
  this.material=new ShaderMaterial({depthTest:false,depthWrite:false,blending:NoBlending,uniforms:{
   tDiffuse:{value:null},tDepth:{value:depth},noiseMap:{value:smokeTexture()},inverseProjection:{value:new Matrix4()},cameraWorld:{value:new Matrix4()},count:{value:0},time:{value:0},
   centers:{value:Array.from({length:MAX_SMOKE_VOLUMES},()=>new Vector4())},radii:{value:Array.from({length:MAX_SMOKE_VOLUMES},()=>new Vector3())},clipMin:{value:Array.from({length:MAX_SMOKE_VOLUMES},()=>new Vector3())},clipMax:{value:Array.from({length:MAX_SMOKE_VOLUMES},()=>new Vector3())}
  },vertexShader:`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
  fragmentShader:`
   uniform sampler2D tDiffuse,tDepth,noiseMap;uniform mat4 inverseProjection,cameraWorld;uniform int count;uniform float time;
   uniform vec4 centers[8];uniform vec3 radii[8],clipMin[8],clipMax[8];varying vec2 vUv;
   void main(){
    vec4 scene=texture2D(tDiffuse,vUv);float depth=texture2D(tDepth,vUv).x;
    vec4 eye=inverseProjection*vec4(vUv*2.-1.,depth*2.-1.,1.);eye/=eye.w;
    vec3 origin=cameraWorld[3].xyz,point=(cameraWorld*eye).xyz,ray=point-origin;float limit=length(ray);ray/=max(limit,.0001);
    vec3 color=scene.rgb;
    for(int i=0;i<8;i++){
     if(i>=count)break;
     vec3 inv=1./(ray+vec3(.0000001));vec3 s0=(clipMin[i]-origin)*inv,s1=(clipMax[i]-origin)*inv;
     vec3 lo=min(s0,s1),hi=max(s0,s1);float clipNear=max(0.,max(lo.x,max(lo.y,lo.z))),clipFar=min(limit,min(hi.x,min(hi.y,hi.z)));
     float thickness=0.,weightedDistance=0.;
     for(int lobe=0;lobe<3;lobe++){
      float f=float(lobe),pulse=sin(time*.6+f*2.1+float(i))*.035;
      vec3 offset=lobe==0?vec3(-.24,-.08,.1):lobe==1?vec3(.28,.04,-.12):vec3(-.03,.36,.19);
      vec3 radius=radii[i]*(lobe==0?vec3(.84,.85,.83):lobe==1?vec3(.77,.84,.8):vec3(.7,.69,.75))*(1.+pulse);
      vec3 oc=(origin-centers[i].xyz-offset*radii[i])/radius,rd=ray/radius;float a=dot(rd,rd),b=dot(oc,rd),c=dot(oc,oc)-1.,disc=b*b-a*c;
      if(disc<=0.)continue;
      float nearT=max(clipNear,(-b-sqrt(disc))/a),farT=min(clipFar,(-b+sqrt(disc))/a);
      if(farT<=nearT)continue;
      float lengthInSmoke=farT-nearT,softness=clamp(lengthInSmoke/(2.*max(radius.x,max(radius.y,radius.z))),0.,1.);
      float density=lengthInSmoke*pow(softness,1.8);thickness+=density;weightedDistance+=density*(nearT+farT)*.5;
     }
     if(thickness<=0.)continue;
     vec3 mid=origin+ray*weightedDistance/thickness;
     float n=texture2D(noiseMap,fract(mid.xz*.24+vec2(time*.021,-time*.015))).a;
     float n2=texture2D(noiseMap,fract(mid.xy*.31+vec2(-time*.013,time*.018))).a;
     float tau=thickness*2.8*centers[i].w*(.7+.7*n);
     float transmit=exp(-tau);
     float height=clamp((mid.y-centers[i].y)/radii[i].y*.5+.5,0.,1.);
     vec3 smoke=vec3(.25,.27,.28)+vec3(.22)*(n*.6+n2*.45+height*.45);
     color=mix(smoke,color,transmit);
    }
    gl_FragColor=vec4(color,scene.a);
   }`});
  this.quad=new FullScreenQuad(this.material);
 }
 warm(renderer){
  const previous=renderer.getRenderTarget(),target=new WebGLRenderTarget(1,1);
  const depth=this.material.uniforms.tDepth.value;
  this.material.uniforms.tDiffuse.value=smokeTexture();this.material.uniforms.tDepth.value=smokeTexture();
  renderer.setRenderTarget(target);this.quad.render(renderer);renderer.setRenderTarget(previous);target.dispose();this.material.uniforms.tDepth.value=depth;
 }
 update(clouds,camera,delta=0){
  const active=clouds.filter(c=>c.age<c.duration&&c.strength>0).sort((a,b)=>b.center.distanceToSquared(camera.position)-a.center.distanceToSquared(camera.position));
  const selected=active.slice(-MAX_SMOKE_VOLUMES);this.enabled=selected.length>0;
  for(const cloud of clouds){cloud.volumeOnly=selected.includes(cloud);cloud.mesh.visible=!cloud.volumeOnly;}
  if(!this.enabled)return;
  const u=this.material.uniforms;camera.updateMatrixWorld(true);u.inverseProjection.value.copy(camera.projectionMatrixInverse);u.cameraWorld.value.copy(camera.matrixWorld);u.count.value=selected.length;u.time.value+=delta;
  selected.forEach((cloud,i)=>{
   const g=cloud.growth;u.centers.value[i].set(cloud.center.x,cloud.center.y+g*.85,cloud.center.z,cloud.strength);
   u.radii.value[i].set(3*g,2*g,3*g);
   u.clipMin.value[i].copy(cloud.clipBounds?.min||new Vector3(-1e4,cloud.center.y-.12,-1e4));
   u.clipMax.value[i].copy(cloud.clipBounds?.max||new Vector3(1e4,1e4,1e4));
  });
 }
 render(renderer,writeBuffer,readBuffer){this.material.uniforms.tDiffuse.value=readBuffer.texture;renderer.setRenderTarget(this.renderToScreen?null:writeBuffer);this.quad.render(renderer);}
 dispose(){this.material.dispose();this.quad.dispose();}
}
