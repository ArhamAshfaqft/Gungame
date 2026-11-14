import * as T from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {createSwatRig} from '../models/SwatRig.js';
import {loadAssaultRifleModel} from '../models/AssaultRifleModel.js';
import {applyFullBodyPose} from '../studio/FullBodyPoses.js';

function label(text){
 const c=document.createElement('canvas');c.width=640;c.height=80;const ctx=c.getContext('2d');
 ctx.fillStyle='#101820e8';ctx.fillRect(0,0,640,80);ctx.fillStyle='#ffcb67';ctx.font='bold 28px sans-serif';ctx.textAlign='center';ctx.fillText(text,320,51);
 const texture=new T.CanvasTexture(c),sprite=new T.Sprite(new T.SpriteMaterial({map:texture,depthTest:true}));sprite.scale.set(2,.25,1);sprite.position.y=2.15;return sprite;
}
export class IdleComparison{
 constructor(game){
  this.game=game;this.root=new T.Group();this.root.name='Idle animation comparison';this.root.visible=false;game.scene.add(this.root);
  this.panel=document.createElement('div');Object.assign(this.panel.style,{position:'fixed',top:'78px',left:'20px',zIndex:110,display:'flex',gap:'6px'});
  this.toggle=document.createElement('button');this.toggle.textContent='B · Compare M4 idle';this.toggle.onclick=()=>this.show().catch(e=>{console.error(e);this.toggle.textContent='Comparison failed â€” retry';});
  this.hide=document.createElement('button');this.hide.textContent='Hide comparison';this.hide.hidden=true;this.hide.onclick=()=>{this.root.visible=false;this.hide.hidden=true;this.toggle.textContent='B · Compare M4 idle';};
  for(const button of [this.toggle,this.hide])Object.assign(button.style,{background:'#18242e',color:'#ffcb67',border:'1px solid #7a6338',padding:'8px 12px',borderRadius:'4px',cursor:'pointer'});
  this.panel.append(this.toggle,this.hide);document.body.append(this.panel);
  window.addEventListener('keydown',event=>{
   if(event.code!=='KeyB'||event.repeat||/INPUT|TEXTAREA|SELECT/.test(event.target?.tagName)||event.target?.isContentEditable)return;
   event.preventDefault();
   if(this.root.visible){this.root.visible=false;this.hide.hidden=true;this.toggle.textContent='B · Compare M4 idle';}
   else this.show().catch(error=>{console.error(error);this.toggle.textContent='Comparison failed — B to retry';});
  },true);
 }
 async load(){
  const [asset,old,weapon]=await Promise.all([new GLTFLoader().loadAsync('/assets/comparison/tripo-soldier-m4-idle.glb'),createSwatRig(),loadAssaultRifleModel()]);
  const imported=asset.scene;imported.name='New Tripo soldier â€” original idle';
  imported.traverse(o=>{if(o.isMesh){o.castShadow=false;o.receiveShadow=true;}});
  this.mixer=new T.AnimationMixer(imported);const clip=asset.animations.find(a=>/Rifle_Idle_Stand/i.test(a.name))||asset.animations[0];
  if(!clip)throw Error('Imported idle animation missing');this.mixer.clipAction(clip).play();this.mixer.update(0);
  imported.updateMatrixWorld(true);imported.traverse(o=>{if(o.isSkinnedMesh)o.skeleton.update();});
  const bounds=new T.Box3().setFromObject(imported,true),size=bounds.getSize(new T.Vector3()),scale=1.8/size.y;imported.scale.multiplyScalar(scale);
  const center=bounds.getCenter(new T.Vector3());imported.position.set(-center.x*scale,-bounds.min.y*scale,-center.z*scale);
  const newGroup=new T.Group();newGroup.add(imported);newGroup.add(label('NEW Â· TRIPO ORIGINAL IDLE + M4'));newGroup.position.x=1.3;
  // Face both rifles the same way without modifying the imported pose.
  imported.updateMatrixWorld(true);const gun=imported.getObjectByName('M4_RightHand_Attachment');
  const forward=new T.Vector3(0,0,-1).applyQuaternion(gun?.getWorldQuaternion(new T.Quaternion())||new T.Quaternion());
  const yaw=Math.atan2(forward.x,forward.z);const pivot=new T.Group();newGroup.remove(imported);pivot.add(imported);pivot.rotation.y=-yaw;newGroup.add(pivot);
  this.old=old;old.object.add(weapon);old.attachAnimatedModel(weapon,'rifle','assault');old.object.position.x=-1.3;
  const oldGroup=new T.Group();oldGroup.position.x=-1.3;old.object.position.x=0;oldGroup.add(old.object,label('CURRENT Â· GAME M4 IDLE'));
  this.root.add(oldGroup,newGroup);this.clip=clip.name;this.imported=imported;
 }
 async show(){
  if(!this.loading){this.toggle.disabled=true;this.toggle.textContent='Loading idle comparisonâ€¦';this.loading=this.load().catch(e=>{this.loading=null;throw e;}).finally(()=>{this.toggle.disabled=false;});}
  await this.loading;const g=this.game,yaw=g.movement.yaw,forward=new T.Vector3(-Math.sin(yaw),0,-Math.cos(yaw));
  this.root.position.copy(g.movement.position).addScaledVector(forward,4.5);this.root.position.y-=g.movement.currentHeight;
  this.root.rotation.y=yaw;this.root.visible=true;this.hide.hidden=false;this.toggle.textContent='Move comparison here';this.update(0);
 }
 update(delta){
  if(!this.root.visible||!this.old)return;
  if(this.game.poseInspector.active)return;
  this.mixer.update(delta);
  applyFullBodyPose(this.old,this.game.weapon.poseLibrary,'assault',0);
  this.old.update(delta,{equipment:'rifle',speed:0,isGrounded:true,isAiming:false,adsProgress:0});
 }
}
