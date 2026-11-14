import {GRIP_STEPS} from './GripSetup.js';
import {FINGERS} from './PoseLibrary.js';

export function createGuidedGrip(api){
 let active=false,step=0,third=false,baseline=null,lastStatus=0;
 const launch=document.createElement('button');launch.id='guided-setup';launch.className='primary';launch.textContent='Easy weapon setup';
 document.getElementById('stance-note').after(launch);
 const panel=document.createElement('section');panel.id='grip-guide';panel.hidden=true;document.querySelector('.right-panel').prepend(panel);
 const button=(text,id,fn)=>{const b=document.createElement('button');b.textContent=text;if(id)b.id=id;b.onclick=fn;return b;};
 const note=text=>{const p=document.createElement('p');p.className='guide-note';p.textContent=text;return p;};
 function target(){return step===1?'Right':step===2?'Left':'weapon';}
 function open(){if(!api.available()){api.notify('Choose a firearm first.');return;}active=true;step=0;third=!!api.shared?.();document.body.classList.add('guided-grip');panel.hidden=false;choose();}
 function close(){api.clearMarks();api.finish();active=false;document.body.classList.remove('guided-grip');panel.hidden=true;api.stop();api.restoreControls();}
 function choose(){api.clearMarks();api.stop();api.select({part:target(),third,step});baseline=api.baseline(target(),third);render();}
 function edit(fn){api.edit(fn);}
 function range(label,min,max,value,oninput,parent=panel){
  const row=document.createElement('label');row.className='guide-slider';const title=document.createElement('span'),out=document.createElement('output'),input=document.createElement('input');title.textContent=label;out.textContent=value+'°';input.type='range';input.min=min;input.max=max;input.step=1;input.value=value;input.setAttribute('aria-label',label);
  input.onpointerdown=api.begin;input.oninput=()=>{out.textContent=input.value+'°';oninput(Number(input.value));};input.onchange=api.finish;input.onblur=api.finish;row.append(title,out,input);parent.append(row);
 }
 function render(){
  panel.replaceChildren();
  const top=document.createElement('div');top.className='guide-heading';const label=document.createElement('strong');label.textContent='EASY WEAPON SETUP';top.append(label,button('Advanced','guide-close',close));panel.append(top);
  const scope=document.createElement('div');scope.className='guide-tabs';for(const [text,value] of [['First person',false],['Full body',true]]){const b=button(text,value?'guide-third':'guide-first',()=>{third=value;choose();});b.classList.toggle('active',third===value);b.disabled=!!api.shared?.()&&!value;scope.append(b);}panel.append(scope);
  panel.append(note(`Editing ${api.weaponName()} only. ${api.shared?.()?'One full-body fit drives both views. Use View through eyes to check it.':third?'Full-body fits are separate from first-person fits.':'Your other weapons keep their saved fits.'}`));
  const steps=document.createElement('div');steps.className='guide-steps';GRIP_STEPS.forEach((name,i)=>{const b=button(String(i+1),`guide-step-${i}`,()=>{step=i;choose();});b.title=name;b.setAttribute('aria-label',`Step ${i+1}: ${name}`);b.classList.toggle('active',step===i);steps.append(b);});panel.append(steps);
  const heading=document.createElement('h2');heading.textContent=`${step+1}. ${third&&step===3?'Check the stance':GRIP_STEPS[step]}`;panel.append(heading);
  if(step<4){
   panel.append(note(step===0?'Put the weapon comfortably in view. Hand steps move the hands independently.':step===1?'Fit the right palm around the pistol grip. Keep the index finger beside the trigger.':step===2?'Bring the left palm under the handguard, then curl the fingers around it.':third?'Check a standing and crouched stance before saving.':api.holographic?.()?'Look through the holographic window. Keep the red ring and centre dot visible, with a clear view ahead.':'Look through the sights. Centre the front sight in the rear sight, with a clear view ahead.'));
   const cameras=document.createElement('div');cameras.className='guide-actions';
   cameras.append(button('Player view','guide-player-view',()=>api.camera('player',target(),third)),button('Side view','guide-side-view',()=>api.camera('side',target(),third)),button('Close-up','guide-closeup',()=>api.camera('close',target(),third)));panel.append(cameras);
   if(!third&&step===3)panel.append(button('Align sights to centre','guide-align',()=>{api.align();choose();}));
   if(third&&step===3){const actions=document.createElement('div');actions.className='guide-actions';actions.append(button('Standing',null,()=>api.preview('stand',third)),button('Crouched',null,()=>api.preview('crouch',third)));panel.append(actions);}
   panel.append(note('Move in weapon directions. Each click is a small, predictable adjustment.'));
   const fine=document.createElement('label');fine.className='check guide-fine';const check=document.createElement('input');check.type='checkbox';check.id='guide-fine';fine.append(check,'Extra fine adjustments');panel.append(fine);
   const pad=document.createElement('div');pad.className='guide-pad';
   for(const [text,axis,sign] of [['← Left',0,-1],['Right →',0,1],['↑ Up',1,1],['↓ Down',1,-1],['Toward muzzle',2,-1],['Toward stock',2,1]])pad.append(button(text,null,()=>edit(()=>api.nudge(target(),third,axis,sign*(check.checked?.001:.005)))));panel.append(pad);
   if(step===1||step===2){
    api.markControls(panel,target(),third);
    const snap=button('Bring palm onto grip','guide-snap',()=>{api.snap(target(),third);baseline=api.baseline(target(),third);render();});panel.append(snap);
    panel.append(note('Turn the wrist, then shape the grip. You can always undo.'));
    const wrist=document.createElement('details'),summary=document.createElement('summary');summary.textContent='Turn wrist · tilt / turn / roll';wrist.append(summary);panel.append(wrist);
    for(const [text,axis] of [['Wrist tilt',0],['Wrist turn',1],['Wrist roll',2]])range(text,-90,90,0,degrees=>api.adjust(target(),third,baseline,'rotation',axis,degrees*Math.PI/180),wrist);
    const arms=document.createElement('details');arms.id='guide-arms';const armTitle=document.createElement('summary');armTitle.textContent='Arm shape · shoulder, upper arm, elbow & forearm';arms.append(armTitle);panel.append(arms);
    arms.append(note('Start with elbow direction: the arm bends toward this target while keeping the hand at its grip. Shoulder placement moves where the arm starts.'));
    for(const [label,field,help] of [['Elbow direction','elbowTarget','Steer the elbow out, down or back without deliberately pulling the hand away.'],['Shoulder placement','shoulder','Move the start of this arm. Use small changes to avoid an unnatural shoulder.']]){
     const block=document.createElement('section');block.className='guide-arm-section';const title=document.createElement('h3');title.textContent=label;block.append(title,note(help));
     const pad=document.createElement('div');pad.className='guide-pad';
     for(const [text,axis,sign] of [['← Left',0,-1],['Right →',0,1],['↑ Up',1,1],['↓ Down',1,-1],['Toward muzzle',2,-1],['Toward stock',2,1]])pad.append(button(text,null,()=>edit(()=>api.nudge(target(),third,axis,sign*(check.checked?.003:.015),field))));block.append(pad);arms.append(block);
    }
    const joints=document.createElement('details'),jointTitle=document.createElement('summary');jointTitle.textContent='Rotate upper arm & forearm';joints.append(jointTitle);arms.append(joints);
    joints.append(note('These rotate the actual joints. They can move the hand away from its grip. Fit the arm first, then use the hand controls to correct contact.'));
    for(const [label,field] of [['Upper arm','shoulderRotation'],['Forearm / elbow','elbowRotation']])for(const [axisLabel,axis] of [['tilt',0],['turn',1],['roll',2]])range(`${label} ${axisLabel}`,-90,90,0,degrees=>api.adjust(target(),third,baseline,field,axis,degrees*Math.PI/180),joints);
    range('Finger wrap',-45,45,0,degrees=>api.curl(target(),third,baseline,degrees*Math.PI/180,{}));
    panel.append(note('Finger wrap moves middle, ring and little together. Move right to curl toward the palm; left to open.'));
    range('Index / trigger curl',-60,60,0,degrees=>api.curl(target(),third,baseline,degrees*Math.PI/180,{trigger:true}));
    const thumb=document.createElement('section');thumb.className='guide-arm-section';const thumbTitle=document.createElement('h3');thumbTitle.textContent='Thumb';thumb.append(thumbTitle);panel.append(thumb);
    range('Thumb curl',-60,60,0,degrees=>api.curl(target(),third,baseline,degrees*Math.PI/180,{thumb:true}),thumb);
    range('Thumb spread',-60,60,0,degrees=>api.adjust(target(),third,baseline,'thumbRotation',1,degrees*Math.PI/180),thumb);
    range('Thumb turn',-60,60,0,degrees=>api.adjust(target(),third,baseline,'thumbRotation',2,degrees*Math.PI/180),thumb);
    const fingers=document.createElement('details');fingers.id='guide-fingers';const fingerSummary=document.createElement('summary');fingerSummary.textContent='Advanced · individual fingers and joints';fingers.append(fingerSummary);panel.append(fingers);
    fingers.append(note('Open one finger at a time. Curl moves its three joints together; base, middle and tip let you correct a single bend.'));
    for(const finger of FINGERS){
     const details=document.createElement('details');details.dataset.finger=finger;const title=document.createElement('summary');title.textContent=finger==='Pinky'?'Little finger':finger==='Index'?'Index / trigger finger':finger+' finger';details.append(title);fingers.append(details);
     range(`${finger} curl`,-45,45,0,degrees=>api.curl(target(),third,baseline,degrees*Math.PI/180,{finger}),details);
     for(const [name,joint] of [['base',0],['middle',1],['tip',2]])range(`${finger} ${name} bend`,-90,90,0,degrees=>api.fingerJoint(target(),third,baseline,finger,joint,degrees*Math.PI/180),details);
    }
    const presets=document.createElement('div');presets.className='guide-actions';for(const [text,value] of [['Looser',-.22],['Default wrap',0],['Tighter',.18]])presets.append(button(text,null,()=>{api.preset(target(),third,value);baseline=api.baseline(target(),third);render();}));panel.append(presets);
    if(!third)panel.append(button('Use this hand fit in ready + aiming','guide-copy-fit',()=>{api.copy(target());api.notify('Copied this hand only to the other stance.');}));
    panel.append(button('Drag hand target','guide-drag',()=>api.drag(target(),third)));
   }
   const reset=button('Reset this step','guide-reset',()=>{api.reset(target(),third);choose();});panel.append(reset);
  }else{
   panel.append(note('Preview the result. Check that fingers touch the gun and the sights remain clear. A reach check cannot detect every visual intersection.'));
   const actions=document.createElement('div');actions.className='guide-pad';for(const [text,id] of [['Ready','stand'],['Aim','aim'],['Walk','walk'],['Reload','reload']])actions.append(button(text,`guide-preview-${id}`,()=>api.preview(id,third)));actions.append(button('Stop preview','guide-preview-stop',()=>api.stop()));panel.append(actions);
   panel.append(button('Save to game','guide-save',()=>document.getElementById('save').click()));panel.append(note('Saves this browser’s pose library, including your edits. Switch back to the game to try the fit.'));
  }
  const status=document.createElement('p');status.id='guide-status';status.setAttribute('role','status');panel.append(status);
  const tools=document.createElement('div');tools.className='guide-actions';tools.append(button('Undo','guide-undo',()=>{api.undo();baseline=api.baseline(target(),third);render();}),button('Redo','guide-redo',()=>{api.redo();baseline=api.baseline(target(),third);render();}));panel.append(tools);
  const nav=document.createElement('div');nav.className='guide-nav';const back=button('Back','guide-back',()=>{step--;choose();});back.disabled=step===0;const next=button(step===4?'Done':'Next step','guide-next',()=>{if(step===4)close();else{step++;choose();}});next.className='primary';nav.append(back,next);steps.after(nav);
 }
 launch.onclick=open;
 return {get active(){return active;},close,setScope(value){third=value;choose();},refresh(){launch.disabled=!api.available();if(active){if(!api.available())close();else choose();}},update(now){if(!active||now-lastStatus<180)return;lastStatus=now;const node=document.getElementById('guide-status');if(node){const result=api.status(target(),third);node.textContent=result.text;node.className=result.warning?'guide-warning':'guide-ok';}}};
}
