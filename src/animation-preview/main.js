import './style.css';
import * as T from 'three';
import {OrbitControls} from 'three/examples/jsm/controls/OrbitControls.js';
import {createSwatRig} from '../models/SwatRig.js';
import {loadAssaultRifleModel} from '../models/AssaultRifleModel.js';
import {readLibrary} from '../studio/PoseLibrary.js';
import {applySniperM4Pose} from '../studio/SharedM4Grips.js';
import {PreviewAnimator} from './PreviewAnimator.js';

const $=id=>document.getElementById(id),status=$('status');
// This standalone page has no game, transport, room or network-world imports.
// A copied multiplayer query cannot enable this controller inside a match.
if(new URLSearchParams(location.search).get('multiplayer')==='1'){
 status.textContent='This preview is single-player only. Open the regular game to join a match.';
}else start().catch(error=>{console.error(error);status.textContent=`Could not load the preview: ${error.message}`;});

async function start(){
 const canvas=$('preview'),renderer=new T.WebGLRenderer({canvas,antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;renderer.toneMapping=T.ACESFilmicToneMapping;
 const scene=new T.Scene();scene.background=new T.Color('#85949e');scene.fog=new T.Fog('#85949e',30,95);
 const camera=new T.PerspectiveCamera(42,1,.05,150);camera.position.set(0,2.8,-7);
 const orbit=new OrbitControls(camera,canvas);orbit.target.set(0,1,0);orbit.enableDamping=true;orbit.minDistance=4;orbit.maxDistance=16;orbit.maxPolarAngle=Math.PI*.49;orbit.update();
 scene.add(new T.HemisphereLight(0xd8eafa,0x655e4c,2.1));const sun=new T.DirectionalLight(0xfff0d5,3);sun.position.set(-8,14,-6);sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);Object.assign(sun.shadow.camera,{left:-12,right:12,top:12,bottom:-12,near:.1,far:45});sun.shadow.normalBias=.025;scene.add(sun,sun.target);
 const floor=new T.Mesh(new T.PlaneGeometry(300,300),new T.MeshStandardMaterial({color:0x6b7479,roughness:1}));floor.rotation.x=-Math.PI/2;floor.position.y=-.015;floor.receiveShadow=true;scene.add(floor);scene.add(new T.GridHelper(300,300,0x39454e,0x79838a));
 const [baseline,preview,rifleA,rifleB]=await Promise.all([createSwatRig(),createSwatRig(),loadAssaultRifleModel(),loadAssaultRifleModel()]);
 if(!baseline.animator||!preview.animator)throw Error('The animation pack is unavailable.');
 preview.animator.mixer.stopAllAction();preview.animator=new PreviewAnimator(preview,preview.animator.pack);
 const library=readLibrary();
 for(const [rig,rifle] of [[baseline,rifleA],[preview,rifleB]]){rig.object.add(rifle);rig.animatedModel=rifle;rig.animatedKind='rifle';rig.animatedSlot='primary';rig.object.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});scene.add(rig.object);}
 baseline.resolveAnimationPose=()=>applySniperM4Pose(baseline,library,'primary',0,{clip:baseline.animator.current,time:baseline.animator.actions.get(baseline.animator.current)?.time||0,state:'hip'});
 baseline.peekPoses=library.peekPoses;baseline.peekTimelines=library.peekTimelines;
 const keys=new Set(),position=new T.Vector3();let automatic=true,paused=false,time=0,heading=0,speed=0,forward=1,lateral=0,previousTime=performance.now(),inputState=null;
 function reset(){camera.position.sub(position);position.set(0,0,0);time=0;heading=0;speed=0;forward=1;lateral=0;keys.clear();}
 function showMode(){ $('demo').textContent=automatic?'Automatic comparison':'Manual control — click for demo'; }
 $('demo').onclick=()=>{automatic=!automatic;reset();showMode();};$('pause').onclick=()=>{paused=!paused;$('pause').textContent=paused?'Resume':'Pause';};$('reset').onclick=reset;
 const directions={idle:[0,0],forward:[1,0],backward:[-1,0],left:[0,-1],right:[0,1],'forward-left':[Math.SQRT1_2,-Math.SQRT1_2],'forward-right':[Math.SQRT1_2,Math.SQRT1_2],'backward-left':[-Math.SQRT1_2,-Math.SQRT1_2],'backward-right':[-Math.SQRT1_2,Math.SQRT1_2]};
 for(const id of ['posture','peek','direction','pace'])$(id).onchange=()=>{automatic=false;keys.clear();showMode();};
 const owned=new Set(['KeyW','KeyA','KeyS','KeyD','KeyQ','KeyE','KeyX','ShiftLeft','ShiftRight','ArrowLeft','ArrowRight']);
 window.addEventListener('keydown',event=>{if(!owned.has(event.code)||/INPUT|SELECT/.test(event.target.tagName))return;event.preventDefault();if(event.code==='KeyX'&&!event.repeat)$('posture').value=$('posture').value==='crouched'?'standing':'crouched';
 if(automatic){$('direction').value='idle';$('peek').value='0';}
 if(['KeyW','KeyA','KeyS','KeyD'].includes(event.code))$('direction').value='idle';keys.add(event.code);automatic=false;showMode();});
 window.addEventListener('keyup',event=>keys.delete(event.code));window.addEventListener('blur',()=>keys.clear());
 function demo(t){
  const index=Math.floor(t/3)%54,direction=Object.keys(directions)[index%9],lean=[0,-1,1][Math.floor(index/9)%3],crouched=index>=27,[f,l]=directions[direction];
  $('posture').value=crouched?'crouched':'standing';$('peek').value=String(lean);$('direction').value=direction;
  return{f,l,v:direction==='idle'?0:crouched?.9:1.25,lean,crouched,label:`${crouched?'Crouched':'Standing'} · ${direction.replaceAll('-',' ')} · ${lean<0?'peek left':lean>0?'peek right':'no peek'}`};
 }
 function manual(){
  let f=Number(keys.has('KeyW'))-Number(keys.has('KeyS')),l=Number(keys.has('KeyD'))-Number(keys.has('KeyA'));
  if(!f&&!l)[f,l]=directions[$('direction').value];
  const length=Math.hypot(f,l)||1,crouched=$('posture').value==='crouched',lean=keys.has('KeyQ')||keys.has('KeyE')?Number(keys.has('KeyE'))-Number(keys.has('KeyQ')):Number($('peek').value),running=keys.has('ShiftLeft')||keys.has('ShiftRight')||$('pace').value==='run';
  return{f:f/length,l:l/length,v:f||l?crouched?.9:running?3.7:1.25:0,crouched,lean,turn:(Number(keys.has('ArrowLeft'))-Number(keys.has('ArrowRight')))*1.2,label:`${crouched?'Crouched':'Standing'} · ${lean<0?'peek left':lean>0?'peek right':'no peek'}`};
 }
 for(const id of ['demo','pause','reset'])$(id).disabled=false;
 status.textContent='Automatic comparison · same movement inputs';
 function frame(now){
  requestAnimationFrame(frame);const elapsed=Math.max(0,Math.min((now-previousTime)/1000,.05));previousTime=now;const dt=paused?0:elapsed*Number($('rate').value);
  let input;
  if(automatic){time+=dt;input=demo(time);}else input=manual();
  speed=T.MathUtils.damp(speed,input.v,input.v?6:9,dt);if(input.v){forward=input.f;lateral=input.l;}
  const yawRate=input.turn||0;heading+=yawRate*dt;
  const displacement=new T.Vector3(Math.sin(heading)*forward+Math.cos(heading)*lateral,0,Math.cos(heading)*forward-Math.sin(heading)*lateral).multiplyScalar(speed*dt);position.add(displacement);camera.position.add(displacement);orbit.target.copy(position).y=1;sun.position.copy(position).add(new T.Vector3(-8,14,-6));sun.target.position.copy(position);
  const state={speed,forward,lateral,yawRate,equipment:'rifle',isSprinting:input.v>3,isGrounded:true,isCrouching:!!input.crouched,lean:input.lean,leanDistance:.26,aimPitch:0,adsProgress:0};
  inputState=state;
  baseline.object.position.copy(position).x+=2.1;preview.object.position.copy(position).x-=2.1;baseline.object.rotation.y=preview.object.rotation.y=heading;
  if(dt){
   if($('baseline').value==='game'){applySniperM4Pose(baseline,library,'primary',0);baseline.update(dt,state);}
   else{baseline.animator.update(dt,state);baseline.animator.restoreAuthoredPose();baseline.placeModelInHand(rifleA);}
   preview.animator.update(dt,state);preview.placeModelInHand(rifleB);
  }
  const clipLabel=rig=>rig.animator.pack.clips.find(c=>c.id===rig.animator.current)?.name||'Idle';$('baseline-state').textContent=clipLabel(baseline);$('preview-state').textContent=clipLabel(preview);status.textContent=`${automatic?'Automatic':'Manual'} · ${input.label} · ${speed.toFixed(1)} m/s${paused?' · paused':''}`;
  const width=canvas.clientWidth,height=canvas.clientHeight;if(canvas.width!==Math.round(width*renderer.getPixelRatio())||canvas.height!==Math.round(height*renderer.getPixelRatio())){renderer.setSize(width,height,false);camera.aspect=width/height;camera.updateProjectionMatrix();}
  orbit.update();renderer.render(scene,camera);
 }
 // Read-only inspection hook for automated preview checks; no main-game state.
 window.__animationPreview={baseline,preview,get state(){return{automatic,paused,time,speed,position:position.toArray(),crouched:!!inputState?.isCrouching,lean:inputState?.lean||0,forward:inputState?.forward||0,lateral:inputState?.lateral||0};}};
 requestAnimationFrame(frame);
}
