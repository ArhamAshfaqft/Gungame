import {updateThrowableGrip,THROW_RELEASE} from '../models/ThrowableMotion.js';
import {loadProjectLibrary,saveProjectLibrary,preserveBrowserPoses} from './ProjectPoses.js';
import {createLiveStudio} from './LiveStudio.js';
import {createAnimationEditor} from './AnimationEditor.js';
import {STATE_LABELS,BODY_JOINTS,emptyBody} from './AnimationEdits.js';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { SniperWeapon } from '../weapons/SniperWeapon.js';
import { WEAPONS } from '../weapons/WeaponProfiles.js';
import { handTargets, createSwatRig, BODY_SUPPORT_GRIP } from '../models/SwatRig.js';
import { loadSniperModel } from '../models/SniperModel.js';
import { loadPistolModel } from '../models/PistolModel.js';
import {loadAssaultRifleModel,applyAssaultMechanics,assaultReloadMotion} from '../models/AssaultRifleModel.js';
import { equipmentClips } from '../models/ShooterAnimator.js';
import { sampleViewAction } from '../models/ViewActions.js';
import { samplePistolHold } from '../models/PistolHold.js';
import { createMarkedGrip } from './MarkedGrip.js';
import {lookThroughCharacter,setCharacterEyeView} from '../models/SharedEyeView.js';
import {fullBodyPose,applyFullBodyPose} from './FullBodyPoses.js';
import {applySniperM4Pose} from './SharedM4Grips.js';
import {updateHolographicSight} from '../models/HolographicSight.js';
import { applyPistolMechanics } from '../models/PistolReload.js';
import { createGrenadeModel, grenadeModelPosition, applyGrenadePlacement } from '../models/GrenadeModel.js';
import { FINGERS, emptyLibrary, readLibrary, saveLibrary, validateLibrary, copyGripToOtherStance, THROWABLE_TYPES, THROWABLE_STATES, GRENADE_FRAME } from './PoseLibrary.js';
import './style.css';
import { createReloadEditor } from './ReloadEditor.js';
import { createPeekEditor } from './PeekEditor.js';
import {confirmPeekSave} from './PoseSync.js';
import { sampleReloadSequence, addTimelinePose, applySequenceFraming, applySequenceMechanics, sequenceMotion } from './ReloadTimeline.js';
import {createGuidedGrip} from './GuidedGrip.js';
import {gripEditTarget,nudgeGrip,setGripCurl,resetGripStep,copyHandFit,sightAlignment} from './GripSetup.js';

const $ = id => document.getElementById(id);
const clone = data => JSON.parse(JSON.stringify(data));
const viewport = $('viewport');
const renderer = new THREE.WebGLRenderer({ canvas: $('preview'), antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;
const movement = { isLocked: true, isGrounded: true, currentFov: 85, velocity: new THREE.Vector3(),
    position: new THREE.Vector3(), mouseDelta: new THREE.Vector2(), getSpeed: () => 0,
    requestWeaponReady() {}, pitch: 0, yaw: 0, sprintRecovery: 0 };
class StudioWeapon extends SniperWeapon { setupInput() {} }
const weapon = new StudioWeapon(new THREE.Scene(), new THREE.PerspectiveCamera(85, 1, 0.01, 200), movement);
const scene = weapon.viewmodelScene;
const grenadeModels = Object.fromEntries(THROWABLE_TYPES.map(type => {
    const model = createGrenadeModel(type); model.visible = false; weapon.weaponGroup.add(model); return [type, model];
}));
const isThrowable = () => THROWABLE_TYPES.includes($('weapon').value);
const stateLabels = { hold: 'Holding / ready', pin: 'Pull pin', high: 'High throw', low: 'Low toss', ...STATE_LABELS };
let previewOptions = {};
const environment = new RoomEnvironment(), pmrem = new THREE.PMREMGenerator(renderer);
const env = pmrem.fromScene(environment, 0.04);
scene.environment = env.texture; scene.environmentIntensity = 0.65;
environment.dispose(); pmrem.dispose();
const camera = weapon.viewmodelCamera;
const bodyScene = new THREE.Scene(); bodyScene.environment = env.texture; bodyScene.environmentIntensity = 0.65;
for (const light of scene.children.filter(child => child.isLight)) bodyScene.add(light.clone());
const bodyCamera = new THREE.PerspectiveCamera(42, 1, 0.01, 30);
const bodyEyeCamera = new THREE.PerspectiveCamera(85,1,.025,30);
let bodyEyeView=false;
bodyCamera.position.set(2.8, 1.7, 3.2);
const bodyOrbit = new OrbitControls(bodyCamera, renderer.domElement);
bodyOrbit.target.set(0, 0.95, 0); bodyOrbit.enableDamping = true; bodyOrbit.minDistance = 0.7; bodyOrbit.maxDistance = 8; bodyOrbit.enabled = false; bodyOrbit.update();
const bodyGrid = new THREE.GridHelper(8, 40, 0x647c89, 0x35434e); bodyScene.add(bodyGrid);
let bodyRig, bodyModels, bodySkeleton, bodyTime = 0, bodyPlaying = true, bodyLoadError = '';
const bodyLeanLabel=document.createElement('label');bodyLeanLabel.className='field';bodyLeanLabel.id='body-lean-control';
bodyLeanLabel.textContent='Peek / lean — left to right';
const bodyLeanSlider=document.createElement('input');bodyLeanSlider.type='range';bodyLeanSlider.id='body-lean';bodyLeanSlider.min=-1;bodyLeanSlider.max=1;bodyLeanSlider.step=.01;bodyLeanSlider.value=0;bodyLeanSlider.setAttribute('aria-label','Full-body peek lean');
const bodyLeanOutput=document.createElement('output');bodyLeanOutput.textContent='Centered';
bodyLeanSlider.oninput=()=>{bodyLeanOutput.textContent=Number(bodyLeanSlider.value)===0?'Centered':`${Number(bodyLeanSlider.value)<0?'Left':'Right'} ${Math.round(Math.abs(Number(bodyLeanSlider.value))*100)}%`;};
const resetLean=document.createElement('button');resetLean.textContent='Center peek';resetLean.onclick=()=>{bodyLeanSlider.value=0;bodyLeanSlider.oninput();};
bodyLeanLabel.append(bodyLeanOutput,bodyLeanSlider,resetLean);$('body-controls').append(bodyLeanLabel);
const bodyTarget = new THREE.Object3D();
const bodyGripTarget = new THREE.Object3D();
let bodyDragBase;
Promise.all([createSwatRig(), loadSniperModel(), loadPistolModel(),loadAssaultRifleModel()]).then(([rig, rifle, pistol,assault]) => {
    bodyRig = rig; bodyScene.add(rig.object); rifle.scale.setScalar(0.85);
    rig.object.add(bodyTarget, bodyGripTarget);
    bodyModels = { primary: rifle, pistol, assault, ...Object.fromEntries(THROWABLE_TYPES.map(type => [type, createGrenadeModel(type)])) };
    for (const model of Object.values(bodyModels)) { model.visible = false; rig.object.add(model); }
    bodySkeleton = new THREE.SkeletonHelper(rig.object); bodyScene.add(bodySkeleton);
    if (!rig.animator) throw new Error('Animation data unavailable.');
    configureBodyClips();
    if(view==='third')$('stance').disabled=false;
}).catch(error => { bodyLoadError = error.message; console.error(error); });
const inspectionCamera = new THREE.PerspectiveCamera(45, 1, 0.01, 20);
const orbit = new OrbitControls(inspectionCamera, renderer.domElement);
orbit.enableDamping = true; orbit.minDistance = 0.15; orbit.maxDistance = 4;
orbit.enabled = false;
const grid = new THREE.GridHelper(4, 40, 0x63717d, 0x35434e);
grid.position.y = -0.7; grid.visible = false; scene.add(grid);
const gizmo = new TransformControls(inspectionCamera, renderer.domElement);
gizmo.setSize(0.7); gizmo.setSpace('local');
scene.add(gizmo.getHelper()); gizmo.enabled = false; gizmo.getHelper().visible = false;
const guideRoot = new THREE.Group(); weapon.weaponGroup.add(guideRoot);
const markerGeometry = new THREE.SphereGeometry(0.009, 12, 8);
const markers = {};
for (const side of ['Left', 'Right']) {
    markers[side] = {};
    for (const field of ['position', 'elbow', 'shoulder']) {
        const marker = new THREE.Mesh(markerGeometry, new THREE.MeshBasicMaterial({ color: side === 'Left' ? 0x53cfcd : 0xe8b75b, depthTest: false, transparent: true, opacity: field === 'position' ? 1 : 0.55 }));
        marker.renderOrder = 20; marker.scale.setScalar(field === 'position' ? 1 : 0.65);
        guideRoot.add(marker); markers[side][field] = marker;
    }
}
const weaponTarget = new THREE.Object3D(); scene.add(weaponTarget);
const itemTarget = new THREE.Object3D(); weapon.weaponGroup.add(itemTarget);
const rotationTarget = new THREE.Object3D(); scene.add(rotationTarget);
let rotationBase = new THREE.Quaternion();
const rotationFields = { shoulderRotation: 'Arm', elbowRotation: 'ForeArm', handRotation: 'Hand' };
const isJointRotation = () => part !== 'weapon' && !!rotationFields[targetField];
const selectedBone = () => weapon.armsRig?.bones[part + rotationFields[targetField]];
const lineGeometry = new THREE.BufferGeometry();
lineGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(24), 3));
const lines = new THREE.LineSegments(lineGeometry, new THREE.LineBasicMaterial({ color: 0x94acbc, transparent: true, opacity: 0.5, depthTest: false }));
lines.frustumCulled = false; lines.renderOrder = 19; guideRoot.add(lines);

