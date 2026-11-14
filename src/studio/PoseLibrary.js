import {upgradePistolGrips} from './PistolGripUpgrade.js';
import {shareThrowableAnimations} from './SharedThrowableAnimations.js';
import {validateAnimationEdits,editableFit} from './AnimationEdits.js';
import {emptyPeekLibrary,validatePeekLibrary,validatePeekTimelines} from './PeekPoses.js';
import {validateHandContact} from './HandContact.js';
import {emptyWeaponHolding,validateWeaponHolding} from './WeaponHolding.js';
export const POSE_STORAGE_KEY = 'fast-snipe-poses-v1';
export const FINGERS = ['Thumb', 'Index', 'Middle', 'Ring', 'Pinky'];
export const POSE_KEYS = ['primary:hip', 'primary:fire', 'primary:aim', 'pistol:hip', 'pistol:fire', 'pistol:aim', 'assault:hip', 'assault:fire', 'assault:aim'];
export const THROWABLE_TYPES = ['frag', 'flash', 'smoke'];
export const THROWABLE_STATES = ['hold', 'pin', 'high', 'low'];
export const THROWABLE_KEYS = THROWABLE_TYPES.flatMap(type => THROWABLE_STATES.map(state => `${type}:${state}`));
export const ALL_POSE_KEYS = [...POSE_KEYS, ...THROWABLE_KEYS];
export const THIRD_PERSON_SLOTS = ['primary', 'pistol', 'assault', ...THROWABLE_TYPES];
export const GRENADE_FRAME = [0.20, -0.18, -0.53];
export const JOINT_ROTATIONS = ['shoulderRotation', 'elbowRotation', 'handRotation'];
const vector = () => [0, 0, 0];
export function emptyPose() {
    const hand = () => ({ position: vector(), rotation: vector(), shoulder: vector(), elbow: vector(), elbowTarget: vector(),
        shoulderRotation: vector(), elbowRotation: vector(), handRotation: vector(), thumbRotation: vector(), contact: null,
        fingers: Object.fromEntries(FINGERS.map(f => [f, vector()])) });
    return { weapon: { position: vector(), rotation: vector() }, Left: hand(), Right: hand() };
}
export function emptySupportGrip() {
    return { position: vector(), rotation: vector(), shoulder:vector(), elbowTarget:vector(), shoulderRotation:vector(), elbowRotation:vector(), handRotation:vector(), thumbRotation:vector(), contact:null, fingers: Object.fromEntries(FINGERS.map(finger => [finger, vector()])) };
}
export function emptyLibrary() {
    return { version: 1, pistolPalmGrip:1, sharedThrowableAnimations:1, m4SharedGrips:{Left:emptySupportGrip(),Right:emptySupportGrip()}, animationEdits:{}, peekTimelines:{}, thirdPersonFire:Object.fromEntries(THIRD_PERSON_SLOTS.map(slot=>[slot,editableFit({weapon:{position:vector(),rotation:vector()},Left:emptySupportGrip(),Right:emptySupportGrip()})])), weaponHolding:emptyWeaponHolding(emptySupportGrip), thirdPersonAim:Object.fromEntries(THIRD_PERSON_SLOTS.map(slot=>[slot,{weapon:{position:vector(),rotation:vector()},Left:emptySupportGrip(),Right:emptySupportGrip()}])), sharedFirstPerson:Object.fromEntries(THIRD_PERSON_SLOTS.map(slot=>[slot,false])), peekPoses:emptyPeekLibrary(), reloadSequence: defaultReloadSequence(), thirdPersonRightGrips: Object.fromEntries(THIRD_PERSON_SLOTS.map(slot => [slot, emptySupportGrip()])), thirdPersonGrips: Object.fromEntries(THIRD_PERSON_SLOTS.map(slot => [slot, emptySupportGrip()])), thirdPerson: Object.fromEntries(THIRD_PERSON_SLOTS.map(slot => [slot, { position: vector(), rotation: vector() }])), poses: Object.fromEntries(ALL_POSE_KEYS.map(key => [key,
        THROWABLE_KEYS.includes(key) ? { ...emptyPose(), item: { position: vector(), rotation: vector() } } : emptyPose()])) };
}
export function throwablePose(library, type, { pinProgress = 0, throwProgress = 0, mode = 'high', throwing = false } = {}) {
    const hold = library.poses[`${type}:hold`] || emptyPose();
    if (throwing) {
        const weight = throwProgress <= 0.3 ? throwProgress / 0.3 : Math.max(0, (1 - throwProgress) / 0.7);
        return blendPose(hold, library.poses[`${type}:${mode === 'low' ? 'low' : 'high'}`] || emptyPose(), Math.min(1, weight));
    }
    return blendPose(hold, library.poses[`${type}:pin`] || emptyPose(), Math.sin(Math.min(1, pinProgress) * Math.PI));
}
export function copyGripToOtherStance(library, slot, stance) {
    if (!['primary', 'pistol', 'assault'].includes(slot) || !['hip', 'aim'].includes(stance)) throw new Error('Unknown weapon or stance.');
    const source = library.poses[`${slot}:${stance}`];
    const target = library.poses[`${slot}:${stance === 'hip' ? 'aim' : 'hip'}`];
    for (const side of ['Left', 'Right']) target[side] = JSON.parse(JSON.stringify(source[side]));
}
function validateVector(input, limit) {
    if (!Array.isArray(input) || input.length !== 3 || input.some(n => typeof n !== 'number' || !Number.isFinite(n) || Math.abs(n) > limit)) throw new Error('Pose contains invalid or out-of-range coordinates.');
    return [...input];
}
export function validateLibrary(input) {
    if (input?.version !== 1 || !input.poses) throw new Error('Choose a Fast Snipe pose library (version 1).');
    const clean = emptyLibrary();
    clean.pistolPalmGrip=input.pistolPalmGrip===1?1:0;
    clean.sharedThrowableAnimations=input.sharedThrowableAnimations===1?1:0;
    if(input.projectRevision!=null){if(typeof input.projectRevision!=='string'||!/^[a-zA-Z0-9-]{1,80}$/.test(input.projectRevision))throw Error('Invalid project pose revision.');clean.projectRevision=input.projectRevision;}
    clean.weaponHolding=validateWeaponHolding(input.weaponHolding,clean.weaponHolding); clean.peekPoses=validatePeekLibrary(input.peekPoses);clean.peekTimelines=validatePeekTimelines(input.peekTimelines);
    if (input.reloadSequence) clean.reloadSequence = validateReloadSequence(input.reloadSequence);
    for (const slot of THIRD_PERSON_SLOTS) {
        if(input.sharedFirstPerson?.[slot]!=null && typeof input.sharedFirstPerson[slot]!=='boolean')throw Error('Invalid shared first-person option.');
        clean.sharedFirstPerson[slot]=input.sharedFirstPerson?.[slot]??false;
        clean.thirdPerson[slot].position = validateVector(input.thirdPerson?.[slot]?.position ?? vector(), 0.6);
        clean.thirdPerson[slot].rotation = validateVector(input.thirdPerson?.[slot]?.rotation ?? vector(), Math.PI);
        const grip = input.thirdPersonGrips?.[slot];
        clean.thirdPersonGrips[slot].position = validateVector(grip?.position ?? vector(), 0.6);
        clean.thirdPersonGrips[slot].rotation = validateVector(grip?.rotation ?? vector(), Math.PI);
        for (const finger of FINGERS) clean.thirdPersonGrips[slot].fingers[finger] = validateVector(grip?.fingers?.[finger] ?? vector(), 1.6);
        const right = input.thirdPersonRightGrips?.[slot];
        clean.thirdPersonRightGrips[slot].position = validateVector(right?.position ?? vector(), 0.6);
        clean.thirdPersonRightGrips[slot].rotation = validateVector(right?.rotation ?? vector(), Math.PI);
        for(const [target,source] of [[clean.thirdPersonGrips[slot],grip],[clean.thirdPersonRightGrips[slot],right]]){
            target.contact=validateHandContact(source?.contact);
            target.thumbRotation=validateVector(source?.thumbRotation??vector(),Math.PI);
            for(const field of ['shoulder','elbowTarget'])target[field]=validateVector(source?.[field]??vector(),.6);
            for(const field of ['shoulderRotation','elbowRotation','handRotation'])target[field]=validateVector(source?.[field]??vector(),Math.PI);
        }
        for (const finger of FINGERS) clean.thirdPersonRightGrips[slot].fingers[finger] = validateVector(right?.fingers?.[finger] ?? vector(), 1.6);
        const aim=input.thirdPersonAim?.[slot],target=clean.thirdPersonAim[slot];
        const fallback={weapon:clean.thirdPerson[slot],Left:clean.thirdPersonGrips[slot],Right:clean.thirdPersonRightGrips[slot]};
        for(const part of ['weapon','Left','Right']){
            const source=aim?.[part]??fallback[part];
            for(const field of ['position','rotation'])target[part][field]=validateVector(source[field]??fallback[part][field],field==='rotation'?Math.PI:.6);
            if(part==='weapon')continue;
            for(const field of ['shoulder','elbowTarget'])target[part][field]=validateVector(source[field]??vector(),.6);
            for(const field of ['shoulderRotation','elbowRotation','handRotation','thumbRotation'])target[part][field]=validateVector(source[field]??vector(),Math.PI);
            target[part].contact=validateHandContact(source.contact);
            for(const finger of FINGERS)target[part].fingers[finger]=validateVector(source.fingers?.[finger]??vector(),1.6);
        }

    }
    for (const key of ALL_POSE_KEYS) {
        const pose = input.poses[key] || (key.endsWith(':fire') ? input.poses[key.replace(':fire',':hip')] : null);
        if (!pose) { if (THROWABLE_KEYS.includes(key)||key.startsWith('assault:')) continue; throw new Error(`Missing pose: ${key}`); }
        if (THROWABLE_KEYS.includes(key)) {
            clean.poses[key].item.position = validateVector(pose.item?.position ?? vector(), 0.6);
            clean.poses[key].item.rotation = validateVector(pose.item?.rotation ?? vector(), Math.PI);
        }
        for (const part of ['weapon', 'Left', 'Right']) {
            clean.poses[key][part].position = validateVector(pose[part]?.position, 0.6);
            clean.poses[key][part].rotation = validateVector(pose[part]?.rotation, Math.PI);
            if (part === 'weapon') continue;
            clean.poses[key][part].contact=validateHandContact(pose[part]?.contact);
            clean.poses[key][part].thumbRotation=validateVector(pose[part]?.thumbRotation??vector(),Math.PI);
            for (const field of JOINT_ROTATIONS) clean.poses[key][part][field] = validateVector(pose[part]?.[field] ?? vector(), Math.PI);
            for (const target of ['shoulder', 'elbow']) clean.poses[key][part][target] = validateVector(pose[part]?.[target], 0.6);
            clean.poses[key][part].elbowTarget=validateVector(pose[part]?.elbowTarget??vector(),.6);
            for (const finger of FINGERS) clean.poses[key][part].fingers[finger] = validateVector(pose[part]?.fingers?.[finger], 1.6);
        }
    }
    for(const slot of THIRD_PERSON_SLOTS){
        const fallback={weapon:clean.thirdPerson[slot],Left:clean.thirdPersonGrips[slot],Right:clean.thirdPersonRightGrips[slot]};
        clean.thirdPersonFire[slot]=editableFit(fallback);
    }
    const fallback=(slot,state,clip='')=>clip.startsWith('view_')?(clean.poses[`${slot}:${state}`]||clean.poses[`${slot}:hip`]):state==='aim'?clean.thirdPersonAim[slot]:clean.thirdPersonFire[slot];
    if(input.thirdPersonFire){
        const entries=Object.fromEntries(THIRD_PERSON_SLOTS.filter(slot=>input.thirdPersonFire[slot]).map(slot=>[`${slot}|*|fire`,{pose:input.thirdPersonFire[slot]}]));
        const validated=validateAnimationEdits(entries,fallback);
        for(const slot of THIRD_PERSON_SLOTS)if(validated[`${slot}|*|fire`])clean.thirdPersonFire[slot]=validated[`${slot}|*|fire`].pose;
    }
    for(const side of ['Left','Right']){
        const source=input.m4SharedGrips?.[side]||{},target=clean.m4SharedGrips[side];
        for(const field of ['position','rotation','shoulder','elbowTarget','shoulderRotation','elbowRotation','handRotation','thumbRotation'])target[field]=validateVector(source[field]??vector(),['position','shoulder','elbowTarget'].includes(field)?.6:Math.PI);
        target.contact=validateHandContact(source.contact);
        for(const finger of FINGERS)target.fingers[finger]=validateVector(source.fingers?.[finger]??vector(),1.6);
    }
    clean.animationEdits=validateAnimationEdits(input.animationEdits,fallback);
    return upgradePistolGrips(shareThrowableAnimations(clean));
}
export function readLibrary(storage = globalThis.localStorage, fallback = null) {
    try { const raw = storage?.getItem(POSE_STORAGE_KEY); if(raw)try{for(const backup of ['fast-snipe-poses-before-animation-recovery-v1','fast-snipe-poses-before-studio-upgrade-v1'])if(!storage.getItem(backup))storage.setItem(backup,raw);}catch{} return shareThrowableAnimations(raw ? validateLibrary(JSON.parse(raw)) : fallback ? validateLibrary(fallback) : emptyLibrary()); }
    catch { return shareThrowableAnimations(fallback ? validateLibrary(fallback) : emptyLibrary()); }
}
export function saveLibrary(library, storage = globalThis.localStorage) {
    const clean = validateLibrary(library);
    storage.setItem(POSE_STORAGE_KEY, JSON.stringify(clean));
    return clean;
}
export function blendPose(a, b, t) {
    const out = emptyPose();
    const mix = (x, y) => x.map((n, i) => n + (y[i] - n) * t);
    if (a.item || b.item) out.item = {
        position: mix(a.item?.position || vector(), b.item?.position || vector()),
        rotation: mix(a.item?.rotation || vector(), b.item?.rotation || vector()),
    };
    for (const part of ['weapon', 'Left', 'Right']) {
        for (const field of ['position', 'rotation']) out[part][field] = mix(a[part][field], b[part][field]);
        if (part === 'weapon') continue;
        out[part].thumbRotation=mix(a[part].thumbRotation||vector(),b[part].thumbRotation||vector());
        const ca=a[part].contact,cb=b[part].contact;
        // Fade contacts when entering a stance that has no matching contact.
        if(ca&&cb)out[part].contact={weaponPoint:mix(ca.weaponPoint,cb.weaponPoint),palmPoint:mix(ca.palmPoint,cb.palmPoint)};
        else if(ca&&t<1)out[part].contact={...structuredClone(ca),weight:1-t};
        else if(cb&&t>0)out[part].contact={...structuredClone(cb),weight:t};
        for (const field of JOINT_ROTATIONS) out[part][field] = mix(a[part][field] || vector(), b[part][field] || vector());
        for (const field of ['shoulder', 'elbow']) out[part][field] = mix(a[part][field], b[part][field]);
        out[part].elbowTarget=mix(a[part].elbowTarget||vector(),b[part].elbowTarget||vector());
        for (const finger of FINGERS) out[part].fingers[finger] = mix(a[part].fingers[finger], b[part].fingers[finger]);
    }
    return out;
}
import { defaultReloadSequence, validateReloadSequence } from './ReloadTimeline.js';

