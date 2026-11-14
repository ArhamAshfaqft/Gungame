import {animationKey,ensureAnimationEdit,editableFit,sampleAnimationEdit,STATE_LABELS} from './AnimationEdits.js';
import {copyHandGripsToStates} from './CopyHandGrips.js';
import {sampleInheritedViewFit} from './ViewPoseInheritance.js';
import {fullBodyPose} from './FullBodyPoses.js';

export function createAnimationEditor({getLibrary,getView,getTime,setTime,isPlaying,transact,renderControls,onBody,notify}){
    const $=id=>document.getElementById(id);
    const panel=document.createElement('section');panel.id='animation-authoring';panel.hidden=true;
    panel.innerHTML=`<div class="divider"></div><div class="eyebrow">ANIMATION & STATE</div>
    <p class="muted small">Each gun, clip and weapon state can have its own pose and timeline. Unedited first-person movement actions inherit your idle grip and placement. Reload stays separate.</p>
    <label class="field">Edit scope<select id="animation-scope"><option value="clip">Selected animation only</option><option value="all">Default for all animations</option></select></label>
    <p id="animation-selection" class="muted small"></p>
    <button id="edit-body-joints">Body, head & legs</button>
    <label class="check"><input type="checkbox" id="animation-ik" checked> Support-hand grip IK</label>
    <label class="check"><input type="checkbox" id="animation-pin-trigger" checked> Trigger hand follows weapon placement</label>
    <label class="check"><input type="checkbox" id="animation-assist" checked> Crouched-peek arm assistance</label>
    <label class="check"><input type="checkbox" id="preview-shooting">Preview firing while ADS</label>
    <details class="animation-details"><summary>Animate with keyframes</summary><label class="field">Playhead (seconds)<input id="animation-time" type="number" min="0" max="300" step="0.001" value="0"></label><label class="field">Edit pose / keyframe<select id="animation-frame"><option value="-1">Base pose</option></select></label>
    <button id="animation-add-frame">Add / update keyframe at playhead</button><button id="animation-remove-frame">Remove selected keyframe</button>
    <p class="muted small">Pause or scrub, add a keyframe, then adjust any controls. Play previews the interpolated motion. Keyframes use seconds within the selected clip.</p>
    </details><details class="animation-details"><summary>Copy to another gun or state</summary>
    <label class="field">To weapon<select id="animation-copy-gun"></select></label>
    <label class="field">To animation<select id="animation-copy-clip"></select></label>
    <label class="field">To state<select id="animation-copy-state"></select></label>
    <button id="animation-copy">Copy pose & keyframes</button>
    <button id="animation-copy-gun-all">Copy ALL edited animations to target gun</button></details>`;
    $('stance-note').after(panel);
    const scope=$('animation-scope');let frame=-1,owner=null,drafts=new Map();
    const selection=()=>({slot:$('weapon').value,clip:getView()==='third'?(scope.value==='all'?'*':$('body-clip').value):(scope.value==='all'?'view_all':'view_'+$('action').value),state:$('stance').value});
    function entry(){
        const library=getLibrary();if(owner!==library){owner=library;drafts=new Map();}
        const {slot,clip,state}=selection(),key=animationKey(slot,clip,state);
        if(library.animationEdits?.[key])return library.animationEdits[key];
        if(!drafts.has(key)){
            const defaultClip=getView()==='third'?'*':'view_all';
            const fallback=(getView()!=='third'?sampleInheritedViewFit(library,slot,clip,state):null)||library.animationEdits?.[animationKey(slot,defaultClip,state)]?.pose||(getView()==='third'?fullBodyPose(library,slot,state):library.poses[`${slot}:${state}`]);
            const holder={animationEdits:{}};const value=ensureAnimationEdit(holder,slot,clip,state,fallback);
            drafts.set(key,{value,before:JSON.stringify(value)});
        }
        return drafts.get(key).value;
    }
    function commit(){
        if(owner!==getLibrary())return;
        for(const [key,draft] of drafts)if(JSON.stringify(draft.value)!==draft.before){getLibrary().animationEdits[key]=draft.value;drafts.delete(key);}
    }
    const fit=()=>{const e=entry();return frame>=0&&e.keyframes[frame]?e.keyframes[frame].pose:e.pose;};
    function refreshFrames(){
        const e=entry();if(frame>=e.keyframes.length)frame=-1;
        $('animation-frame').replaceChildren(new Option('Base pose','-1'),...e.keyframes.map((f,i)=>new Option(`Keyframe ${i+1} · ${f.time.toFixed(3)} s`,String(i))));
        $('animation-frame').value=String(frame);
    }
    $('animation-time').onchange=()=>{const value=$('animation-time').valueAsNumber;if(Number.isFinite(value)&&value>=0&&value<=300){setTime(value);renderControls();}};
    scope.onchange=()=>{frame=-1;renderControls();};
    $('edit-body-joints').onclick=onBody;
    $('animation-frame').onchange=()=>{frame=Number($('animation-frame').value);if(frame>=0)setTime(entry().keyframes[frame].time);renderControls();};
    for(const [id,field] of [['animation-ik','supportIK'],['animation-pin-trigger','pinTrigger'],['animation-assist','crouchAssist']])$(id).onchange=()=>transact(()=>{entry()[field]=$(id).checked;commit();});
    $('animation-add-frame').onclick=()=>transact(()=>{
        const e=entry(),time=Math.round(getTime()*1000)/1000;
        const pose=structuredClone(frame>=0?fit():sampleAnimationEdit(e,time));
        const existing=e.keyframes.find(f=>Math.abs(f.time-time)<.0005);
        if(existing)existing.pose=pose;else e.keyframes.push({time,pose});
        e.keyframes.sort((a,b)=>a.time-b.time);frame=e.keyframes.findIndex(f=>f.time===time);commit();
    });
    $('animation-remove-frame').onclick=()=>{if(frame<0){notify('Select a keyframe to remove.');return;}transact(()=>{entry().keyframes.splice(frame,1);frame=-1;commit();});};
    $('animation-copy').onclick=()=>transact(()=>{
        const source=structuredClone(entry()),slot=$('animation-copy-gun').value,clip=$('animation-copy-clip').value,state=$('animation-copy-state').value;
        getLibrary().animationEdits[animationKey(slot,clip,state)]=source;
        notify('Copied pose and keyframes. Adjust this gun’s grips, then Save to game.');
    });
    $('animation-copy-gun-all').onclick=()=>{
        const from=selection().slot,to=$('animation-copy-gun').value;if(from===to){notify('Choose a different target gun.');return;}
        transact(()=>{
            commit();const l=getLibrary();
            for(const [key,value] of Object.entries(l.animationEdits))if(key.startsWith(from+'|'))l.animationEdits[to+key.slice(from.length)]=structuredClone(value);
            for(const field of ['thirdPerson','thirdPersonGrips','thirdPersonRightGrips','thirdPersonAim','thirdPersonFire'])if(l[field]?.[from])l[field][to]=structuredClone(l[field][from]);
            for(const field of ['peekPoses','peekTimelines'])for(const [key,value] of Object.entries(l[field]||{}))if(key.startsWith(from+':')){l[field] ||= {};l[field][to+key.slice(from.length)]=structuredClone(value);}
            notify('Copied edited animations, full-body defaults and peek presets to the target gun.');
        });
    };
    function copyGripsToStates(){
        if(getView()==='third'){ $('animation-copy').click();return; }
        const source=structuredClone(fit()),{slot,clip}=selection();
        const states=[...$('stance').options].map(option=>option.value);
        transact(()=>{
            commit();copyHandGripsToStates(getLibrary(),slot,clip,source,states);
            drafts.clear();frame=-1;
        });
        notify('Copied both hands, wrist rotations and fingers to all states of this action. Save to game to keep them.');
    }
    function sync(){
        for(const [key,draft] of drafts)if(JSON.stringify(draft.value)===draft.before)drafts.delete(key);
        panel.hidden=false;const third=getView()==='third';if($('body-clip-field'))$('body-clip-field').hidden=!third;if($('view-action-field'))$('view-action-field').hidden=third;
        $('edit-body-joints').hidden=!third;for(const id of ['animation-ik','animation-pin-trigger','animation-assist','preview-shooting'])$(id).closest('label').hidden=!third;
        const {slot,clip,state}=selection(),e=entry();
        $('animation-selection').textContent=`${$('weapon').selectedOptions[0].textContent} / ${clip==='*'?'all clips':clip} / ${STATE_LABELS[state]||state}`;
        $('animation-ik').checked=e.supportIK;$('animation-pin-trigger').checked=e.pinTrigger;$('animation-assist').checked=e.crouchAssist;
        refreshFrames();
        function options(id,values){const el=$(id),old=el.value;el.replaceChildren(...values.map(([v,t])=>new Option(t,v)));if(values.some(([v])=>v===old))el.value=old;}
        options('animation-copy-gun',[...$('weapon').options].map(o=>[o.value,o.textContent]));
        options('animation-copy-clip',third?[['*','All clips (default)'],...[...$('body-clip').options].map(o=>[o.value,o.textContent])]:[['view_all','All first-person actions'],...[...$('action').options].map(o=>['view_'+o.value,o.textContent])]);
        options('animation-copy-state',[...$('stance').options].map(o=>[o.value,o.textContent]));
    }
    return {fit,entry,commit,sync,copyGripsToStates,updateTime(){if(document.activeElement!==$('animation-time'))$('animation-time').value=getTime().toFixed(3);},resetSelection(){frame=-1;},preview(){const e=entry();return isPlaying()?sampleAnimationEdit(e,getTime()):fit();},selectFrozenTime(time,keyframe=false){scope.value='clip';frame=-1;setTime(time);if(keyframe){transact(()=>{const e=entry(),at=time;if(!e.keyframes.some(f=>f.time===at))e.keyframes.push({time:at,pose:structuredClone(sampleAnimationEdit(e,at))});e.keyframes.sort((a,b)=>a.time-b.time);frame=e.keyframes.findIndex(f=>f.time===at);commit();});}},get state(){return selection().state;},get clip(){return selection().clip;}};
}