let library = readLibrary(), saved = JSON.stringify(library), part = 'weapon', view = 'first', targetField = 'position';
let history = [], future = [], editBefore = null, playing = false, actionTime = 0, toastTimer;
let liveStudio;
let animationEditor;
let bodyJoint='Spine2';
let reloadEditor;
let peekEditor;
let guidedGrip;
let guideWalking=false;
let renderingControls = false;
weapon.poseLibrary = library;
const key = () => `${$('weapon').value}:${$('stance').value}`;
const pose = () => animationEditor&&view!=='third'?animationEditor.fit():library.poses[key()];
const sharedM4 = () => view==='third' && $('weapon').value==='assault';
const bodyFit = () => {
    const fit=animationEditor ? animationEditor.fit() : fullBodyPose(library,$('weapon').value,$('stance').value);
    return sharedM4()?{...fit,Left:library.m4SharedGrips.Left,Right:library.m4SharedGrips.Right}:fit;
};
const bodyHand = () => bodyFit()[part];
const bodyDefaults = () => fullBodyPose(emptyLibrary(),$('weapon').value,$('stance').value);
function notify(message) { $('toast').textContent = message; $('toast').style.display = 'block'; clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').style.display = 'none', 3500); }
function updateSavedState() {
    const dirty = JSON.stringify(library) !== saved;
    $('save-state').textContent = dirty ? 'Unsaved changes' : library.projectRevision ? 'Saved to game project' : 'Saved in this browser';
    $('save-state').style.color = dirty ? '#e9b85a' : '';
    $('undo').disabled = history.length === 0; $('redo').disabled = future.length === 0;
}
function changed() { animationEditor?.commit();liveStudio?.prepareEdits(editBefore);liveStudio?.apply(); weapon.poseLibrary = library; weapon.poseRevision = (weapon.poseRevision || 0) + 1; updateSavedState(); }
function beginEdit() { editBefore ||= clone(library); }
function finishEdit() {
    animationEditor?.commit();
    if (editBefore && JSON.stringify(editBefore) !== JSON.stringify(library)) { history.push(editBefore); if (history.length > 100) history.shift(); future = []; }
    editBefore = null; updateSavedState();
}
function transact(operation) { finishEdit(); beginEdit(); operation(); changed(); finishEdit(); renderControls(); }
function restore(direction) {
    finishEdit(); const source = direction === 'undo' ? history : future, destination = direction === 'undo' ? future : history;
    if (!source.length) return;
    destination.push(clone(library)); library = source.pop(); changed(); renderControls();
}
function resetCamera() {
    if (view === 'third') { bodyCamera.position.set(2.8, 1.7, 3.2); bodyOrbit.target.set(0, 0.95, 0); bodyOrbit.update(); return; }
    inspectionCamera.position.set(1.05, 0.2, 0.7); orbit.target.set(0.18, -0.35, -0.85); orbit.update();
}
resetCamera();
function switchView(next) {
    bodyEyeView=false;
    if(bodyRig)setCharacterEyeView(bodyRig,false);
    view = next; orbit.enabled = view === 'orbit';
    bodyOrbit.enabled = view === 'third';
    document.body.classList.toggle('fullbody-mode', view === 'third'); $('body-controls').hidden = view !== 'third';
    $('third-person').classList.toggle('active', view === 'third');
    for (const element of document.querySelectorAll('[data-part],#save,#save-both,#copy,#reset,#stance')) element.disabled = false;
    if (view === 'third') {
        part = 'weapon'; targetField = 'position';
        document.querySelector('[data-part="weapon"]').disabled = false;
        document.querySelector('[data-part="Left"]').disabled = false;
        document.querySelector('[data-part="Right"]').disabled = false;
        $('save').disabled = false; $('reset').disabled = false;$('stance').disabled=false;
        $('body-controls').before($('controls'));
    }
    $('first-person').classList.toggle('active', view === 'first'); $('orbit').classList.toggle('active', view === 'orbit');
    $('reticle').style.display = view === 'first' ? '' : 'none'; grid.visible = view === 'orbit';
    $('view-help').textContent = view === 'first' ? 'Preview uses the same 62° weapon camera as gameplay.' : 'Drag to orbit · Right-drag to pan · Scroll to zoom · Drag axes to move the target';
    attachGizmo();
    renderControls();
}
function baseTarget(side, field) {
    const left = side === 'Left';
    if (field === 'shoulder') return new THREE.Vector3(...(left ? [-0.28, -0.34, 0.04] : [0.3, -0.36, 0.26]));
    if (field === 'elbow') return new THREE.Vector3(...(left ? [-0.6, -0.6, 0.05] : [0.5, -0.6, 0.05]));
    const target = handTargets(previewOptions)[side];
    if (previewOptions.pose === 'pistol' && weapon.pistolHold) target.lerp(weapon.pistolHold.hands[side].position, weapon.pistolHold.weight);
    return target;
}
function attachGizmo() {
    if(part==='body'&&view==='third'){gizmo.detach();gizmo.enabled=false;gizmo.getHelper().visible=false;return;}
    if(bodyEyeView){gizmo.detach();gizmo.enabled=false;gizmo.getHelper().visible=false;return;}
    if(peekEditor?.active){gizmo.detach();gizmo.enabled=false;gizmo.getHelper().visible=false;return;}
    if (reloadEditor?.active) { gizmo.detach(); gizmo.enabled = false; gizmo.getHelper().visible = false; return; }
    if (view === 'third') {
        gizmo.detach(); gizmo.camera = bodyCamera;
        bodyScene.add(gizmo.getHelper());
        gizmo.enabled = !!bodyRig && !bodyPlaying && $('helpers').checked;
        gizmo.getHelper().visible = gizmo.enabled;
        gizmo.setMode(targetField === 'rotation' ? 'rotate' : 'translate');
        gizmo.getHelper().visible = gizmo.enabled;
        if (gizmo.enabled) gizmo.attach(part === 'Left' || part === 'Right' ? bodyGripTarget : bodyTarget);
        return;
    }
    gizmo.camera = inspectionCamera; scene.add(gizmo.getHelper());
    gizmo.detach(); gizmo.enabled = view === 'orbit' && $('helpers').checked && !playing;
    gizmo.getHelper().visible = gizmo.enabled;
    gizmo.setMode(isJointRotation() || part === 'item' && targetField === 'rotation' ? 'rotate' : 'translate');
    if (gizmo.enabled) gizmo.attach(part === 'item' ? itemTarget : part === 'weapon' ? weaponTarget : isJointRotation() ? rotationTarget : markers[part][targetField]);
}
gizmo.addEventListener('dragging-changed', event => {
    orbit.enabled = !event.value && view === 'orbit';
    bodyOrbit.enabled = !event.value && view === 'third';
    if (event.value) {
        beginEdit();
        if (view === 'third') {
            bodyDragBase = part === 'Right' ? { position: bodyRig.rightGripBase.position.clone(), quaternion: bodyRig.rightGripBase.quaternion.clone() }
                : part === 'Left' ? { position: bodyRig.supportGripBasePosition?.clone(), quaternion: bodyRig.supportGripBaseQuaternion.clone() }
                : { position: bodyRig.thirdPersonBase.position.clone(), quaternion: bodyRig.thirdPersonBase.quaternion.clone() }; return;
        }
        if (isJointRotation()) rotationBase.copy(selectedBone().quaternion).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(...pose()[part][targetField])).invert());
    } else { finishEdit(); renderControls(); }
});
gizmo.addEventListener('objectChange', () => {
    if (!gizmo.dragging) return;
    let values;
    if (view === 'third') {
        if (part === 'Left' || part === 'Right') {
            const support = bodyHand();
            if (targetField === 'rotation') {
                const world = bodyRig.object.getWorldQuaternion(new THREE.Quaternion()).multiply(bodyGripTarget.quaternion);
                const euler = new THREE.Euler().setFromQuaternion(bodyDragBase.quaternion.clone().invert().multiply(world));
                support.rotation = [euler.x, euler.y, euler.z];
            } else if (part === 'Right' || !bodyRig.supportUsesWeaponTarget) {
                support.position = bodyRig.object.localToWorld(bodyGripTarget.position.clone()).sub(bodyDragBase.position)
                    .applyQuaternion(bodyRig.animatedModel.getWorldQuaternion(new THREE.Quaternion()).invert()).toArray().map(n => THREE.MathUtils.clamp(n, -0.6, 0.6));
            } else support.position = bodyRig.animatedModel.worldToLocal(bodyRig.object.localToWorld(bodyGripTarget.position.clone())).sub(bodyRig.animatedModel.userData.supportGrip||BODY_SUPPORT_GRIP).toArray().map(n => THREE.MathUtils.clamp(n, -0.6, 0.6));
            changed(); syncInputs(); return;
        }
        const placement = bodyFit().weapon;
        if (targetField === 'rotation') {
            const q = bodyDragBase.quaternion.clone().invert().multiply(bodyTarget.quaternion);
            const angles = new THREE.Euler().setFromQuaternion(q);
            placement.rotation = [angles.x, angles.y, angles.z];
        } else placement.position = bodyTarget.position.clone().sub(bodyDragBase.position).applyQuaternion(bodyDragBase.quaternion.clone().invert()).toArray().map(n => THREE.MathUtils.clamp(n, -0.6, 0.6));
        changed(); syncInputs(); return;
    }
    if (part === 'item') {
        if (targetField === 'rotation') {
            pose().item.rotation = [itemTarget.rotation.x, itemTarget.rotation.y, itemTarget.rotation.z];
        } else {
            const base = new THREE.Vector3().fromArray(grenadeModelPosition(weapon.throwProgress, weapon.throwMode));
            pose().item.position = itemTarget.position.clone().sub(base).toArray().map(n => THREE.MathUtils.clamp(n, -0.6, 0.6));
        }
        changed(); syncInputs(); return;
    }
    if (isJointRotation()) {
        const parentRotation = selectedBone().parent.getWorldQuaternion(new THREE.Quaternion()).invert();
        const local = parentRotation.multiply(rotationTarget.quaternion);
        const offset = rotationBase.clone().invert().multiply(local);
        const angles = new THREE.Euler().setFromQuaternion(offset, 'XYZ');
        pose()[part][targetField] = [angles.x, angles.y, angles.z];
        changed(); syncInputs(); return;
    }
    if (part === 'weapon') {
        const profile = WEAPONS[$('weapon').value];
        const base = new THREE.Vector3().fromArray(isThrowable() ? GRENADE_FRAME : $('stance').value === 'hip' ? profile.hip : profile.aim);
        if (isThrowable() && ['high', 'low'].includes($('stance').value)) base.y -= 0.09;
        values = weaponTarget.position.clone().sub(base).toArray();
    } else values = markers[part][targetField].position.clone().sub(baseTarget(part, targetField)).toArray();
    pose()[part][part === 'weapon' ? 'position' : targetField] = values.map(n => THREE.MathUtils.clamp(n, -0.6, 0.6));
    changed(); syncInputs();
});

