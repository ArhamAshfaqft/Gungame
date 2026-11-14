import * as T from 'three';
import {TripoLocomotion} from './TripoLocomotion.js';
import {TripoHandFit} from './TripoHandFit.js';
import {trimTripoRun} from './TripoRunCycle.js';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';

// Alternate presentation only: movement, ballistics, and the recovered rig remain intact.
export class TripoPlayer {
 constructor(game){
  this.game=game;this.enabled=false;this.object=new T.Group();this.object.name='Playable Tripo soldier';this.object.visible=false;game.scene.add(this.object);
  this.button=document.createElement('button');this.button.textContent='H · Use new soldier';Object.assign(this.button.style,{position:'fixed',top:'120px',left:'20px',zIndex:110,background:'#18242e',color:'#ffcb67',border:'1px solid #7a6338',padding:'8px 12px',borderRadius:'4px',cursor:'pointer'});document.body.append(this.button);
  this.button.onclick=()=>this.toggle();
  window.addEventListener('keydown',e=>{if(e.code==='KeyH'&&!e.repeat&&!/INPUT|TEXTAREA|SELECT/.test(e.target?.tagName)&&!e.target?.isContentEditable){e.preventDefault();this.toggle();}},true);
 }
 async load(){
  const asset=await new GLTFLoader().loadAsync('/assets/comparison/tripo-playable.glb');this.model=asset.scene;
  this.mixer=new T.AnimationMixer(this.model);this.actions={};
  for(const name of ['Tripo_Idle','Tripo_Run','Tripo_Peek','Tripo_PeekOther']){
   const clip=asset.animations.find(c=>c.name===name);if(!clip)throw Error('Missing '+name);
   const action=this.mixer.clipAction(name==='Tripo_Run'?trimTripoRun(clip):clip);action.play();action.setEffectiveWeight(name==='Tripo_Idle'?1:0);this.actions[name]=action;
   if(name.startsWith('Tripo_Peek')){action.time=Math.min(3.3,clip.duration-.05);action.paused=true;}
  }
  this.mixer.update(0);this.model.updateMatrixWorld(true);this.model.traverse(o=>{if(o.isSkinnedMesh)o.skeleton.update();});
  const box=new T.Box3().setFromObject(this.model,true),center=box.getCenter(new T.Vector3()),scale=1.8/box.getSize(new T.Vector3()).y;
  const bones=this.model.getObjectsByProperty('isBone',true),bone=suffix=>bones.find(b=>b.name.endsWith(suffix));
  const across=bone('LeftArm').getWorldPosition(new T.Vector3()).sub(bone('RightArm').getWorldPosition(new T.Vector3()));across.y=0;
  const direction=across.normalize().cross(new T.Vector3(0,1,0));
  this.model.scale.multiplyScalar(scale);this.model.position.set(-center.x*scale,-box.min.y*scale,-center.z*scale);
  this.pivot=new T.Group();this.pivot.rotation.y=-Math.atan2(direction.x,direction.z);this.pivot.add(this.model);this.object.add(this.pivot);
  this.head=bone('Head');
  const hips=bone('Hips');this.object.updateMatrixWorld(true);
  this.actions.Tripo_Idle.setEffectiveWeight(0);this.actions.Tripo_Peek.setEffectiveWeight(1);this.mixer.update(0);this.object.updateMatrixWorld(true);
  const leanX=this.head.getWorldPosition(new T.Vector3()).x-hips.getWorldPosition(new T.Vector3()).x;
  this.leftPeek=leanX>=0?this.actions.Tripo_Peek:this.actions.Tripo_PeekOther;
  this.rightPeek=leanX>=0?this.actions.Tripo_PeekOther:this.actions.Tripo_Peek;
  this.actions.Tripo_Peek.setEffectiveWeight(0);this.actions.Tripo_Idle.setEffectiveWeight(1);this.mixer.update(0);
  this.model.traverse(o=>{if(o.isMesh){o.receiveShadow=true;o.castShadow=false;}});
  this.handFit=new TripoHandFit(this.object,this.model,this.mixer,this.actions);
  this.locomotion=new TripoLocomotion(this.object,this.model,this.actions.Tripo_Run,this.game.thirdPerson.rig);
 }
 async toggle(){
  if(this.busy)return;this.busy=true;this.button.disabled=true;
  try{
   if(!this.model)await this.load();this.enabled=!this.enabled;
   if(this.enabled){this.game.weapon.switchWeapon('assault');if(!this.game.thirdPerson.enabled)this.game.toggleView();}
   this.button.textContent=this.enabled?'H · New soldier active / switch back':'H · Use new soldier';this.update(0);
  }catch(e){console.error(e);this.button.textContent='New soldier failed — H to retry';}
  finally{this.busy=false;this.button.disabled=false;}
 }
 update(delta){
  const g=this.game,r=g.thirdPerson.rig,m=g.movement,w=g.weapon;
  const usable=this.enabled&&this.model&&g.thirdPerson.usesChaseCamera&&w.activeSlot==='assault'&&!g.equipment.held&&!w.isReloading&&!m.isCrouching&&!m.isDisabled;
  this.object.visible=!!usable;if(!usable)return;r.object.visible=false;
  this.object.position.copy(r.object.position);this.object.quaternion.copy(r.object.quaternion);
  if(g.poseInspector.active)return;
  const lean=m.effectiveLean||0,amount=Math.abs(lean),moving=m.getSpeed()>.15;
  const step=1-Math.exp(-delta*12);this.runWeight=T.MathUtils.lerp(this.runWeight||0,moving?1:0,step);
  this.actions.Tripo_Idle.setEffectiveWeight((1-this.runWeight)*(1-amount));
  this.actions.Tripo_Run.setEffectiveWeight(this.runWeight*(1-amount));this.actions.Tripo_Run.setEffectiveTimeScale(T.MathUtils.clamp(m.getSpeed()/3.4,.4,2));
  this.leftPeek.setEffectiveWeight(lean<0?amount:0);this.rightPeek.setEffectiveWeight(lean>0?amount:0);
  this.handFit.restore();
  this.locomotion.restore();
  this.mixer.update(delta);
  this.locomotion.apply(delta,{speed:m.getSpeed(),velocity:m.velocity,peekWeight:amount,weight:this.runWeight});
  this.handFit.apply(this.runWeight,amount);
 }
}
