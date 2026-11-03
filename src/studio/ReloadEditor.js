import * as THREE from 'three';
import { WEAPONS } from '../weapons/WeaponProfiles.js';
import { sampleReloadSequence, addTimelinePose, applySequenceFraming, applySequenceMechanics, sequenceMotion, wristMatrix } from './ReloadTimeline.js';

// Timeline keys are offsets from the user's saved grip, never replacements for it.
export function createReloadEditor({ weapon, getLibrary, transact, renderControls, addGroup, switchView, render, notify }) {
    const $ = id => document.getElementById(id);
    let active = false, time = 0, playing = false, target = 'weapon';
    const sequence = () => getLibrary().reloadSequence;
    const selected = () => sequence().keys.find(key => Math.abs(key.time - time) < .00005);
    const button = document.createElement('button'); button.id = 'edit-reload'; button.textContent = 'Edit M9 reload timeline';
    $('stance-note').after(button);
    const panel = document.createElement('div'); panel.id = 'reload-timeline'; panel.hidden = true;
    panel.innerHTML = `<div class="timeline-heading"><b>M9 / RELOAD TIMELINE</b><button id="reload-close">Back to poses</button></div>
        <div class="timeline-row"><button id="reload-play">▶ Play</button><output id="reload-clock"></output><label>Speed <select id="reload-speed"><option value=".25">0.25×</option><option value=".5">0.5×</option><option value="1" selected>1×</option></select></label><label><input type="checkbox" id="reload-loop" checked> Loop</label></div>
        <input type="range" id="reload-seek" min="0" max="1.15" step=".0001" value="0" aria-label="Reload timeline time">
        <div id="reload-keys"></div><div class="timeline-row"><button id="reload-add">+ Keyframe here</button><button id="reload-delete">Delete key</button><label>Duration (s) <input type="number" id="reload-duration" min=".5" max="6" step=".05"></label></div>
        <div class="timeline-row"><label>Ammo refill at (s) <input type="number" id="reload-ammo" min="0" step=".01"></label><button id="reload-sound">+ Reload sound here</button><button id="reload-clear-sounds">Clear sounds</button></div><small id="reload-events"></small>`;
    $('viewport').append(panel);
    function sync() {
        $('reload-seek').max = sequence().duration; $('reload-seek').value = time;
        $('reload-clock').textContent = `${time.toFixed(3)} / ${sequence().duration.toFixed(3)} s`;
        $('reload-play').textContent = playing ? 'Pause' : '▶ Play';
    }
    function setActive(value) {
        active = value; playing = false;
        if (active) { $('weapon').value = 'pistol'; $('stance').value = 'hip'; switchView('first'); }
        panel.hidden = !active;
        document.body.classList.toggle('reload-editing', active);
        $('parts').hidden = active;
        for (const id of ['stance','weapon','action','play','third-person','copy','save-both','reset']) $(id).disabled = active;
        button.textContent = active ? 'Editing M9 reload' : 'Edit M9 reload timeline';
        if (!active) { weapon.armsRig && (weapon.armsRig.lastPose = null); $('weapon').dispatchEvent(new Event('change')); }
        renderControls();
        window.dispatchEvent(new Event('resize'));
    }
    button.onclick = () => setActive(!active); $('reload-close').onclick = () => setActive(false);
    $('reload-play').onclick = () => { playing = !playing; if (playing && time >= sequence().duration) time = 0; renderControls(); };
    $('reload-seek').oninput = () => { playing = false; time = Number($('reload-seek').value); renderControls(); };
    $('reload-add').onclick = () => {
        if (sequence().keys.length >= 100) return notify('The timeline already has 100 keys.');
        if (!selected()) transact(() => { const key = sampleReloadSequence(sequence(), time); key.time = time; key.label = 'Custom pose'; sequence().keys.push(key); sequence().keys.sort((a,b)=>a.time-b.time); });
        renderControls();
    };
    $('reload-delete').onclick = () => { if (selected() && time > 0 && time < sequence().duration) transact(() => { sequence().keys = sequence().keys.filter(key => key !== selected()); }); };
    $('reload-duration').onchange = () => {
        const duration = Number($('reload-duration').value); if (!Number.isFinite(duration) || duration < .5 || duration > 6) return renderControls();
        transact(() => { const ratio = duration / sequence().duration; for (const key of sequence().keys) key.time *= ratio; for (const event of sequence().events) event.time *= ratio; time *= ratio; sequence().duration = duration; });
    };
    $('reload-ammo').onchange = () => { const t = Number($('reload-ammo').value); if (Number.isFinite(t) && t >= 0 && t <= sequence().duration) transact(() => { sequence().events.find(e=>e.type==='ammo').time = t; }); else renderControls(); };
    $('reload-sound').onclick = () => { if (sequence().events.length < 24) transact(() => sequence().events.push({time,type:'sound'})); };
    $('reload-clear-sounds').onclick = () => transact(() => { sequence().events = sequence().events.filter(e=>e.type!=='sound'); });
    function field(label, element) { const wrapper = document.createElement('label'); wrapper.className = 'field'; element.setAttribute('aria-label',label); wrapper.append(label, element); $('controls').append(wrapper); }
    function renderEditor() {
        for (const id of ['stance','weapon','action','play','third-person','copy','save-both','reset']) $(id).disabled = true;
        sync(); $('part-title').textContent = 'Reload keyframe';
        $('pose-name').textContent = 'M9 / RELOAD EDITOR';
        $('stance-note').textContent = 'Scrub to a moment, add a keyframe, then adjust it. Save to game applies this reload. Existing holding and aiming poses stay separate.';
        $('view-help').textContent = 'Sliders edit the selected key. Inspect in 3D to check contacts from every angle.';
        $('reload-duration').value = sequence().duration;
        $('reload-ammo').max = sequence().duration; $('reload-ammo').value = sequence().events.find(e=>e.type==='ammo').time;
        $('reload-events').textContent = sequence().events.map(e=>`${e.type === 'ammo' ? 'Ammo refill' : 'Sound'} @ ${e.time.toFixed(2)}s`).join(' · ');
        $('reload-keys').replaceChildren(...sequence().keys.map(key => {
            const b = document.createElement('button'); b.textContent = `${key.time.toFixed(2)} ${key.label}`; b.classList.toggle('active',key===selected());
            b.onclick = () => { playing = false; time = key.time; renderControls(); }; return b;
        }));
        $('reload-delete').disabled = !selected() || time === 0 || time === sequence().duration;
        const select = document.createElement('select'); select.id = 'reload-target';
        for (const [value,label] of [['weapon','Weapon + arms framing'],['Right','Right hand / trigger grip'],['Left','Left hand / magazine grip'],['magazine','Magazine'],['slide','Slide']]) select.add(new Option(label,value));
        select.value = target; select.onchange = () => { target = select.value; playing = false; renderControls(); }; field('Adjust',select);
        const key = selected();
        if (!key || playing) { const p = document.createElement('p'); p.textContent = playing ? 'Pause and select a keyframe to edit.' : 'Click “+ Keyframe here” to edit this moment, or select an existing key below.'; $('controls').append(p); return; }
        const label = document.createElement('input'); label.value = key.label; label.onchange = () => transact(() => { key.label = label.value.slice(0,50); }); field('Keyframe name',label);
        const keyTime = document.createElement('input'); keyTime.type = 'number'; keyTime.min = 0; keyTime.max = sequence().duration; keyTime.step = .001; keyTime.value = key.time;
        keyTime.disabled = key.time === 0 || key.time === sequence().duration;
        keyTime.onchange = () => {
            const next = keyTime.valueAsNumber;
            if (!Number.isFinite(next) || next <= 0 || next >= sequence().duration || sequence().keys.some(other => other !== key && Math.abs(other.time-next)<.0001)) return renderControls();
            transact(() => { key.time = time = next; sequence().keys.sort((a,b)=>a.time-b.time); });
        }; field('Keyframe time (s)',keyTime);
        const easing = document.createElement('select'); easing.add(new Option('Smooth','smooth')); easing.add(new Option('Linear','linear')); easing.value = key.easing; easing.onchange = () => transact(() => { key.easing = easing.value; }); field('Interpolation to next key',easing);
        if (target === 'slide') {
            const input = document.createElement('input'); input.type = 'number'; input.min = -10; input.max = 10; input.step = .1; input.value = key.slide*100;
            input.onchange = () => { if (Number.isFinite(input.valueAsNumber)) transact(() => { key.slide = THREE.MathUtils.clamp(input.valueAsNumber,-10,10)/100; }); }; field('Slide travel (cm)',input);
        } else if (target === 'magazine') {
            const attachment = document.createElement('select'); attachment.add(new Option('Weapon local','weapon')); attachment.add(new Option('Follow left hand','leftHand')); attachment.value = key.magazine.attachment;
            attachment.onchange = () => {
                const parts = weapon.pistolModel.userData.reloadParts; weapon.pistolModel.updateWorldMatrix(true,true);
                // Capture the current transform so attaching does not teleport the magazine.
                const world = parts.magazine.matrixWorld.clone();
                transact(() => {
                    key.magazine.attachment = attachment.value;
                    if (attachment.value === 'leftHand') {
                        world.premultiply(wristMatrix(weapon.armsRig.bones.LeftHand).invert());
                        const p = new THREE.Vector3(), q = new THREE.Quaternion(); world.decompose(p,q,new THREE.Vector3());
                        key.magazine.handPosition = p.toArray(); key.magazine.handRotation = new THREE.Euler().setFromQuaternion(q).toArray().slice(0,3);
                    } else {
                        world.premultiply(parts.magazine.parent.matrixWorld.clone().invert()); const p = new THREE.Vector3(),q = new THREE.Quaternion(); world.decompose(p,q,new THREE.Vector3());
                        key.magazine.position = p.sub(parts.magazineRest).toArray(); key.magazine.rotation = new THREE.Euler().setFromQuaternion(q).toArray().slice(0,3);
                    }
                });
            }; field('Magazine attachment',attachment);
            const visible = document.createElement('input'); visible.type = 'checkbox'; visible.checked = key.magazine.visible; visible.onchange = () => transact(() => { key.magazine.visible = visible.checked; }); field('Magazine visible from this key',visible);
            addGroup('Magazine position',key.magazine,key.magazine.attachment === 'leftHand' ? 'handPosition' : 'position',60,100,'cm');
            addGroup('Magazine rotation',key.magazine,key.magazine.attachment === 'leftHand' ? 'handRotation' : 'rotation',180,180/Math.PI,'°');
        } else {
            const p = key.pose[target]; addGroup(target === 'weapon' ? 'Weapon position' : 'Hand target',p,'position',60,100,'cm');
            addGroup(target === 'weapon' ? 'Weapon rotation' : 'Grip orientation',p,'rotation',180,180/Math.PI,'°');
            if (target !== 'weapon') {
                for (const [name,fieldName] of [['Hand-only rotation','handRotation'],['Shoulder rotation','shoulderRotation'],['Elbow rotation','elbowRotation']]) addGroup(name,p,fieldName,180,180/Math.PI,'°');
                addGroup('Elbow direction',p,'elbow',60,100,'cm'); addGroup('Shoulder anchor',p,'shoulder',60,100,'cm');
                for (const finger of Object.keys(p.fingers)) addGroup(`${finger} finger joints`,p.fingers,finger,90,180/Math.PI,'°');
            }
        }
    }
    function frame(dt) {
        if (!active) return false;
        if (playing) { time += dt*Number($('reload-speed').value); if (time >= sequence().duration) { time = $('reload-loop').checked ? time % sequence().duration : sequence().duration; if (!$('reload-loop').checked) { playing = false; renderControls(); } } }
        sync();
        weapon.activeSlot = 'pistol'; weapon.grenadeEquipped = null; weapon.isAiming = false; weapon.adsProgress = 0; weapon.isReloading = false; weapon.utilityTimer = 0; weapon.switchTimer = 0;
        weapon.hipPos.fromArray(WEAPONS.pistol.hip); weapon.adsPos.fromArray(WEAPONS.pistol.aim);
        weapon.equipment = null; weapon.weaponGroup.visible = true;
        weapon.update(0); weapon.rifleModel.visible = false; weapon.pistolModel.visible = true;
        weapon.weaponGroup.traverse(object => { if (object.name?.startsWith('Grenade')) object.visible = false; });
        const sample = sampleReloadSequence(sequence(),time), custom = addTimelinePose(getLibrary().poses['pistol:hip'],sample.pose);
        applySequenceFraming(weapon.weaponGroup.position,weapon.weaponGroup.rotation,sample);
        weapon.armsRig.reset(); weapon.armsRig.poseHands(weapon.weaponGroup,{pose:'pistol',reload:time/sequence().duration,custom,motion:sequenceMotion(time/sequence().duration)});
        applySequenceMechanics(weapon.pistolModel,weapon.armsRig,sample); render(); return true;
    }
    return { get active(){return active;}, render:renderEditor, frame, get time(){return time;} };
}