function addGroup(title, object, field, limit, scale, unit) {
    const group = document.createElement('section'); group.className = 'control-group';
    const heading = document.createElement('h3'); heading.textContent = title; group.append(heading);
    const axes = unit === '°' && title.includes('finger') ? ['1', '2', '3'] : ['X', 'Y', 'Z'];
    for (let axis = 0; axis < 3; axis++) {
        const row = document.createElement('div'); row.className = 'axis-row';
        const label = document.createElement('label'); label.textContent = axes[axis];
        const range = document.createElement('input'); range.type = 'range'; range.min = -limit; range.max = limit; range.step = 0.1;
        const number = document.createElement('input'); number.type = 'number'; number.min = -limit; number.max = limit; number.step = 0.1;
        range.setAttribute('aria-label', `${title} ${axes[axis]}`); number.setAttribute('aria-label', `${title} ${axes[axis]} value`);
        const update = () => { range.value = number.value = (object[field][axis] * scale).toFixed(1); };
        row._sync = update; update();
        for (const input of [range, number]) {
            input.addEventListener('input', () => {
                if (input.value === '' || !Number.isFinite(input.valueAsNumber)) return;
                beginEdit(); object[field][axis] = THREE.MathUtils.clamp(input.valueAsNumber, -limit, limit) / scale;
                if (view === 'third') { bodyPlaying = false; $('body-play').textContent = 'Play animation'; attachGizmo(); }
                update(); changed();
            });
            input.addEventListener('change', finishEdit);
        }
        row.append(label, range, number); group.append(row);
    }
    const note = document.createElement('div'); note.className = 'range-note'; note.textContent = unit === '°' ? 'Rotation offsets in degrees' : view === 'third' ? 'Offsets in weapon-local centimetres' : 'Offsets in centimetres · X right / Y up / Z toward camera'; group.append(note);
    $('controls').append(group);
}
function syncInputs() { document.querySelectorAll('.axis-row').forEach(row => row._sync?.()); }
function renderControls() {
    if (renderingControls) return;
    renderingControls = true;
    try { renderControlsNow(); } finally { renderingControls = false; }
}
function renderControlsNow() {
    $('controls').replaceChildren();
    animationEditor?.sync();
    peekEditor?.sync();
    if(peekEditor?.active){peekEditor.render();attachGizmo();updateSavedState();return;}
    if (reloadEditor?.active) { attachGizmo(); reloadEditor.render(); updateSavedState(); return; }
    if (view === 'third') {
        $('copy').textContent='Copy to chosen animation / state';$('save-both').textContent='Copy to chosen animation / state';
        $('stance').disabled=false;
        $('stance-note').textContent=`Editing full-body ${stateLabels[$('stance').value] || 'holding'}. Ready, firing and ADS save independently for the selected animation. ${library.sharedFirstPerson?.[$('weapon').value]?'Both cameras share this pose.':'Manual first-person settings stay separate.'}`;
        if(part==='body'){
            $('part-title').textContent='Body, head & legs';
            const select=document.createElement('select');select.id='body-joint';
            for(const name of BODY_JOINTS)select.add(new Option(name,name));select.value=bodyJoint;
            select.onchange=()=>{bodyJoint=select.value;renderControls();};$('controls').append(select);
            bodyFit().body ||= emptyBody();const joint=bodyFit().body[bodyJoint];
            addGroup(bodyJoint+' position',joint,'position',60,100,'cm');
            addGroup(bodyJoint+' rotation',joint,'rotation',180,180/Math.PI,'°');
            $('reset').textContent='Reset this body joint';attachGizmo();updateSavedState();return;
        }
        const supportMode = part === 'Left' || part === 'Right';
        const rightMode = part === 'Right';
        document.querySelector('[data-part="Right"]').disabled = false;
        document.querySelector('[data-part="Left"]').disabled = false;
        document.querySelector('[data-part="Left"] span').textContent = 'Fit left hand / support grip';
        $('part-title').textContent = rightMode ? `Full-body ${$('stance').value==='aim'?'ADS':$('stance').value==='fire'?'firing':'ready'} trigger grip` : supportMode ? `Full-body ${$('stance').value==='aim'?'ADS':$('stance').value==='fire'?'firing':'ready'} support grip` : 'Full-body weapon placement';
        if (supportMode) {
            if(sharedM4()){
                $('part-title').textContent=rightMode?'M4 shared trigger grip':'M4 shared support grip';
                $('stance-note').textContent='M4 hand edits apply to ALL third-person holding animations and Ready / Firing / ADS states. Reload releases the hands normally. Save to game when finished.';
                const sharedNote=document.createElement('p');sharedNote.className='muted small';sharedNote.textContent='Shared M4 grip offsets: adjust once, then inspect other animations. Use Save to project for a permanent project save.';$('controls').append(sharedNote);
            }
            const support = bodyHand();
            $('item-part').hidden = true;
            document.querySelectorAll('[data-part]').forEach(button => button.classList.toggle('active', button.dataset.part === part));
            addGroup(rightMode ? 'Trigger-hand position' : 'Support-hand position', support, 'position', 60, 100, 'cm');
            addGroup(rightMode ? 'Trigger-hand rotation' : 'Support-hand rotation', support, 'rotation', 180, 180 / Math.PI, '°');
            const select = document.createElement('select'); select.id = 'body-grip-tool';
            select.append(new Option(rightMode ? 'Move trigger hand' : 'Move support hand', 'position'), new Option(rightMode ? 'Rotate trigger hand' : 'Rotate support hand', 'rotation'));
            select.value = targetField; select.onchange = () => { targetField = select.value; bodyPlaying = false; $('body-play').textContent = 'Play animation'; attachGizmo(); };
            const fit = document.createElement('button'); fit.id = 'fit-support-hand'; fit.textContent = 'Reset to fitted grip';
            fit.onclick = () => { transact(() => { Object.assign(bodyHand(),bodyDefaults()[part]); }); if (!rightMode) $('body-hand-ik').checked = true; attachGizmo(); };
            const note = document.createElement('p'); note.className = 'muted small'; note.textContent = rightMode ? 'Fit the trigger hand without moving the weapon. Position offsets use weapon axes; wrist rotation uses hand axes. Finger offsets adjust the grip. Saves stay separate from the left hand and first-person poses.' : 'Adjust the left hand independently for this equipment. Rifle support IK follows the fore-end. Pistols, grenades and released-hand actions retain their original animated hand base. Position uses weapon axes; rotation uses hand axes. Move the target closer if it exceeds arm reach. First-person poses stay separate.';
            const reach = document.createElement('p'); reach.id = 'support-reach'; reach.className = 'muted small';
            $('controls').append(select, fit, note, reach);
            for(const [label,field] of [['Shoulder anchor','shoulder'],['Elbow direction','elbowTarget']])addGroup(label,support,field,60,100,'cm');
            for(const [label,field] of [['Upper arm rotation','shoulderRotation'],['Forearm rotation','elbowRotation'],['Wrist-only rotation','handRotation'],['Thumb rotation','thumbRotation']])addGroup(label,support,field,180,180/Math.PI,'°');
            for (const finger of FINGERS) addGroup(`${finger} finger joints`, support.fingers, finger, 90, 180 / Math.PI, '°');
            $('reset').textContent = rightMode ? 'Reset trigger grip' : 'Reset support grip'; attachGizmo(); updateSavedState(); return;
        }
        $('part-title').textContent = `Full-body ${$('stance').value==='aim'?'ADS':$('stance').value==='fire'?'firing':'ready'} weapon placement`;
        $('group-label').textContent = 'Weapon placement'; $('item-part').hidden = true;
        document.querySelector('[data-part="weapon"] span').textContent = 'Move / rotate weapon only';
        $('stance-note').textContent = `Editing full-body ${stateLabels[$('stance').value] || 'holding'}. Ready, firing and ADS save independently for the selected animation. ${library.sharedFirstPerson?.[$('weapon').value]?'Both cameras share the selected pose.':'Manual first-person settings stay separate.'}`;
        document.querySelectorAll('[data-part]').forEach(button => button.classList.toggle('active', button.dataset.part === 'weapon'));
        addGroup('Third-person position', bodyFit().weapon, 'position', 60, 100, 'cm');
        addGroup('Third-person rotation', bodyFit().weapon, 'rotation', 180, 180 / Math.PI, '°');
        const select = document.createElement('select'); select.id = 'body-placement-tool';
        select.append(new Option('Move weapon', 'position'), new Option('Rotate weapon', 'rotation'));
        select.value = targetField;
        select.onchange = () => { targetField = select.value; bodyPlaying = false; $('body-play').textContent = 'Play animation'; attachGizmo(); };
        const note = document.createElement('p'); note.className = 'muted small';
        note.textContent = 'Saved for the selected Ready/hipfire or Aiming pose. Offsets use weapon-local axes. The original authored arm pose and saved grip offsets are used. Both camera views share these settings when full-body mode is enabled.';
        $('controls').append(select, note); $('reset').textContent = 'Reset third-person placement';
        attachGizmo(); updateSavedState(); return;
    }
    $('reset').textContent = 'Reset this pose';
    document.querySelector('[data-part="Left"] span').textContent = 'Support grip';
    document.querySelector('[data-part="weapon"] span').textContent = 'Move weapon and arms together';
    $('part-title').textContent = view === 'third' ? 'Full-body animations' : part === 'item' ? 'Grenade only' : part === 'weapon' ? isThrowable() ? 'Arms + grenade group' : 'Weapon placement' : `${part} hand & arm`;
    $('item-part').hidden = !isThrowable();
    $('group-label').textContent = isThrowable() ? 'Arms + grenade group' : 'Weapon placement';
    document.querySelectorAll('[data-part]').forEach(button => button.classList.toggle('active', button.dataset.part === part));
    const current = pose()[part];
    addGroup(part === 'item' ? 'Grenade-only position' : part === 'weapon' ? 'Weapon position' : 'Hand target', current, 'position', 60, 100, 'cm');
    if (part === 'weapon' || part === 'item') addGroup(part === 'item' ? 'Grenade-only rotation' : 'Weapon rotation', current, 'rotation', 180, 180 / Math.PI, '°');
    if (part === 'item') {
        const note = document.createElement('p'); note.className = 'muted small';
        note.textContent = 'These controls move only the grenade. Hand targets, arm joints and the group placement stay fixed.';
        const select = document.createElement('select'); select.id = 'item-tool';
        select.append(new Option('Move grenade only', 'position'), new Option('Rotate grenade only', 'rotation'));
        select.value = targetField; select.onchange = () => { targetField = select.value; attachGizmo(); };
        $('controls').append(note, select);
    }
    if (part !== 'weapon' && part !== 'item') {
        addGroup('Hand-only rotation', current, 'handRotation', 180, 180 / Math.PI, '°');
        const note = document.createElement('p'); note.className = 'muted small';
        note.textContent = 'Hand-only rotation pivots at the wrist and leaves the arm fixed. Shoulder and elbow rotations move their child joints naturally, so the hand may leave its grip target.';
        $('controls').append(note);
        const label = document.createElement('label'); label.className = 'field'; label.textContent = '3D joint / target';
        const select = document.createElement('select'); select.id = 'gizmo-target';
        for (const [value, text] of [['handRotation', 'Rotate hand only'], ['elbowRotation', 'Rotate elbow / forearm'], ['shoulderRotation', 'Rotate shoulder / upper arm'], ['position', 'Move hand grip (IK)'], ['elbow', 'Move elbow direction (IK)'], ['shoulder', 'Move shoulder anchor']]) { const option = document.createElement('option'); option.value = value; option.textContent = text; select.append(option); }
        select.value = targetField; select.onchange = () => { targetField = select.value; attachGizmo(); };
        label.append(select); $('controls').append(label);
        addGroup('Shoulder joint rotation', current, 'shoulderRotation', 180, 180 / Math.PI, '°');
        addGroup('Elbow joint rotation', current, 'elbowRotation', 180, 180 / Math.PI, '°');
        addGroup('Thumb rotation', current, 'thumbRotation', 180,180/Math.PI,'°');
        addGroup('Grip orientation (arm follows)', current, 'rotation', 180, 180 / Math.PI, '°');
        addGroup('Elbow direction', current, 'elbow', 60, 100, 'cm'); addGroup('Shoulder anchor', current, 'shoulder', 60, 100, 'cm');
        for (const finger of FINGERS) addGroup(`${finger} finger joints`, current.fingers, finger, 90, 180 / Math.PI, '°');
    }
    $('pose-name').textContent = `${isThrowable() ? $('weapon').value.toUpperCase() : WEAPONS[$('weapon').value].name.split(' // ')[0]} / ${stateLabels[$('stance').value].toUpperCase()}`;
    $('stance-note').textContent = isThrowable() ? `Editing ${stateLabels[$('stance').value].toUpperCase()}. Each throwable has its own holding, pin-pull, high-throw and low-toss presets. Save applies them to gameplay.` : $('stance').value === 'aim'
        ? 'Editing AIMING. In game, select this weapon and hold right mouse to see this pose. Ready / hipfire is saved separately.'
        : 'Editing READY / HIPFIRE. In game, select this weapon and release right mouse to see this pose. Aiming is saved separately.';
    if($('stance').value==='fire')$('stance-note').textContent='Editing FIRE WITHOUT ADS. This state is used while firing without aiming; Ready and ADS stay separate.';
    if(view==='third'&&library.sharedFirstPerson?.[$('weapon').value])$('stance-note').textContent='Editing the full-body fit used by both first-person and third-person gameplay. Switch cameras to inspect the same hands and weapon.';
    $('copy').textContent = 'Copy to chosen animation / state';
    $('save-both').textContent = 'Copy both grips to all states';
    if (view === 'first') $('view-help').textContent = isThrowable() ? 'Throwable preview keeps the grenade visible for grip editing.' : $('weapon').value === 'primary' && $('stance').value === 'aim'
        ? 'Optic stays visible for editing. Gameplay uses the sniper scope overlay.' : 'Preview uses the same 62° weapon camera as gameplay.';
    attachGizmo(); updateSavedState();
}
document.querySelectorAll('[data-part]').forEach(button => button.onclick = () => {
    finishEdit(); part = button.dataset.part; targetField = part === 'weapon' || part === 'item' ? 'position' : 'handRotation';
    if (view === 'third' && part === 'Left') { targetField = 'position'; $('body-hand-ik').checked = true; }
    if (view === 'third' && part === 'Right') targetField = 'position';
    if (view === 'third') { bodyPlaying = false; $('body-play').textContent = 'Play animation'; }
    renderControls();
});
function configureLoadout() {
    if (!isThrowable() && part === 'item') { part = 'weapon'; targetField = 'position'; }
    const previous = $('stance').value;
    const states = isThrowable() ? THROWABLE_STATES : ['hip', 'fire', 'aim'];
    $('stance').replaceChildren(...states.map(state => new Option(stateLabels[state], state)));
    $('stance').value = states.includes(previous) ? previous : states[0];
    const actions = isThrowable() ? [['idle', 'Hold pose'], ['draw', 'Imported grenade draw'], ['pin', 'Pin-pull preview'], ['high', 'High-throw preview'], ['low', 'Low-toss preview']]
        : [['idle', 'Idle / holding'],['walk','Walk'],['sprint','Sprint'],['crouch','Crouched'],['peekLeft','Peek left'],['peekRight','Peek right'],['crouchPeekLeft','Crouched peek left'],['crouchPeekRight','Crouched peek right'], ['draw', 'Imported draw'], ['reload', $('weapon').value === 'pistol' ? 'Coordinated M9 reload' : 'Reload preview'], ['fire', 'Imported firing'], ['bolt', 'Bolt preview']];
    $('action').replaceChildren(...actions.map(([value, label]) => new Option(label, value)));
    configureBodyClips();
}
function configureBodyClips() {
    if (!bodyRig?.animator) return;
    const current = $('body-clip').value;
    const kind = isThrowable() ? 'grenade' : $('weapon').value === 'pistol' ? 'pistol' : 'rifle';
    const clips = equipmentClips(bodyRig.animator.pack, kind);
    $('body-clip').replaceChildren(...clips.map(clip => new Option(clip.name, clip.id)));
    $('body-clip').value = clips.some(clip => clip.id === current) ? current : kind === 'pistol' ? 'pistolIdle' : kind === 'grenade' ? 'throw' : 'idle';
    if ($('body-clip').value !== current) bodyTime = 0;
    $('body-hand-ik').disabled = false;
}
for (const id of ['weapon', 'stance']) $(id).onchange = () => {
    finishEdit(); playing = false; actionTime = 0; $('play').textContent = '▶ Play';
    if (id === 'weapon') configureLoadout();
    animationEditor?.resetSelection();
    if(peekEditor?.active)peekEditor.refreshPreview();
    if (isThrowable()) $('action').value = $('stance').value === 'hold' ? 'idle' : $('stance').value;
    changed(); renderControls();
    guidedGrip?.refresh();
};
$('first-person').onclick = () => {if(library.sharedFirstPerson?.[$('weapon').value]){openBodyEyes();return;}if(guidedGrip?.active)guidedGrip.setScope(false);switchView('first');}; $('orbit').onclick = () => {if(library.sharedFirstPerson?.[$('weapon').value]){switchView('third');return;}if(guidedGrip?.active)guidedGrip.setScope(false);switchView('orbit');}; $('frame').onclick = resetCamera;
$('third-person').onclick = () => guidedGrip?.active?guidedGrip.setScope(true):switchView('third');
$('body-clip').onchange = () => { finishEdit();bodyTime = 0; animationEditor?.resetSelection();renderControls();attachGizmo(); };
$('body-hand-ik').onchange = attachGizmo;
$('body-play').onclick = () => { bodyPlaying = !bodyPlaying; $('body-play').textContent = bodyPlaying ? 'Pause animation' : 'Play animation'; attachGizmo(); };
$('body-time').oninput = () => { bodyPlaying = false; bodyTime = Number($('body-time').value); $('body-play').textContent = 'Play animation'; attachGizmo(); };
$('body-speed').oninput = () => { $('body-speed-value').textContent = `${Number($('body-speed').value).toFixed(2)}×`; };
$('helpers').onchange = attachGizmo;
$('undo').onclick = () => restore('undo'); $('redo').onclick = () => restore('redo');
$('reset').onclick = () => {
    if(peekEditor?.active){peekEditor.reset();return;}
    transact(() => {
    if(view==='third'&&part==='body'){bodyFit().body[bodyJoint]=emptyBody()[bodyJoint];}
    else if (view === 'third' && (part === 'Left' || part === 'Right')) Object.assign(bodyHand(),bodyDefaults()[part]);
    else if (view === 'third') Object.assign(bodyFit().weapon,bodyDefaults().weapon);
    else Object.assign(pose(),emptyLibrary().poses[key()]);
    });
};
$('copy').onclick = () => {
    if(animationEditor){document.getElementById('animation-copy').click();return;}
    transact(() => {
        const states = isThrowable() ? THROWABLE_STATES : [$('stance').value === 'hip' ? 'aim' : 'hip'];
        const source = clone(pose());
        for (const state of states) library.poses[`${$('weapon').value}:${state}`] = clone(source);
    }); notify(isThrowable() ? 'Copied this pose to all actions for this throwable.' : 'Copied adjustments to the other stance.');
};
async function saveCurrentToGame(){
    const clean=await saveProjectLibrary(library);weapon.projectPoseLibrary=clean;return clean;
}
const saveToGameAction = async () => {
    finishEdit();
    if(peekEditor?.active){
        try{
            library=await saveCurrentToGame();saved=JSON.stringify(library);changed();renderControls();
            const profileKey=peekEditor.key,label=peekEditor.label;
            peekEditor.showSaveStatus(`Saved ${label}. Checking open game tabs…`);
            notify('Saved third-person peek presets. Checking game connection…');
            const result=await confirmPeekSave(profileKey,library.peekPoses[profileKey]);
            const message=!result.received?`Saved ${label}. Refresh the GAME tab once to load peek editing support, then test this exact preset.`
                :!result.matches?`Saved ${label}, but the game has different data. Refresh the game tab.`
                :`Saved ${label}. Game received these exact settings.${result.thirdPerson?'':' Press V in game to see third-person edits.'}`;
            peekEditor.showSaveStatus(message);notify(message);
        }catch(error){notify(`Could not save: ${error.message}`);}return;
    }
    if (reloadEditor.active) {
        try { library = await saveCurrentToGame(); saved = JSON.stringify(library); changed(); renderControls(); notify('Saved M9 reload timeline to game. Press R with the pistol equipped to play it.'); }
        catch (error) { notify(`Could not save: ${error.message}`); }
        return;
    }
    try { library = await saveCurrentToGame(); saved = JSON.stringify(library); changed(); renderControls(); notify('Saved to the game project. All browsers now use these poses.'); }
    catch (error) { notify(`Could not save: ${error.message}`); }
};
$('save').onclick=async()=>{ $('save').disabled=true;try{await saveToGameAction();}finally{$('save').disabled=false;} };
$('save-both').onclick = () => {
    if(animationEditor){animationEditor.copyGripsToStates();return;}
    transact(() => {
        if (!isThrowable()) for(const state of ['hip','fire','aim'])if(state!==$('stance').value)for(const side of ['Left','Right'])library.poses[`${$('weapon').value}:${state}`][side]=clone(pose()[side]);
        else {
            const source = clone(pose());
            for (const state of THROWABLE_STATES) for (const side of ['Left', 'Right']) library.poses[`${$('weapon').value}:${state}`][side] = clone(source[side]);
        }
    });
    try {
        library = saveLibrary(library); saved = JSON.stringify(library); changed(); renderControls();
        notify(isThrowable() ? 'Saved this throwable grip to all its actions. Firearm poses are unchanged.' : 'Saved this grip to READY and AIMING. Weapon placement stays separate.');
    } catch (error) { notify(`Could not save: ${error.message}`); }
};
$('export').onclick = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(validateLibrary(library), null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = 'fast-snipe-poses.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    notify('Exported current poses. Use Save to game to apply them locally.');
};
$('import').onclick = () => $('file').click();
$('file').onchange = async () => {
    const file = $('file').files[0]; if (!file) return;
    try { if (file.size > 1000000) throw new Error('Pose file is too large.'); const imported = validateLibrary(JSON.parse(await file.text())); transact(() => { library = imported; }); notify('Imported. Preview your poses, then Save to game.'); }
    catch (error) { notify(`Import failed: ${error.message}`); }
    $('file').value = '';
};
$('play').onclick = () => { playing = !playing; actionTime = 0; $('play').textContent = playing ? '■ Stop' : '▶ Play'; attachGizmo(); };
$('action').onchange = () => {finishEdit(); actionTime = 0;animationEditor?.resetSelection();renderControls();};
window.addEventListener('keydown', event => {
    if ((event.ctrlKey || event.metaKey) && event.code === 'KeyS') { event.preventDefault(); $('save').click(); }
    if ((event.ctrlKey || event.metaKey) && event.code === 'KeyZ' && !['INPUT', 'SELECT'].includes(document.activeElement.tagName)) { event.preventDefault(); restore(event.shiftKey ? 'redo' : 'undo'); }
});
window.addEventListener('beforeunload', event => { if (JSON.stringify(library) !== saved) { event.preventDefault(); event.returnValue = ''; } });
function resize() {
    const width = viewport.clientWidth, height = Math.max(160, viewport.clientHeight - (reloadEditor?.active ? $('reload-timeline').offsetHeight + 32 : 0));
    renderer.domElement.style.height = `${height}px`;
    $('reticle').style.top = reloadEditor?.active ? `${height/2}px` : '';
    renderer.setSize(width, height, false); camera.aspect = inspectionCamera.aspect = width / height;
    camera.updateProjectionMatrix(); inspectionCamera.updateProjectionMatrix();
    bodyCamera.aspect = bodyEyeCamera.aspect = width / height; bodyCamera.updateProjectionMatrix();bodyEyeCamera.updateProjectionMatrix();
}
reloadEditor = createReloadEditor({ weapon, getLibrary: () => library, transact, renderControls, addGroup, switchView, notify,
    render: () => { guideRoot.visible = false; for (const model of Object.values(grenadeModels)) model.visible = false; if (view === 'orbit') orbit.update(); renderer.render(scene, view === 'orbit' ? inspectionCamera : camera); } });
