import {STATE_LABELS} from './AnimationEdits.js';
import {emptyPeekPose,samplePeekKey,peekKey,PEEK_BODY,PEEK_FINGERS} from './PeekPoses.js';
export function createPeekEditor({getLibrary,transact,renderControls,switchView,getView,setPreview,addGroup,notify}){
 const $=id=>document.getElementById(id);let enabled=false,target='body',bodyJoint='Spine2',editingTime=null;
 const button=document.createElement('button');button.id='edit-peek';button.textContent='Edit third-person peeking';button.style.cssText='width:100%;margin-top:10px;border-color:#e9b85a';$('stance-note').after(button);
 const box=document.createElement('section');box.id='peek-options';box.hidden=true;box.innerHTML=`<label class="field">Posture<select id="peek-posture"><option value="stand">Standing</option><option value="crouch">Crouched</option></select></label><label class="field">Peek direction<select id="peek-side"><option value="left">Left / Q</option><option value="right">Right / E</option></select></label><p class="muted small">Weapon state follows the main State selector above: Ready, Fire without ADS, or ADS.</p><label class="field">Preview lean amount<input id="peek-amount" type="range" min="0" max="1" step=".01" value="1"></label><p class="muted small">Edit the full peek pose. The game blends these adjustments by actual lean and ADS. Positions are hand/weapon offsets; torso controls rotate joints without stretching bones.</p>`;button.after(box);
 const active=()=>enabled&&getView()==='third';
 const syncStatus=document.createElement('p');syncStatus.id='peek-sync-status';syncStatus.className='muted small';syncStatus.setAttribute('role','status');box.append(syncStatus);
 const key=()=>peekKey($('weapon').value,$('peek-posture').value,$('peek-side').value,(['hip','fire','aim'].includes($('stance').value)?$('stance').value:'hip'));
 const pose=()=>editingTime===null?getLibrary().peekPoses[key()]:(getLibrary().peekTimelines?.[key()]?.find(frame=>frame.time===editingTime)?.pose||getLibrary().peekPoses[key()]);
 function preview(){setPreview({posture:$('peek-posture').value,stance:(['hip','fire','aim'].includes($('stance').value)?$('stance').value:'hip'),side:$('peek-side').value,amount:Number($('peek-amount').value)});}
 function sync(){box.hidden=!active();$('parts').hidden=active()||document.body.classList.contains('reload-editing');$('body-lean-control').hidden=active();button.disabled=document.body.classList.contains('reload-editing');$('edit-reload').disabled=active();button.textContent=active()?'Back to normal grip editing':'Edit third-person peeking';if(active())for(const id of ['copy','save-both'])$(id).disabled=true;}
 button.onclick=()=>{editingTime=null;enabled=!active();if(enabled){switchView('third');preview();}else setPreview(null);sync();renderControls();};
 for(const id of ['peek-posture','peek-side'])$(id).onchange=()=>{preview();renderControls();};
 $('peek-amount').oninput=()=>preview();
 function field(label,element){const l=document.createElement('label');l.className='field';element.setAttribute('aria-label',label);l.append(label,element);$('controls').append(l);}
 function render(){
  sync();$('part-title').textContent='Third-person peek pose';$('stance-note').textContent=`Editing ${$('peek-posture').value.toUpperCase()} / ${$('peek-side').value.toUpperCase()} / ${STATE_LABELS[$('stance').value]||'READY'}. Saved independently for this equipment.${editingTime===null?'':' Editing keyframe at '+editingTime.toFixed(3)+' s.'}`;
  $('reset').disabled=false;$('reset').textContent='Reset this peek pose';
  const select=document.createElement('select');select.id='peek-target';for(const [id,name] of [['body','Body, head & legs'],['weapon','Gun placement'],['Left','Left arm, hand & fingers'],['Right','Right arm, hand & fingers']])select.add(new Option(name,id));select.value=target;select.onchange=()=>{target=select.value;renderControls();};field('Adjust peek part',select);
  const p=pose();
  if(target==='body'){
   const strength=document.createElement('input');strength.type='number';strength.min=0;strength.max=150;strength.step=1;strength.value=Math.round(p.strength*100);strength.onchange=()=>{if(Number.isFinite(strength.valueAsNumber))transact(()=>{p.strength=Math.max(0,Math.min(150,strength.valueAsNumber))/100;});};field('Automatic lean strength (%)',strength);
   const labels={Spine:'Lower torso',Spine1:'Middle torso',Spine2:'Chest',Neck:'Neck',Head:'Head'};
   const joints=document.createElement('select');joints.id='peek-body-joint';for(const name of PEEK_BODY)joints.add(new Option(labels[name]||name,name));joints.value=bodyJoint;joints.onchange=()=>{bodyJoint=joints.value;renderControls();};field('Body joint',joints);
   addGroup((labels[bodyJoint]||bodyJoint)+' rotation',p.body,bodyJoint,180,180/Math.PI,'°');addGroup((labels[bodyJoint]||bodyJoint)+' position',p.bodyPosition,bodyJoint,60,100,'cm');
  }else if(target==='weapon'){
   addGroup('Peek weapon position',p.weapon,'position',60,100,'cm');addGroup('Peek weapon rotation',p.weapon,'rotation',180,180/Math.PI,'°');
  }else{
   const hand=p[target];addGroup('Peek hand target',hand,'position',60,100,'cm');addGroup('Peek grip rotation',hand,'rotation',180,180/Math.PI,'°');
   for(const [name,field] of [['Clavicle rotation','clavicleRotation'],['Upper arm rotation','shoulderRotation'],['Forearm rotation','elbowRotation'],['Hand-only rotation','handRotation']])addGroup(name,hand,field,180,180/Math.PI,'°');
   addGroup('Shoulder anchor',hand,'shoulder',60,100,'cm');addGroup('Thumb rotation',hand,'thumbRotation',180,180/Math.PI,'°');
   addGroup('Peek elbow direction',hand,'elbow',60,100,'cm');for(const finger of PEEK_FINGERS)addGroup(`${finger} finger joints`,hand.fingers,finger,90,180/Math.PI,'°');
  }
  const to=document.createElement('select');to.id='peek-copy-state';for(const state of ['hip','fire','aim'])to.add(new Option(STATE_LABELS[state],state));field('Copy peek to state',to);
  const copy=document.createElement('button');copy.id='peek-copy-stance';copy.textContent='Copy this peek to chosen state';copy.onclick=()=>transact(()=>{const id=peekKey($('weapon').value,$('peek-posture').value,$('peek-side').value,to.value);if(editingTime===null)getLibrary().peekPoses[id]=structuredClone(pose());else{const frames=getLibrary().peekTimelines[id] ||= [];const at=frames.find(f=>f.time===editingTime);if(at)at.pose=structuredClone(pose());else frames.push({time:editingTime,pose:structuredClone(pose())});frames.sort((a,b)=>a.time-b.time);}});$('controls').append(copy);
  const hint=document.createElement('p');hint.className='muted small';hint.textContent='Use sliders/numbers here and orbit to inspect. Hand IK preserves limb lengths; joint rotations are applied after IK, so extreme angles can move the hand away from the grip. Save to game applies all peek presets.';$('controls').append(hint);
 }
 return {get active(){return active();},get key(){return key();},get label(){return `${$('weapon').selectedOptions[0].textContent} / ${$('peek-posture').value} / ${$('peek-side').value} / ${STATE_LABELS[$('stance').value]||'ready'}`;},
  showSaveStatus:text=>{syncStatus.textContent=text;},sync,render,refreshPreview:preview,reset:()=>transact(()=>{if(editingTime===null)getLibrary().peekPoses[key()]=emptyPeekPose();else{const frame=getLibrary().peekTimelines?.[key()]?.find(f=>f.time===editingTime);if(frame)frame.pose=emptyPeekPose();}}),
  selectPart(value){if(['body','weapon','Left','Right'].includes(value)){target=value;renderControls();}},
  selectContext(context,keyframe=false){
   enabled=!!context?.side;editingTime=null;if(!enabled){sync();return;}
   $('peek-posture').value=context.posture;$('peek-side').value=context.side;$('peek-amount').value=Math.abs(context.lean);
   if(keyframe){editingTime=context.time;const l=getLibrary(),id=key();l.peekTimelines ||= {};
    const pose=structuredClone(samplePeekKey(l.peekPoses,l.peekTimelines,id,editingTime));
    transact(()=>{const frames=l.peekTimelines[id] ||= [];if(!frames.some(f=>f.time===editingTime))frames.push({time:editingTime,pose});frames.sort((a,b)=>a.time-b.time);});
   }sync();
  },
  state:()=>active()?{lean:($('peek-side').value==='left'?-1:1)*Number($('peek-amount').value),isCrouching:$('peek-posture').value==='crouch',adsProgress:(['hip','fire','aim'].includes($('stance').value)?$('stance').value:'hip')==='aim'?1:0,isFiring:$('stance').value==='fire',isAiming:$('stance').value==='aim'}:null};
}
