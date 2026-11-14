import {propagateFrozenBase} from './FrozenCorrections.js';

export function createLiveStudio({getLibrary,onFreeze,notify}){
    const $=id=>document.getElementById(id),viewport=$('viewport');
    const button=document.createElement('button');button.id='studio-play';button.textContent='Play & capture pose';
    document.querySelector('.viewport-top').append(button);
    const panel=document.createElement('div');panel.id='studio-live-toolbar';panel.hidden=true;
    panel.innerHTML=`<div id="studio-live-status" role="status">Loading game controls…</div>
    <div class="live-actions"><button id="studio-live-freeze">P · Freeze pose</button><button id="studio-live-resume">Resume controls</button>
    <label>Correction applies to <select id="studio-live-scope"><option value="pose">Whole pose / state</option><option value="frame">Keyframe at frozen moment</option></select></label>
    <button id="studio-live-close">Back to preview</button></div>
    <small>WASD move · Shift sprint · X crouch · Q/E peek · RMB aim · LMB fire · R reload · Space jump · 1/2/6 guns · 3/4/5 grenades · P freeze</small>`;
    viewport.append(panel);let iframe=null,active=false,context=null,ready=false;
    const bridge=()=>iframe?.contentWindow?.fastSnipeStudioBridge;
    function status(message){$('studio-live-status').textContent=message;}
    function captured(value){
        context=value;onFreeze(value,$('studio-live-scope').value==='frame');
        const weapon=$('weapon').selectedOptions[0]?.textContent||value.slot;
        const clip=$('body-clip').selectedOptions[0]?.textContent||value.clip;
        status(`FROZEN · ${weapon} · ${clip} · ${value.time.toFixed(3)} s · ${value.posture}${value.side?' / peek '+value.side:''} · ${value.state==='aim'?'ADS':value.state==='fire'?'FIRING':value.state.toUpperCase()}`);
        $('studio-live-status').title='Source animation: '+value.clip;
        bridge()?.applyLibrary(getLibrary());
    }
    function close(){
        bridge()?.stop();iframe?.remove();iframe=null;active=false;ready=false;context=null;
        panel.hidden=true;document.body.classList.remove('studio-live');button.textContent='Play & capture pose';
        window.dispatchEvent(new Event('resize'));
    }
    button.onclick=()=>{
        if(active){close();return;}
        active=true;ready=false;panel.hidden=false;document.body.classList.add('studio-live');
        iframe=document.createElement('iframe');iframe.id='studio-live-game';iframe.title='Playable animation test';iframe.allow='fullscreen';
        iframe.src='/?map=training&studio=1';viewport.append(iframe);button.textContent='Close live test';
        status('Loading the game. Click its start button to control the character.');
    };
    $('studio-live-close').onclick=close;
    $('studio-live-freeze').onclick=()=>{if(!ready)return notify('The playable test is still loading.');if(bridge()?.frozen)captured(bridge().context);else bridge()?.freeze();};
    $('studio-live-resume').onclick=()=>{if(!ready)return;bridge()?.resume(getLibrary());iframe?.focus();};
    $('studio-live-scope').onchange=()=>{if(context&&bridge()?.frozen)captured(context);};
    window.addEventListener('message',event=>{
        if(!active||event.origin!==location.origin||event.source!==iframe?.contentWindow||event.data?.source!=='fast-snipe-studio-play')return;
        const {type}=event.data;
        if(type==='ready'){ready=true;bridge().applyLibrary(getLibrary());status('Click the game to start. Perform a movement, then press P to freeze and edit it.');}
        if(type==='frozen')captured(event.data.context);
        if(type==='resumed'){context=null;status('LIVE · Perform the pose you want to edit, then press P.');}
        if(type==='error')status('Could not start the test: '+event.data.message);
    });
    const resize=()=>{if(iframe){const top=panel.offsetTop+panel.offsetHeight;iframe.style.top=top+'px';iframe.style.height=`calc(100% - ${top}px)`;}};
    new ResizeObserver(resize).observe(panel);
    return {get active(){return active;},get frozen(){return !!context&&!!bridge()?.frozen;},get context(){return context;},prepareEdits(before){if(before&&context&&bridge()?.frozen&&$('studio-live-scope').value==='pose')propagateFrozenBase(before,getLibrary(),context);},apply(){if(active&&ready)bridge()?.applyLibrary(getLibrary());},close};
}