peekEditor=createPeekEditor({getLibrary:()=>library,transact,renderControls,switchView,getView:()=>view,addGroup,notify,
    setPreview:state=>{
        bodyPlaying=false;$('body-play').textContent='Play animation';bodyTime=0;
        if(!state){bodyLeanSlider.value=0;bodyLeanSlider.oninput();return;}
        const pistol=$('weapon').value==='pistol';
        const id=state.posture==='crouch'?(pistol?'pistolCrouchIdle':'rifleCrouchIdle'):(pistol?'pistolIdle':state.stance==='hip'?'rifleReadyIdle':'idle');
        if([...$('body-clip').options].some(option=>option.value===id))$('body-clip').value=id;animationEditor?.resetSelection();
    }});
function guideStop(){markedGrip?.cancel();finishEdit();playing=false;actionTime=0;guideWalking=false;movement.getSpeed=()=>0;$('play').textContent='▶ Play';bodyPlaying=false;$('body-play').textContent='Play animation';attachGizmo();}
function guideTarget(which,third){return third?bodyFit()[which]:pose()[which];}
function guideCamera(kind,which,third){
 markedGrip?.cancel();
 if(third){
  if(view!=='third')switchView('third');
  if(kind==='player'){resetCamera();return;}
  requestAnimationFrame(()=>{
   const hand=which==='Left'||which==='Right'?bodyRig?.bones[which+'Hand']:bodyRig?.bones.Spine2;if(!hand)return;
   const point=hand.getWorldPosition(new THREE.Vector3());bodyOrbit.target.copy(point);
   bodyCamera.position.copy(point).add(new THREE.Vector3(kind==='close'?.65:1.6,.2,kind==='close'?.65:.8));bodyOrbit.update();
  });return;
 }
 switchView(kind==='player'?'first':'orbit');
 if(kind==='player')return;
 requestAnimationFrame(()=>{
  if(!weapon.armsRig)return;
  const point=which==='Left'||which==='Right'?weapon.armsRig.bones[which+'Hand'].getWorldPosition(new THREE.Vector3()):weapon.weaponGroup.localToWorld(new THREE.Vector3(0,0,-.2));
  orbit.target.copy(point);inspectionCamera.position.copy(point).add(new THREE.Vector3(kind==='close'?(which==='Left'?-.65:.65):.85,.2,kind==='close'?.6:.25));orbit.update();
 });
}
const markedGrip=createMarkedGrip({canvas:renderer.domElement,target:guideTarget,edit:transact,
 context:(which,third)=>{
  const rig=third?bodyRig:weapon.armsRig,slot=$('weapon').value;
  const model=third?bodyModels?.[slot]:slot==='pistol'?weapon.pistolModel:slot==='assault'?weapon.assaultModel:weapon.rifleModel;
  return rig&&model?{rig,model,camera:third?(bodyEyeView?bodyEyeCamera:bodyCamera):view==='orbit'?inspectionCamera:camera}:null;
 },
 picking:enabled=>{orbit.enabled=!enabled&&view==='orbit';bodyOrbit.enabled=!enabled&&view==='third';if(enabled){gizmo.enabled=false;gizmo.getHelper().visible=false;}else attachGizmo();}
});
guidedGrip=createGuidedGrip({
 holographic:()=>$('weapon').value==='assault',
 shared:()=>!!library.sharedFirstPerson?.[$('weapon').value],
 markControls:(parent,which,third)=>markedGrip.mount(parent,which,third),clearMarks:()=>markedGrip.clear(),
 available:()=>!!WEAPONS[$('weapon').value],weaponName:()=>WEAPONS[$('weapon').value]?.name||'',notify,
 stop:guideStop,restoreControls:()=>{guideStop();renderControls();},begin:beginEdit,finish:()=>{finishEdit();updateSavedState();},
 select:({part:which,third,step})=>{
  if(peekEditor?.active)$('edit-peek').click();if(reloadEditor?.active)$('edit-reload').click();
  $('helpers').checked=true;part=which;targetField='position';
  if(!third)$('stance').value=step===3?'aim':'hip';
  switchView(third?'third':step===1||step===2?'orbit':'first');part=which;targetField='position';
  if(third){$('body-hand-ik').checked=true;const id=$('weapon').value==='pistol'?'pistolIdle':'idle';if([...$('body-clip').options].some(o=>o.value===id))$('body-clip').value=id;bodyTime=0;}
  renderControls();attachGizmo();if(step===1||step===2)guideCamera('close',which,third);else if(third)resetCamera();
 },
 baseline:(which,third)=>clone(guideTarget(which,third)),edit:transact,
 nudge:(which,third,axis,amount,field='position')=>nudgeGrip(guideTarget(which,third),field,axis,amount),
 adjust:(which,third,base,field,axis,amount)=>{beginEdit();const actualField=!third&&field==='rotation'?'handRotation':field;guideTarget(which,third)[actualField][axis]=THREE.MathUtils.clamp(base[actualField][axis]+amount,-Math.PI,Math.PI);changed();},
 curl:(which,third,base,amount,options)=>{beginEdit();setGripCurl(guideTarget(which,third),base,amount,options);changed();},
 fingerJoint:(which,third,base,finger,joint,amount)=>{beginEdit();guideTarget(which,third).fingers[finger][joint]=THREE.MathUtils.clamp(base.fingers[finger][joint]+amount,-1.6,1.6);changed();},
 preset:(which,third,amount)=>transact(()=>setGripCurl(guideTarget(which,third),gripEditTarget(emptyLibrary(),$('weapon').value,$('stance').value,which,third),amount)),
 copy:which=>$('animation-copy').click(),
 snap:(which,third)=>{
  const slot=$('weapon').value,rig=third?bodyRig:weapon.armsRig,model=third?bodyModels?.[slot]:slot==='assault'?weapon.assaultModel:slot==='pistol'?weapon.pistolModel:weapon.rifleModel;
  const anchor=model?.getObjectByName(which==='Right'?'anchor_grip':'anchor_fore');
  if(!rig||!anchor){notify('No grip marker for this hand. Use the move buttons.');return;}
  model.updateWorldMatrix(true,true);rig.object.updateWorldMatrix(true,true);
  const hand=rig.bones[which+'Hand'],finger=rig.bones[which+'HandMiddle1'];
  const palm=hand.getWorldPosition(new THREE.Vector3()).lerp((finger||hand).getWorldPosition(new THREE.Vector3()),.65);
  const contact=model.worldToLocal(anchor.getWorldPosition(new THREE.Vector3())).add(which==='Right'?new THREE.Vector3(.01,-.065,.015):new THREE.Vector3(0,-.035,.025));model.localToWorld(contact);
  const delta=contact.sub(palm).applyQuaternion((third?model:weapon.weaponGroup).getWorldQuaternion(new THREE.Quaternion()).invert());
  if(third&&which==='Left'&&bodyRig.supportUsesWeaponTarget)delta.divide(model.scale);
  transact(()=>{const target=guideTarget(which,third);for(let i=0;i<3;i++)nudgeGrip(target,'position',i,delta.getComponent(i));});notify('Moved the palm to the grip marker. Inspect the fingers and make small corrections.');
 },
 reset:(which,third)=>transact(()=>{if(third)Object.assign(bodyFit()[which],clone(bodyDefaults()[which]));else Object.assign(pose()[which],clone(emptyLibrary().poses[key()][which]));}),
 camera:guideCamera,drag:(which,third)=>{guideStop();part=which;targetField='position';guideCamera('side',which,third);attachGizmo();notify('Drag the coloured arrows on the hand target. The arm follows automatically.');},
 undo:()=>restore('undo'),redo:()=>restore('redo'),
 align:()=>{
  const slot=$('weapon').value,model=slot==='assault'?weapon.assaultModel:slot==='pistol'?weapon.pistolModel:weapon.rifleModel;
  const rear=model?.getObjectByName('anchor_sight_iron'),front=model?.getObjectByName('anchor_sight_front');
  if(slot==='primary'){notify('The sniper uses a scope overlay. Use the move buttons to adjust its framing.');return;}
  if(!rear||!front){notify('This model has no paired sight markers. Use the move buttons to centre it.');return;}
  weapon.weaponGroup.updateWorldMatrix(true,true);
  const a=weapon.weaponGroup.worldToLocal(rear.getWorldPosition(new THREE.Vector3())),b=weapon.weaponGroup.worldToLocal(front.getWorldPosition(new THREE.Vector3()));
  transact(()=>Object.assign(library.poses[`${slot}:aim`].weapon,sightAlignment(a,b,WEAPONS[slot].aim,library.poses[`${slot}:aim`].weapon.position)));notify('Aligned the sight line. Your hand fits were kept.');
 },
 preview:(id,third)=>{
  guideStop();if(third){if(!isThrowable()&&['aim','stand'].includes(id))$('stance').value=id==='aim'?'aim':'hip';switchView('third');const pistol=$('weapon').value==='pistol',clip=id==='reload'?(pistol?'pistolReload':'reload'):id==='walk'?(pistol?'pistolWalk':'walk'):id==='crouch'?(pistol?'pistolCrouchIdle':'rifleCrouchIdle'):(pistol?'pistolIdle':id==='stand'?'rifleReadyIdle':'idle');
   if([...$('body-clip').options].some(o=>o.value===clip))$('body-clip').value=clip;bodyTime=0;bodyPlaying=id==='walk'||id==='reload';$('body-play').textContent=bodyPlaying?'Pause animation':'Play animation';resetCamera();
  }else{switchView('first');$('stance').value=id==='aim'?'aim':'hip';if(id==='reload'){$('action').value='reload';playing=true;$('play').textContent='■ Stop';}else if(id==='walk'){guideWalking=true;movement.getSpeed=()=>2.4;movement.isGrounded=true;}else movement.getSpeed=()=>0;}
  attachGizmo();
 },
 status:(which,third)=>{
  if(!weapon.armsRig)return{text:'Loading hands…'};
  let miss=0;
  if(which==='Left'||which==='Right'){
   const contact=guideTarget(which,third).contact,rig=third?bodyRig:weapon.armsRig;
   if(contact){const gap=rig?.contactMiss?.[which];return gap==null?{text:'Connection saved. It releases during draw/reload actions.'}:gap>.01?{warning:true,text:`Marks are ${(gap*100).toFixed(1)} cm apart: this contact is beyond the arm’s reach. Choose a closer spot or adjust the shoulder.`}:{text:`Palm connected · marks ${(gap*1000).toFixed(1)} mm apart. Turn the wrist and shape the fingers to finish the fit.`};}
   if(third)miss=which==='Left'?bodyRig?.supportGripMiss||0:bodyRig?.rightGripMiss||0;
   else{const desired=baseTarget(which,'position').add(new THREE.Vector3().fromArray(pose()[which].position));weapon.weaponGroup.localToWorld(desired);miss=weapon.armsRig.bones[which+'Hand'].getWorldPosition(new THREE.Vector3()).distanceTo(desired);}
  }
  return miss>.025?{warning:true,text:`Hand target is ${(miss*100).toFixed(1)} cm beyond the final hand position. Bring it closer; check wrist and arm edits.`}:{text:which==='weapon'?'Inspect the fit from more than one view before saving.':'Hand target is within reach. Check palm and finger contact in the close-up.'};
 }
});
const eyeButton=document.createElement('button');eyeButton.id='view-through-eyes';eyeButton.textContent='View through eyes';$('third-person').after(eyeButton);
const sharedLabel=document.createElement('label');sharedLabel.className='check';sharedLabel.id='shared-first-person-label';
const sharedCheck=document.createElement('input');sharedCheck.type='checkbox';sharedCheck.id='shared-first-person';
sharedLabel.append(sharedCheck,'Use full-body pose in first person');$('stance-note').after(sharedLabel);
sharedCheck.onchange=()=>{const enabled=sharedCheck.checked;transact(()=>{library.sharedFirstPerson[$('weapon').value]=enabled;});if(enabled)openBodyEyes();else switchView('third');};
function openBodyEyes(){
 const selected=part;switchView('third');part=selected;bodyEyeView=true;bodyOrbit.enabled=false;markedGrip.clear();
 $('first-person').classList.add('active');$('third-person').classList.remove('active');eyeButton.classList.add('active');
 $('reticle').style.display='';renderControls();attachGizmo();
}
eyeButton.onclick=openBodyEyes;
new ResizeObserver(resize).observe(viewport); resize(); animationEditor=createAnimationEditor({getLibrary:()=>library,getView:()=>view,getTime:()=>view==='third'?bodyTime:actionTime,setTime:time=>{if(view==='third'){bodyTime=time;bodyPlaying=false;$('body-play').textContent='Play animation';}else{actionTime=time;playing=false;$('play').textContent='▶ Play';}},isPlaying:()=>view==='third'?bodyPlaying:playing,transact,renderControls,onBody:()=>{if(peekEditor.active){peekEditor.selectPart('body');return;}part='body';bodyPlaying=false;$('body-play').textContent='Play animation';renderControls();},notify});
$('body-hand-ik').closest('label').hidden=true;
const clipLabel=$('body-clip').closest('label');clipLabel.id='body-clip-field';clipLabel.firstChild.textContent='Animation / action';
const selections=document.createElement('div');selections.className='studio-selection';
$('weapon').closest('label').before(selections);const actionLabel=$('action').closest('label');actionLabel.id='view-action-field';actionLabel.firstChild.textContent='First-person action';
selections.append($('weapon').closest('label'),$('stance').closest('label'),clipLabel,actionLabel);

