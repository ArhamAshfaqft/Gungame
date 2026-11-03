import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { SniperWeapon } from '../weapons/SniperWeapon.js';
import { WEAPONS } from '../weapons/WeaponProfiles.js';
import { handTargets, createSwatRig, BODY_SUPPORT_GRIP } from '../models/SwatRig.js';
import { loadSniperModel } from '../models/SniperModel.js';
import { loadPistolModel } from '../models/PistolModel.js';
import { equipmentClips } from '../models/ShooterAnimator.js';
import { sampleViewAction } from '../models/ViewActions.js';
import { applyPistolMechanics } from '../models/PistolReload.js';
import { createGrenadeModel, grenadeModelPosition, applyGrenadePlacement } from '../models/GrenadeModel.js';
import { FINGERS, emptyLibrary, readLibrary, saveLibrary, validateLibrary, copyGripToOtherStance, THROWABLE_TYPES, THROWABLE_STATES, GRENADE_FRAME } from './PoseLibrary.js';
import './style.css';
import { createReloadEditor } from './ReloadEditor.js';
import { createPeekEditor } from './PeekEditor.js';
import {confirmPeekSave} from './PoseSync.js';
import { sampleReloadSequence, addTimelinePose, applySequenceFraming, applySequenceMechanics, sequenceMotion } from './ReloadTimeline.js';

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
const stateLabels = { hold: 'Holding / ready', pin: 'Pull pin', high: 'High throw', low: 'Low toss', hip: 'Ready / hipfire', aim: 'Aiming' };
let previewOptions = {};
const environment = new RoomEnvironment(), pmrem = new THREE.PMREMGenerator(renderer);
const env = pmrem.fromScene(environment, 0.04);
scene.environment = env.texture; scene.environmentIntensity = 0.65;
environment.dispose(); pmrem.dispose();
const camera = weapon.viewmodelCamera;
const bodyScene = new THREE.Scene(); bodyScene.environment = env.texture; bodyScene.environmentIntensity = 0.65;
for (const light of scene.children.filter(child => child.isLight)) bodyScene.add(light.clone());
const bodyCamera = new THREE.PerspectiveCamera(42, 1, 0.01, 30);
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
Promise.all([createSwatRig(), loadSniperModel(), loadPistolModel()]).then(([rig, rifle, pistol]) => {
    bodyRig = rig; bodyScene.add(rig.object); rifle.scale.setScalar(0.85);
    rig.object.add(bodyTarget, bodyGripTarget);
    bodyModels = { primary: rifle, pistol, ...Object.fromEntries(THROWABLE_TYPES.map(type => [type, createGrenadeModel(type)])) };
    for (const model of Object.values(bodyModels)) { model.visible = false; rig.object.add(model); }
    bodySkeleton = new THREE.SkeletonHelper(rig.object); bodyScene.add(bodySkeleton);
    if (!rig.animator) throw new Error('Animation data unavailable.');
    configureBodyClips();
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
let reloadEditor;
let peekEditor;
let renderingControls = false;
weapon.poseLibrary = library;
const key = () => `${$('weapon').value}:${$('stance').value}`;
const pose = () => library.poses[key()];
const bodyGripMap = () => part === 'Right' ? 'thirdPersonRightGrips' : 'thirdPersonGrips';
function notify(message) { $('toast').textContent = message; $('toast').style.display = 'block'; clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').style.display = 'none', 3500); }
function updateSavedState() {
    const dirty = JSON.stringify(library) !== saved;
    $('save-state').textContent = dirty ? 'Unsaved changes' : 'Saved locally';
    $('save-state').style.color = dirty ? '#e9b85a' : '';
    $('undo').disabled = history.length === 0; $('redo').disabled = future.length === 0;
}
function changed() { weapon.poseLibrary = library; weapon.poseRevision = (weapon.poseRevision || 0) + 1; updateSavedState(); }
function beginEdit() { editBefore ||= clone(library); }
function finishEdit() {
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
    view = next; orbit.enabled = view === 'orbit';
    bodyOrbit.enabled = view === 'third';
    document.body.classList.toggle('fullbody-mode', view === 'third'); $('body-controls').hidden = view !== 'third';
    $('third-person').classList.toggle('active', view === 'third');
    for (const element of document.querySelectorAll('[data-part],#save,#save-both,#copy,#reset,#stance')) element.disabled = view === 'third';
    if (view === 'third') {
        part = 'weapon'; targetField = 'position';
        document.querySelector('[data-part="weapon"]').disabled = false;
        document.querySelector('[data-part="Left"]').disabled = false;
        document.querySelector('[data-part="Right"]').disabled = false;
        $('save').disabled = false; $('reset').disabled = false;
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
    return handTargets(previewOptions)[side];
}
function attachGizmo() {
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
            const support = library[bodyGripMap()][$('weapon').value];
            if (targetField === 'rotation') {
                const world = bodyRig.object.getWorldQuaternion(new THREE.Quaternion()).multiply(bodyGripTarget.quaternion);
                const euler = new THREE.Euler().setFromQuaternion(bodyDragBase.quaternion.clone().invert().multiply(world));
                support.rotation = [euler.x, euler.y, euler.z];
            } else if (part === 'Right' || !bodyRig.supportUsesWeaponTarget) {
                support.position = bodyRig.object.localToWorld(bodyGripTarget.position.clone()).sub(bodyDragBase.position)
                    .applyQuaternion(bodyRig.animatedModel.getWorldQuaternion(new THREE.Quaternion()).invert()).toArray().map(n => THREE.MathUtils.clamp(n, -0.6, 0.6));
            } else support.position = bodyRig.animatedModel.worldToLocal(bodyRig.object.localToWorld(bodyGripTarget.position.clone())).sub(BODY_SUPPORT_GRIP).toArray().map(n => THREE.MathUtils.clamp(n, -0.6, 0.6));
            changed(); syncInputs(); return;
        }
        const placement = library.thirdPerson[$('weapon').value];
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
    peekEditor?.sync();
    if(peekEditor?.active){peekEditor.render();attachGizmo();updateSavedState();return;}
    if (reloadEditor?.active) { attachGizmo(); reloadEditor.render(); updateSavedState(); return; }
    if (view === 'third') {
        const supportMode = part === 'Left' || part === 'Right';
        const rightMode = part === 'Right';
        document.querySelector('[data-part="Right"]').disabled = false;
        document.querySelector('[data-part="Left"]').disabled = false;
        document.querySelector('[data-part="Left"] span').textContent = 'Fit left hand / support grip';
        $('part-title').textContent = rightMode ? 'Third-person trigger grip' : supportMode ? 'Third-person support grip' : 'Third-person weapon placement';
        if (supportMode) {
            const support = library[bodyGripMap()][$('weapon').value];
            $('item-part').hidden = true;
            document.querySelectorAll('[data-part]').forEach(button => button.classList.toggle('active', button.dataset.part === part));
            addGroup(rightMode ? 'Trigger-hand position' : 'Support-hand position', support, 'position', 60, 100, 'cm');
            addGroup(rightMode ? 'Trigger-hand rotation' : 'Support-hand rotation', support, 'rotation', 180, 180 / Math.PI, '°');
            const select = document.createElement('select'); select.id = 'body-grip-tool';
            select.append(new Option(rightMode ? 'Move trigger hand' : 'Move support hand', 'position'), new Option(rightMode ? 'Rotate trigger hand' : 'Rotate support hand', 'rotation'));
            select.value = targetField; select.onchange = () => { targetField = select.value; bodyPlaying = false; $('body-play').textContent = 'Play animation'; attachGizmo(); };
            const fit = document.createElement('button'); fit.id = 'fit-support-hand'; fit.textContent = 'Reset to fitted grip';
            fit.onclick = () => { transact(() => { library[bodyGripMap()][$('weapon').value] = emptyLibrary()[bodyGripMap()][$('weapon').value]; }); if (!rightMode) $('body-hand-ik').checked = true; attachGizmo(); };
            const note = document.createElement('p'); note.className = 'muted small'; note.textContent = rightMode ? 'Fit the trigger hand without moving the weapon. Position offsets use weapon axes; wrist rotation uses hand axes. Finger offsets adjust the imported clip. Saves stay separate from the left hand and first-person poses.' : 'Adjust the left hand independently for this equipment. Rifle support IK fits the hand to the fore-end. Pistol, grenade and released-hand actions use their own animated hand as the base. Position uses weapon axes; rotation uses hand axes. Saves leave the gun, right hand and first-person poses unchanged.';
            const reach = document.createElement('p'); reach.id = 'support-reach'; reach.className = 'muted small';
            $('controls').append(select, fit, note, reach);
            for (const finger of FINGERS) addGroup(`${finger} finger joints`, support.fingers, finger, 90, 180 / Math.PI, '°');
            $('reset').textContent = rightMode ? 'Reset trigger grip' : 'Reset support grip'; attachGizmo(); updateSavedState(); return;
        }
        $('part-title').textContent = 'Third-person weapon placement';
        $('group-label').textContent = 'Weapon placement'; $('item-part').hidden = true;
        document.querySelector('[data-part="weapon"] span').textContent = 'Move / rotate weapon only';
        $('stance-note').textContent = 'Editing THIRD-PERSON placement for this equipment across its full-body clips. First-person settings stay separate.';
        document.querySelectorAll('[data-part]').forEach(button => button.classList.toggle('active', button.dataset.part === 'weapon'));
        addGroup('Third-person position', library.thirdPerson[$('weapon').value], 'position', 60, 100, 'cm');
        addGroup('Third-person rotation', library.thirdPerson[$('weapon').value], 'rotation', 180, 180 / Math.PI, '°');
        const select = document.createElement('select'); select.id = 'body-placement-tool';
        select.append(new Option('Move weapon only', 'position'), new Option('Rotate weapon only', 'rotation'));
        select.value = targetField;
        select.onchange = () => { targetField = select.value; bodyPlaying = false; $('body-play').textContent = 'Play animation'; attachGizmo(); };
        const note = document.createElement('p'); note.className = 'muted small';
        note.textContent = 'Saved separately for this equipment across its full-body clips. Offsets use weapon-local axes. Pause to drag the gizmo. The trigger hand stays fixed; support-hand IK can follow rifle adjustments.';
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
        addGroup('Grip orientation (arm follows)', current, 'rotation', 180, 180 / Math.PI, '°');
        addGroup('Elbow direction', current, 'elbow', 60, 100, 'cm'); addGroup('Shoulder anchor', current, 'shoulder', 60, 100, 'cm');
        for (const finger of FINGERS) addGroup(`${finger} finger joints`, current.fingers, finger, 90, 180 / Math.PI, '°');
    }
    $('pose-name').textContent = `${isThrowable() ? $('weapon').value.toUpperCase() : $('weapon').value === 'pistol' ? 'M9' : 'M98B'} / ${stateLabels[$('stance').value].toUpperCase()}`;
    $('stance-note').textContent = isThrowable() ? `Editing ${stateLabels[$('stance').value].toUpperCase()}. Each throwable has its own holding, pin-pull, high-throw and low-toss presets. Save applies them to gameplay.` : $('stance').value === 'aim'
        ? 'Editing AIMING. In game, select this weapon and hold right mouse to see this pose. Ready / hipfire is saved separately.'
        : 'Editing READY / HIPFIRE. In game, select this weapon and release right mouse to see this pose. Aiming is saved separately.';
    $('copy').textContent = isThrowable() ? 'Copy pose to all actions' : 'Copy to other stance';
    $('save-both').textContent = isThrowable() ? 'Save grip to all actions' : 'Save grip to both stances';
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
    const states = isThrowable() ? THROWABLE_STATES : ['hip', 'aim'];
    $('stance').replaceChildren(...states.map(state => new Option(stateLabels[state], state)));
    $('stance').value = states.includes(previous) ? previous : states[0];
    const actions = isThrowable() ? [['idle', 'Hold pose'], ['draw', 'Imported grenade draw'], ['pin', 'Pin-pull preview'], ['high', 'High-throw preview'], ['low', 'Low-toss preview']]
        : [['idle', 'Hold pose'], ['draw', 'Imported draw'], ['reload', $('weapon').value === 'pistol' ? 'Coordinated M9 reload' : 'Reload preview'], ['fire', 'Imported firing'], ['bolt', 'Bolt preview']];
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
    $('body-hand-ik').disabled = kind !== 'rifle';
}
for (const id of ['weapon', 'stance']) $(id).onchange = () => {
    finishEdit(); playing = false; actionTime = 0; $('play').textContent = '▶ Play';
    if (id === 'weapon') configureLoadout();
    if(peekEditor?.active)peekEditor.refreshPreview();
    if (isThrowable()) $('action').value = $('stance').value === 'hold' ? 'idle' : $('stance').value;
    changed(); renderControls();
};
$('first-person').onclick = () => switchView('first'); $('orbit').onclick = () => switchView('orbit'); $('frame').onclick = resetCamera;
$('third-person').onclick = () => switchView('third');
$('body-clip').onchange = () => { bodyTime = 0; attachGizmo(); };
$('body-hand-ik').onchange = attachGizmo;
$('body-play').onclick = () => { bodyPlaying = !bodyPlaying; $('body-play').textContent = bodyPlaying ? 'Pause animation' : 'Play animation'; attachGizmo(); };
$('body-time').oninput = () => { bodyPlaying = false; bodyTime = Number($('body-time').value); $('body-play').textContent = 'Play animation'; attachGizmo(); };
$('body-speed').oninput = () => { $('body-speed-value').textContent = `${Number($('body-speed').value).toFixed(2)}×`; };
$('helpers').onchange = attachGizmo;
$('undo').onclick = () => restore('undo'); $('redo').onclick = () => restore('redo');
$('reset').onclick = () => {
    if(peekEditor?.active){peekEditor.reset();return;}
    transact(() => {
    if (view === 'third' && (part === 'Left' || part === 'Right')) library[bodyGripMap()][$('weapon').value] = emptyLibrary()[bodyGripMap()][$('weapon').value];
    else if (view === 'third') library.thirdPerson[$('weapon').value] = emptyLibrary().thirdPerson[$('weapon').value];
    else library.poses[key()] = emptyLibrary().poses[key()];
    });
};
$('copy').onclick = () => {
    transact(() => {
        const states = isThrowable() ? THROWABLE_STATES : [$('stance').value === 'hip' ? 'aim' : 'hip'];
        const source = clone(pose());
        for (const state of states) library.poses[`${$('weapon').value}:${state}`] = clone(source);
    }); notify(isThrowable() ? 'Copied this pose to all actions for this throwable.' : 'Copied adjustments to the other stance.');
};
$('save').onclick = async () => {
    finishEdit();
    if(peekEditor?.active){
        try{
            library=saveLibrary(library);saved=JSON.stringify(library);changed();renderControls();
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
        try { library = saveLibrary(library); saved = JSON.stringify(library); changed(); renderControls(); notify('Saved M9 reload timeline to game. Press R with the pistol equipped to play it.'); }
        catch (error) { notify(`Could not save: ${error.message}`); }
        return;
    }
    try { library = saveLibrary(library); saved = JSON.stringify(library); changed(); renderControls(); notify(view === 'third' ? (part === 'Left' || part === 'Right') ? 'Saved third-person hand grip. Weapon and first-person placements are unchanged.' : 'Saved third-person weapon placement. First-person poses are unchanged.' : isThrowable() ? `Saved ${$('weapon').value.toUpperCase()} / ${stateLabels[$('stance').value].toUpperCase()} to gameplay.` : $('stance').value === 'aim' ? 'Saved AIMING. Select this weapon and hold right mouse in game to see it.' : 'Saved READY / HIPFIRE. Select this weapon and release right mouse in game to see it.'); }
    catch (error) { notify(`Could not save: ${error.message}`); }
};
$('save-both').onclick = () => {
    transact(() => {
        if (!isThrowable()) copyGripToOtherStance(library, $('weapon').value, $('stance').value);
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
$('action').onchange = () => { actionTime = 0; };
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
    bodyCamera.aspect = width / height; bodyCamera.updateProjectionMatrix();
}
reloadEditor = createReloadEditor({ weapon, getLibrary: () => library, transact, renderControls, addGroup, switchView, notify,
    render: () => { guideRoot.visible = false; for (const model of Object.values(grenadeModels)) model.visible = false; if (view === 'orbit') orbit.update(); renderer.render(scene, view === 'orbit' ? inspectionCamera : camera); } });
peekEditor=createPeekEditor({getLibrary:()=>library,transact,renderControls,switchView,getView:()=>view,addGroup,notify,
    setPreview:state=>{
        bodyPlaying=false;$('body-play').textContent='Play animation';bodyTime=0;
        if(!state){bodyLeanSlider.value=0;bodyLeanSlider.oninput();return;}
        const pistol=$('weapon').value==='pistol';
        const id=state.posture==='crouch'?(pistol?'pistolCrouchIdle':'rifleCrouchIdle'):(pistol?'pistolIdle':state.stance==='aim'?'idle':'rifleReadyIdle');
        if([...$('body-clip').options].some(option=>option.value===id))$('body-clip').value=id;
    }});
new ResizeObserver(resize).observe(viewport); resize(); configureLoadout(); renderControls();
new ResizeObserver(resize).observe($('reload-timeline'));
let previous = performance.now();
function frame(now) {
    requestAnimationFrame(frame); const dt = Math.min((now - previous) / 1000, 0.05); previous = now;
    const ready = weapon.armsRig && weapon.pistolModel && weapon.rifleModel;
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
            for (const [type, model] of Object.entries(bodyModels)) model.visible = type === slot;
            bodyRig.thirdPersonPlacements = library.thirdPerson;
            bodyRig.peekPoses=library.peekPoses;
            bodyRig.thirdPersonGrips = library.thirdPersonGrips;
            bodyRig.thirdPersonRightGrips = library.thirdPersonRightGrips;
            bodyRig.attachAnimatedModel(bodyModels[slot], grenade ? 'grenade' : slot === 'pistol' ? 'pistol' : 'rifle', slot);
            bodyRig.finishAnimatedPose({ handIK: $('body-hand-ik').checked,lean:Number(bodyLeanSlider.value),...peekEditor.state() });
            const reach = $('support-reach');
            if (reach && part === 'Right') reach.textContent = bodyRig.rightGripMiss > 0.005 ? `Target exceeds arm reach by ${(bodyRig.rightGripMiss * 100).toFixed(1)} cm. Move it closer.` : 'Trigger-hand target reached.';
            else if (reach) reach.textContent = bodyRig.supportGripMiss > 0.005 ? `Target is ${(bodyRig.supportGripMiss * 100).toFixed(1)} cm beyond the hand’s reach. Move the target closer or adjust weapon placement.` : bodyRig.supportUsesWeaponTarget ? 'Support target reached.' : 'Left-hand target reached (animated hand base).';
            if (!gizmo.dragging) { bodyTarget.position.copy(bodyModels[slot].position); bodyTarget.quaternion.copy(bodyModels[slot].quaternion); }
            const gripTarget = part === 'Right' ? bodyRig.rightGripTarget : bodyRig.supportGripTarget;
            if (!gizmo.dragging && gripTarget && (part === 'Right' || part === 'Left')) {
                bodyGripTarget.position.copy(bodyRig.object.worldToLocal(gripTarget.position.clone()));
                bodyGripTarget.quaternion.copy(bodyRig.object.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(gripTarget.quaternion));
            }
            bodySkeleton.visible = $('helpers').checked;
            $('pose-name').textContent = `FULL BODY / ${bodyRig.animator.pack.clips.find(clip => clip.id === id)?.name.toUpperCase()}`;
            $('view-help').textContent = part === 'Left' ? 'Fit the support hand to the rifle. Keep support-hand IK enabled. First-person grips stay separate.' : 'Pause to move/rotate the weapon. Drag elsewhere to orbit. Third-person saves stay separate from first-person poses.';
            $('body-note').textContent = slot === 'pistol' ? '20 pistol clips plus 10 composed crouch clips: directional crouch footwork with a pistol upper body. Saved first-person placements and reload stay separate.'
                : grenade ? 'Imported grenade toss. This pack has no dedicated pin-pull or low-toss clip; those first-person actions remain procedural.' : 'Rifle movement pack. Weapon follows the trigger hand; support-hand IK can be disabled to inspect the original clip.';
        }
        bodyOrbit.update(); renderer.render(bodyScene, bodyCamera); return;
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
    previewOptions = { pose: grenade ? throwing ? 'throw' : 'grenade' : slot === 'pistol' ? 'pistol' : 'rifle', pinProgress: weapon.pinProgress, throwProgress: weapon.throwProgress, throwMode: weapon.throwMode };
    weapon.isAiming = !!aim; weapon.adsProgress = aim;
    weapon.update(0);
    // Keep the optic visible in the editor even when gameplay would show the scope overlay.
    weapon.weaponGroup.visible = true; weapon.rifleModel.visible = slot === 'primary'; weapon.pistolModel.visible = slot === 'pistol';
    for (const [type, model] of Object.entries(grenadeModels)) {
        model.visible = grenade && type === slot;
        if (model.visible) {
            applyGrenadePlacement(model, weapon.throwProgress, weapon.throwMode, weapon.grenadePoseOverrides);
            const pin = model.getObjectByName('SafetyPin');
            pin.visible = !throwing && (grenadeState === 'hold' || weapon.pinProgress < 1);
            pin.position.x = -0.025 - weapon.pinProgress * 0.12;
        }
    }
    let reload = 0, bolt = 0, previewMotion = null;
    if (playing && !grenade) {
        actionTime += dt;
        const action = $('action').value, prefix = slot === 'pistol' ? 'pistol' : 'sniper';
        const actionDuration = action === 'reload' ? slot === 'pistol' ? library.reloadSequence.duration : WEAPONS[slot].reloadTime : action === 'draw' ? 0.28 : action === 'fire' ? (slot === 'pistol' ? 0.18 : 0.65) : 1;
        const localTime = actionTime % (actionDuration + 0.6), progress = Math.min(1, localTime / actionDuration);
        if (action === 'reload') reload = progress;
        if (action === 'bolt' && slot === 'primary') bolt = progress;
        if (['draw', 'reload', 'fire'].includes(action)) previewMotion = sampleViewAction(weapon.viewActionPack, `${prefix}${action[0].toUpperCase()}${action.slice(1)}`, progress, action === 'draw' ? 0.75 : action === 'fire' ? 0.5 : 1);
        if (slot === 'pistol' && action === 'reload') previewMotion = sequenceMotion(progress);
    }
    if (playing && !grenade) {
        const reloadDip = Math.sin(reload * Math.PI), boltDip = Math.sin(bolt * Math.PI);
        if (slot === 'pistol' && reload > 0) applySequenceFraming(weapon.weaponGroup.position, weapon.weaponGroup.rotation, sampleReloadSequence(library.reloadSequence,reload*library.reloadSequence.duration));
        else {
            weapon.weaponGroup.position.y -= reloadDip * 0.055 + boltDip * 0.02;
            weapon.weaponGroup.rotation.z += -reloadDip * 0.20 + boltDip * 0.08;
            weapon.weaponGroup.rotation.x -= reloadDip * 0.08;
        }
        weapon.armsRig.reset(); weapon.armsRig.poseHands(weapon.weaponGroup, { pose: slot === 'pistol' ? 'pistol' : 'rifle', reload, bolt, custom: slot === 'pistol' && reload > 0 ? addTimelinePose(pose(),sampleReloadSequence(library.reloadSequence,reload*library.reloadSequence.duration).pose) : pose(), motion: previewMotion });
    } else if (!playing) {
        // Stopping the preview invalidates the procedural grip cache once.
        if (weapon.armsRig.lastStudioPlaying) { weapon.armsRig.lastRevision = -1; weapon.armsRig.updateView(0, weapon); }
    }
    weapon.armsRig.lastStudioPlaying = playing;
    applyPistolMechanics(weapon.pistolModel, playing && slot === 'pistol' ? reload : 0);
    if (playing && slot === 'pistol' && reload > 0) applySequenceMechanics(weapon.pistolModel,weapon.armsRig,sampleReloadSequence(library.reloadSequence,reload*library.reloadSequence.duration));
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
    orbit.update(); renderer.render(scene, view === 'first' ? camera : inspectionCamera);
}
requestAnimationFrame(frame);
if (import.meta.env.DEV) window.__poseStudio = { weapon, renderer, get library() { return library; }, gizmo, markers, get bodyRig() { return bodyRig; }, bodyScene, bodyCamera };
