import {RemoteTimeline} from './RemoteTimeline.js';
import * as T from 'three';
import {ThirdPersonView} from '../player/ThirdPersonView.js';
import {WEAPONS} from '../weapons/WeaponProfiles.js';

export class RemotePlayer{
 constructor(game,id){
  this.id=id;this.timeline=new RemoteTimeline();this.samples=this.timeline.samples;this.game=game;this.target=new T.Vector3();
  this.m={position:new T.Vector3(),velocity:new T.Vector3(),currentHeight:1.65,yaw:0,pitch:0,isGrounded:true,leanMaxOffset:.32,getSpeed(){return Math.hypot(this.velocity.x,this.velocity.z)}};
  this.w={activeSlot:'primary',poseLibrary:game.weapon.poseLibrary,adsProgress:0,isAiming:false,isReloading:false,reloadProgress:0,fireActionRemaining:0,utilityTimer:0};
  Object.defineProperty(this.w,'profile',{get:()=>WEAPONS[this.w.activeSlot]});this.eq={held:null,pending:null};
  this.view=new ThirdPersonView(game.scene,game.camera.clone(),this.m,this.w,this.eq,game.arena.colliders);
  this.view.allowSightCamera=false;this.view.updateCamera=()=>{};this.view.footsteps.update=()=>{};
  this.view.ready.then(()=>{if(this.disposed){game.scene.remove(this.view.rig.object);return;}this.view.enabled=true;this.view.rig.object.traverse(o=>{if(o.isMesh){o.userData.isShootable=false;o.userData.isAimTarget=true;}});}).catch(e=>console.error('Remote character could not load',e));
 }
 push(data,time){this.view.setTeam(data.team);this.timeline.push(data,time);}
 update(delta){
  const sample=this.timeline.sample(delta);if(!sample)return;const {a,b:d,t,ahead}=sample,m=this.m;
  m.position.fromArray(a.movement.position).lerp(this.target.fromArray(d.movement.position),t);m.velocity.fromArray(a.movement.velocity).lerp(this.target.fromArray(d.movement.velocity),t);
  if(ahead>0&&d.hp>0)m.position.addScaledVector(m.velocity,ahead);
  for(const key of ['currentHeight','pitch','effectiveLean'])m[key]=T.MathUtils.lerp(a.movement[key]||0,d.movement[key]||0,t);
  for(const key of ['isGrounded','isSprinting','isCrouchRunning','isSliding','isCrouching','isWalking'])m[key]=d.movement[key];
  m.yaw=a.movement.yaw+Math.atan2(Math.sin(d.movement.yaw-a.movement.yaw),Math.cos(d.movement.yaw-a.movement.yaw))*t;m.isDisabled=d.hp<=0;
  const w=this.w;w.poseLibrary=this.game.weapon.poseLibrary;w.activeSlot=d.slot;w.isAiming=!!d.movement.isAiming;w.adsProgress=T.MathUtils.damp(w.adsProgress,w.isAiming?1:0,14,delta);w.isReloading=!!d.reload;w.reloadProgress=d.reload?1-d.reload.remaining/d.reload.duration:0;w.fireActionRemaining=d.firing?.1:0;this.eq.held=d.grenade?{type:d.grenade,armed:true}:null;
  this.view.update(delta);
 }
 dispose(){this.disposed=true;if(this.view.rig)this.game.scene.remove(this.view.rig.object);}
}