liveStudio=createLiveStudio({getLibrary:()=>library,notify,onFreeze:(capture,keyframe)=>{
 finishEdit();guidedGrip?.close();if(reloadEditor.active)$('reload-close').click();
 $('weapon').value=capture.slot;configureLoadout();$('stance').value=capture.state;
 switchView('third');
 if([...$('body-clip').options].some(o=>o.value===capture.clip))$('body-clip').value=capture.clip;
 bodyPlaying=false;$('body-play').textContent='Play animation';bodyTime=capture.time;
 bodyLeanSlider.value=capture.lean;bodyLeanSlider.oninput();
 animationEditor.selectFrozenTime(capture.time,keyframe&&!capture.side);
 peekEditor.selectContext(capture,keyframe&&!!capture.side);
 $('preview-shooting').checked=capture.firing&&capture.state==='aim';
 renderControls();
}});
const projectSave=document.createElement('button');projectSave.id='save-project';projectSave.textContent='Save to project';projectSave.title='Save the pose library into project files for future builds';projectSave.hidden=!import.meta.env.DEV;
$('save').after(projectSave);
projectSave.onclick=async()=>{
 finishEdit();projectSave.disabled=true;
 try{
  library=await saveCurrentToGame();saved=JSON.stringify(library);changed();renderControls();
  notify('Saved your exact poses to the game project. All browsers use this shared version.');
 }catch(error){notify('Project save failed: '+error.message);}finally{projectSave.disabled=false;}
};
loadProjectLibrary().then(project=>{
 if(project&&(project.projectRevision||!localStorage.getItem('fast-snipe-poses-v1'))&&JSON.stringify(library)===saved){
  preserveBrowserPoses();library=project;saved=JSON.stringify(project);changed();renderControls();
 }
});
configureLoadout(); renderControls();
new ResizeObserver(resize).observe($('reload-timeline'));
let previous = performance.now();
function frame(now) {
    if(liveStudio?.active){requestAnimationFrame(frame);animationEditor?.updateTime();previous=now;return;}
    sharedCheck.checked=!!library.sharedFirstPerson?.[$('weapon').value];eyeButton.classList.toggle('active',bodyEyeView);
    animationEditor?.updateTime();
    markedGrip.update();
    guidedGrip?.update(now);
    requestAnimationFrame(frame); const dt = Math.min((now - previous) / 1000, 0.05); previous = now;
    if(guideWalking)movement.bobTime=(movement.bobTime||0)+dt*10;
    const ready = weapon.armsRig && weapon.pistolModel && weapon.rifleModel && weapon.assaultModel;
    $('loading').style.display = ready ? 'none' : '';
    if (!ready) { renderer.render(scene, camera); return; }
    if (reloadEditor.frame(dt)) return;
    if (view === 'third') {
        $('loading').style.display = bodyRig?.animator ? 'none' : '';
        $('loading').textContent = bodyLoadError || 'Loading full-body animation pack…';
        if (bodyRig?.animator) {
            const id = $('body-clip').value, duration = bodyRig.animator.clips.get(id)?.duration || 1;
            if (bodyPlaying) bodyTime += dt * Number($('body-speed').value);
            if (bodyTime > duration) bodyTime = $('body-loop').checked ? bodyTime % duration : duration;
            $('body-time').max = duration; $('body-time').value = bodyTime;
            $('body-time-value').textContent = `${bodyTime.toFixed(2)} / ${duration.toFixed(2)} s`;
            bodyRig.animator.sample(id, bodyTime);
            const slot = $('weapon').value, grenade = isThrowable();
            const runPreview=/^(rifleRun(?!Stop)|run|strafeRun)/.test(id);
            const previewSpeed=/run/i.test(id)&&!/stop/i.test(id)?3.1:/walk|strafe/i.test(id)?1.4:0;
            bodyRig.animator.runningCarry?.apply(0,{equipment:grenade?'grenade':slot==='pistol'?'pistol':'rifle',speed:runPreview?3.1:0,isSprinting:id==='rifleRunFootwork',isAiming:$('stance').value==='aim',
                forward:/Backward|Back/.test(id)?-1:/strafe/i.test(id)?0:1,lateral:/Left/.test(id)?-1:/Right/.test(id)?1:0},{phase:bodyTime/duration});
            for (const [type, model] of Object.entries(bodyModels)) model.visible = type === slot;
            const poseSlot=slot==='assault'?'primary':slot;
            const fit=slot==='assault'?applySniperM4Pose(bodyRig,library,'primary',$('stance').value==='aim'?1:0,{clip:id,time:bodyTime,state:'hip',isFiring:$('stance').value==='fire'}):animationEditor.preview();
            bodyRig.thirdPersonPlacements={[poseSlot]:fit.weapon};bodyRig.thirdPersonGrips={[poseSlot]:fit.Left};bodyRig.thirdPersonRightGrips={[poseSlot]:fit.Right};
            if(slot!=='assault'){bodyRig.pinTriggerToWeapon=animationEditor.entry().pinTrigger;bodyRig.poseSupportIK=animationEditor.entry().supportIK;bodyRig.poseCrouchAssist=animationEditor.entry().crouchAssist;}bodyRig.thirdPersonBody=fit.body;
            bodyRig.peekPoses=library.peekPoses;bodyRig.peekTimelines=library.peekTimelines;

            bodyRig.attachAnimatedModel(bodyModels[slot], grenade ? 'grenade' : slot === 'pistol' ? 'pistol' : 'rifle', poseSlot);
            bodyRig.finishAnimatedPose({ throwProgress:grenade&&id==='throw'?bodyTime/duration:0,throwMode:$('stance').value==='low'?'low':'high',pinProgress:0,handIK: $('body-hand-ik').checked,lean:Number(bodyLeanSlider.value),speed:previewSpeed,isCrouching:/crouch|kneel/i.test(id),isGrounded:!/jump/i.test(id),isReloading:/reload/i.test(id),isSprinting:id==='rifleRunFootwork',forward:/Backward|Back/.test(id)?-1:/strafe/i.test(id)?0:1,lateral:/Left/.test(id)?-1:/Right/.test(id)?1:0,isAiming:$('stance').value==='aim',isFiring:$('stance').value==='fire'||$('preview-shooting').checked,adsProgress:$('stance').value==='aim'?1:0,...peekEditor.state() });
            const shotPreview=$('stance').value==='fire'||($('stance').value==='aim'&&$('preview-shooting').checked);
            applyAssaultMechanics(bodyModels.assault,slot==='assault'&&id==='reload'?bodyTime/duration:0,shotPreview?(bodyTime%.15)/.15:0);
            const reach = $('support-reach');
            if (reach && part === 'Right') reach.textContent = bodyRig.rightGripMiss > 0.005 ? `Target exceeds arm reach by ${(bodyRig.rightGripMiss * 100).toFixed(1)} cm. Move it closer.` : 'Trigger-hand target reached.';
            else if (reach) reach.textContent = bodyRig.supportGripMiss > 0.005 ? `Target is ${(bodyRig.supportGripMiss * 100).toFixed(1)} cm beyond the hand’s reach. Move the target closer or adjust weapon placement.` : bodyRig.supportUsesWeaponTarget ? 'Support target reached.' : 'Left-hand target reached (animated hand base).';
            if (!gizmo.dragging) { bodyTarget.position.copy(bodyModels[slot].position); bodyTarget.quaternion.copy(bodyModels[slot].quaternion); }
            const gripTarget = part === 'Right' ? bodyRig.rightGripTarget : bodyRig.supportGripTarget;
            if (!gizmo.dragging && gripTarget && (part === 'Right' || part === 'Left')) {
                bodyGripTarget.position.copy(bodyRig.object.worldToLocal(gripTarget.position.clone()));
                bodyGripTarget.quaternion.copy(bodyRig.object.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(gripTarget.quaternion));
            }
            bodySkeleton.visible = $('helpers').checked&&!bodyEyeView;
            $('pose-name').textContent = `FULL BODY / ${stateLabels[$('stance').value]?.toUpperCase()} / ${bodyRig.animator.pack.clips.find(clip => clip.id === id)?.name.toUpperCase()}`;
            $('view-help').textContent = part === 'Left' ? 'Fit the support hand to the rifle. Keep support-hand IK enabled. First-person grips stay separate.' : 'Pause to move/rotate the weapon. Drag elsewhere to orbit. Third-person saves stay separate from first-person poses.';
            $('body-note').textContent = slot === 'pistol' ? '20 pistol clips plus 10 composed crouch clips: directional crouch footwork with a pistol upper body. Saved first-person placements and reload stay separate.'
                : grenade ? 'Grenade upper body uses the gameplay grip and release timeline. High and low throws have separate paths; saved joint adjustments still apply.' : 'Rifle movement pack. Weapon follows the trigger hand; support-hand IK can be disabled to inspect the original clip.';
        }
        if(bodyRig)setCharacterEyeView(bodyRig,bodyEyeView);
        bodyGrid.visible=!bodyEyeView;
        if(bodyEyeView&&bodyRig){lookThroughCharacter(bodyEyeCamera,bodyRig);$('view-help').textContent='Same full-body pose, viewed through the character’s eyes. Enable “Use full-body pose in first person” and Save to game to use it in gameplay.';}
        else bodyOrbit.update();
        updateHolographicSight(bodyModels?.assault,bodyEyeView?bodyEyeCamera:bodyCamera);
        renderer.render(bodyScene, bodyEyeView?bodyEyeCamera:bodyCamera); return;
    }
    const slot = $('weapon').value, aim = $('stance').value === 'aim' ? 1 : 0;
    const grenade = isThrowable();
    let grenadeState = $('stance').value;
    let phase = grenadeState === 'pin' ? 0.5 : ['high', 'low'].includes(grenadeState) ? 0.3 : 0;
    if (playing && grenade) {
        actionTime += dt; grenadeState = $('action').value === 'idle' ? 'hold' : $('action').value;
        phase = (actionTime % 2.4) / 2.4;
    }
    const throwing = grenade && ['high', 'low'].includes(grenadeState);
    weapon.grenadeEquipped = grenade;
    weapon.equipment = grenade ? { held: { type: slot } } : null;
    weapon.pinProgress = grenade && grenadeState === 'pin' ? phase : 0;
    weapon.grenadeDrawRemaining = grenade && grenadeState === 'draw' ? 0.4 * (1 - phase) : 0;
    weapon.throwProgress = throwing ? phase : 0; weapon.throwMode = grenadeState === 'low' ? 'low' : 'high';
    weapon.utilityTimer = throwing ? 0.7 : 0;
    weapon.activeSlot = grenade ? 'primary' : slot;
    weapon.hipPos.fromArray(WEAPONS[weapon.activeSlot].hip); weapon.adsPos.fromArray(WEAPONS[weapon.activeSlot].aim);
    previewOptions = { pose: grenade ? throwing ? 'throw' : 'grenade' : slot === 'pistol' ? 'pistol' : slot==='assault'?'assault':'rifle', pinProgress: weapon.pinProgress, throwProgress: weapon.throwProgress, throwMode: weapon.throwMode };
    if(!guidedGrip?.active){const action=$('action').value;movement.isCrouching=/crouch/i.test(action);movement.isSprinting=action==='sprint';movement.effectiveLean=/peek/i.test(action)?(/Left/.test(action)?-1:1):0;movement.getSpeed=()=>action==='walk'?2.4:action==='sprint'?5:0;weapon.crouchBlend=movement.isCrouching?1:0;if(playing)movement.bobTime=(movement.bobTime||0)+dt*10;}
    weapon.studioFireState=$('stance').value==='fire';
    weapon.studioPoseAction=$('action').value;weapon.studioPoseTime=actionTime;weapon.studioPoseState=grenade?grenadeState:null;
    weapon.isAiming = !!aim; weapon.adsProgress = aim;
    if (playing) weapon.pistolHoldTime = (weapon.pistolHoldTime || 0) + dt;
    weapon.update(0);
    // Keep the optic visible in the editor even when gameplay would show the scope overlay.
    weapon.weaponGroup.visible = true; weapon.rifleModel.visible = slot === 'primary'; weapon.pistolModel.visible = slot === 'pistol';
    weapon.assaultModel.visible=slot==='assault';
    for (const [type, model] of Object.entries(grenadeModels)) {
        model.visible = grenade && type === slot;
        if (model.visible) {
            const hold=library.poses[`${slot}:hold`],stamp=JSON.stringify(hold);
            const grip=model.userData.studioGrip??={model};
            if(throwing&&(!grip.gripAnchor||grip.stamp!==stamp)){
                weapon.armsRig.reset();weapon.armsRig.poseHands(weapon.weaponGroup,{pose:'grenade',custom:hold});
                applyGrenadePlacement(model,0,'high',hold);
                updateThrowableGrip(grip,weapon.armsRig.bones.RightHand,weapon.weaponGroup,false);
                weapon.armsRig.lastRevision=-1;weapon.armsRig.updateView(0,weapon);
            }
            grip.stamp=stamp;
            applyGrenadePlacement(model, weapon.throwProgress, weapon.throwMode, weapon.grenadePoseOverrides);
            updateThrowableGrip(grip,weapon.armsRig.bones.RightHand,weapon.weaponGroup,throwing);
            if(playing&&throwing&&phase>=THROW_RELEASE)model.visible=false;
            const pin = model.getObjectByName('SafetyPin');
            pin.visible = !throwing && (grenadeState === 'hold' || weapon.pinProgress < 1);
            pin.position.x = -0.025 - weapon.pinProgress * 0.12;
        }
    }
    let reload = 0, bolt = 0, previewMotion = null, assaultFire=0;
    const actionPreview=!grenade&&['draw','reload','fire','bolt'].includes($('action').value);
    if ((playing||actionPreview) && !grenade) {
        if(playing)actionTime += dt;
        const action = $('action').value, prefix = slot === 'pistol' ? 'pistol' : 'sniper';
        const actionDuration = action === 'reload' ? slot === 'pistol' ? library.reloadSequence.duration : WEAPONS[slot].reloadTime : action === 'draw' ? 0.28 : action === 'fire' ? (WEAPONS[slot].fireActionTime || (slot === 'pistol' ? 0.18 : 0.65)) : 1;
        const localTime = actionTime % (actionDuration + 0.6), progress = Math.min(1, localTime / actionDuration);
        if (action === 'reload') reload = progress;
        if (action === 'bolt' && slot === 'primary') bolt = progress;
        if (['draw', 'reload', 'fire'].includes(action)) previewMotion = sampleViewAction(weapon.viewActionPack, `${prefix}${action[0].toUpperCase()}${action.slice(1)}`, progress, action === 'draw' ? 0.75 : action === 'fire' ? 0.5 : 1);
        if (slot === 'pistol' && action === 'reload') previewMotion = sequenceMotion(progress);
        if(slot==='assault')previewMotion=action==='reload'?assaultReloadMotion(progress):null;
        if(slot==='assault'&&action==='fire'&&localTime<actionDuration)assaultFire=Math.max(.001,progress);
    }
    if ((playing||actionPreview) && !grenade) {
        const reloadDip = Math.sin(reload * Math.PI), boltDip = Math.sin(bolt * Math.PI);
        if (slot === 'pistol' && reload > 0) applySequenceFraming(weapon.weaponGroup.position, weapon.weaponGroup.rotation, sampleReloadSequence(library.reloadSequence,reload*library.reloadSequence.duration));
        else {
            weapon.weaponGroup.position.y -= reloadDip * 0.055 + boltDip * 0.02;
            weapon.weaponGroup.rotation.z += -reloadDip * 0.20 + boltDip * 0.08;
            weapon.weaponGroup.rotation.x -= reloadDip * 0.08;
        }
        const hold = slot === 'pistol' && reload === 0 && $('action').value !== 'draw'
            ? samplePistolHold(weapon.pistolHoldPack, weapon.pistolHoldTime, 1 - aim) : null;
        weapon.armsRig.reset(); weapon.armsRig.poseHands(weapon.weaponGroup, { pose: slot === 'pistol' ? 'pistol' : slot==='assault'?'assault':'rifle', reload, bolt, custom: slot === 'pistol' && reload > 0 ? addTimelinePose(pose(),sampleReloadSequence(library.reloadSequence,reload*library.reloadSequence.duration).pose) : pose(), motion: previewMotion, pistolHold: hold, contactModel:slot==='pistol'?weapon.pistolModel:slot==='assault'?weapon.assaultModel:weapon.rifleModel });
    } else if (!playing) {
        // Stopping the preview invalidates the procedural grip cache once.
        if (weapon.armsRig.lastStudioPlaying) { weapon.armsRig.lastRevision = -1; weapon.armsRig.updateView(0, weapon); }
    }
    weapon.armsRig.lastStudioPlaying = playing;
    applyPistolMechanics(weapon.pistolModel, (playing||actionPreview) && slot === 'pistol' ? reload : 0);
    applyAssaultMechanics(weapon.assaultModel,(playing||actionPreview)&&slot==='assault'?reload:0,assaultFire);
    if ((playing||actionPreview) && slot === 'pistol' && reload > 0) applySequenceMechanics(weapon.pistolModel,weapon.armsRig,sampleReloadSequence(library.reloadSequence,reload*library.reloadSequence.duration));
    if (!gizmo.dragging) {
        if (isThrowable()) {
            itemTarget.position.copy(grenadeModels[slot].position);
            itemTarget.quaternion.copy(grenadeModels[slot].quaternion);
        }
        weaponTarget.position.copy(weapon.weaponGroup.position); weaponTarget.quaternion.copy(weapon.weaponGroup.quaternion);
        for (const side of ['Left', 'Right']) for (const field of ['position', 'elbow', 'shoulder']) markers[side][field].position.copy(baseTarget(side, field)).add(new THREE.Vector3().fromArray(pose()[side][field]));
        if (isJointRotation()) {
            selectedBone().getWorldPosition(rotationTarget.position);
            selectedBone().getWorldQuaternion(rotationTarget.quaternion);
        }
    }
    const vertices = lineGeometry.attributes.position; let index = 0;
    weapon.weaponGroup.updateWorldMatrix(true, true);
    for (const side of ['Left', 'Right']) for (const [a, b] of [['Arm', 'ForeArm'], ['ForeArm', 'Hand']]) {
        for (const name of [a, b]) {
            const point = weapon.weaponGroup.worldToLocal(weapon.armsRig.bones[side + name].getWorldPosition(new THREE.Vector3()));
            vertices.setXYZ(index++, point.x, point.y, point.z);
        }
    }
    vertices.needsUpdate = true;
    guideRoot.visible = $('helpers').checked && view === 'orbit';
    lines.visible=!guidedGrip?.active;
    for(const side of ['Left','Right'])for(const field of ['position','elbow','shoulder'])markers[side][field].visible=!guidedGrip?.active||field==='position';
    orbit.update();updateHolographicSight(weapon.assaultModel,view==='first'?camera:inspectionCamera); renderer.render(scene, view === 'first' ? camera : inspectionCamera);
}
requestAnimationFrame(frame);
if (import.meta.env.DEV) window.__poseStudio = { weapon, renderer, get library() { return library; }, gizmo, markers, get bodyRig() { return bodyRig; }, bodyScene, bodyCamera };
