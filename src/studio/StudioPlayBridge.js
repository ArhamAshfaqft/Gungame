import {validateLibrary} from './PoseLibrary.js';
import {applyFullBodyPose} from './FullBodyPoses.js';

// A same-origin Studio iframe runs the actual game, not a second imitation of
// its movement or animation state machine. This API is absent from normal play.
export function installStudioPlayBridge(game){
    if(new URLSearchParams(location.search).get('studio')!=='1'||window.parent===window)return;
    try{if(window.parent.location.origin!==location.origin)return;}catch{return;}
    game.studioSession=true;
    let frozen=null,audition=null;
    const send=(type,data={})=>parent.postMessage({source:'fast-snipe-studio-play',type,...data},location.origin);
    const refresh=game.weapon.refreshSavedPoses.bind(game.weapon);
    game.weapon.refreshSavedPoses=()=>{
        if(!audition)return refresh();
        game.weapon.poseLibrary=audition;game.weapon.poseRevision=(game.weapon.poseRevision||0)+1;
    };
    function capture(){
        const v=game.thirdPerson,r=v.rig,m=game.movement,w=game.weapon;
        const state={...r.studioInputState};
        const ads=state.adsProgress??w.adsProgress,slot=r.animatedSlot||w.activeSlot;
        const lean=state.lean||0;
        frozen={state,slot,clip:r.animator.current,time:r.animator.actions.get(r.animator.current)?.time||0,
            input:new Map([...r.studioInputPose].map(([bone,p])=>[bone,{position:p.position.clone(),rotation:p.rotation.clone()}])),
            weapon:{adsProgress:ads,isAiming:!!state.isAiming,isReloading:w.isReloading,reloadProgress:w.reloadProgress,reloadDuration:w.reloadDuration,fireActionRemaining:w.fireActionRemaining},
            rootPosition:r.object.position.clone(),rootRotation:r.object.quaternion.clone()};
        const data={slot,clip:frozen.clip,time:frozen.time,state:ads>.5?'aim':state.isFiring?'fire':['frag','flash','smoke'].includes(slot)?(w.utilityTimer>0?w.throwMode:w.pinProgress>0&&w.pinProgress<1?'pin':'hold'):'hip',
            ads,lean,posture:state.isCrouching?'crouch':'stand',side:Math.abs(lean)>.01?(lean<0?'left':'right'):null,
            firing:!!state.isFiring,reloading:!!w.isReloading,grounded:!!state.isGrounded,sliding:!!state.isSliding};
        frozen.context=data;send('frozen',{context:data});return data;
    }
    function applyLibrary(raw){
        audition=validateLibrary(raw);game.weapon.studioAudition=true;game.weapon.poseLibrary=audition;
        game.weapon.poseRevision=(game.weapon.poseRevision||0)+1;
        if(!frozen||!game.poseInspector.active)return;
        const r=game.thirdPerson.rig;
        for(const [bone,pose] of frozen.input){bone.position.copy(pose.position);bone.quaternion.copy(pose.rotation);}
        r.object.position.copy(frozen.rootPosition);r.object.quaternion.copy(frozen.rootRotation);r.object.updateMatrixWorld(true);
        applyFullBodyPose(r,audition,frozen.slot,frozen.context.ads,{clip:frozen.clip,time:frozen.time,isFiring:frozen.context.firing,state:['frag','flash','smoke'].includes(frozen.slot)?frozen.context.state:'hip'});
        r.peekPoses=audition.peekPoses;r.peekTimelines=audition.peekTimelines;
        const resolve=r.resolveAnimationPose;r.resolveAnimationPose=null;
        try{
            r.finishAnimatedPose(frozen.state);
            if(frozen.weapon.isReloading&&frozen.slot==='pistol'){
                const before=Object.fromEntries(Object.keys(frozen.weapon).map(k=>[k,game.weapon[k]]));
                Object.assign(game.weapon,frozen.weapon);
                try{game.thirdPerson.reloadPose();}finally{Object.assign(game.weapon,before);}
            }
        }finally{r.resolveAnimationPose=resolve;}
        r.object.updateMatrixWorld(true);
    }
    const api={
        get frozen(){return !!frozen&&game.poseInspector.active;},
        get context(){return frozen?.context||null;},
        applyLibrary,
        freeze(){if(!game.poseInspector.active)game.poseInspector.toggle();return frozen?.context;},
        resume(raw){if(raw)applyLibrary(raw);if(game.poseInspector.active)game.poseInspector.toggle();else game.canvas.requestPointerLock();},
        stop(){document.exitPointerLock();},
    };
    window.fastSnipeStudioBridge=api;
    game.poseInspector.onChange=active=>{
        if(active)capture();else{game.viewButton.disabled=true;frozen=null;send('resumed');}
    };
    game.thirdPerson.ready.then(()=>{
        game.thirdPerson.rig.captureStudioInput=true;
        game.thirdPerson.enabled=true;game.weapon.thirdPerson=true;
        game.viewButton.textContent='Full-body Studio test';game.viewButton.disabled=true;
        game.thirdPerson.update(0);send('ready');
    }).catch(error=>send('error',{message:error.message}));
    window.addEventListener('keydown',event=>{
        if(event.code==='KeyV'){event.preventDefault();event.stopImmediatePropagation();}
    },true);
    return api;
}
