import {emptyPeekLibrary,validatePeekLibrary} from './PeekPoses.js';
export const POSE_STORAGE_KEY = 'fast-snipe-poses-v1';
export const FINGERS = ['Thumb', 'Index', 'Middle', 'Ring', 'Pinky'];
export const POSE_KEYS = ['primary:hip', 'primary:aim', 'pistol:hip', 'pistol:aim'];
export const THROWABLE_TYPES = ['frag', 'flash', 'smoke'];
export const THROWABLE_STATES = ['hold', 'pin', 'high', 'low'];
export const THROWABLE_KEYS = THROWABLE_TYPES.flatMap(type => THROWABLE_STATES.map(state => `${type}:${state}`));
export const ALL_POSE_KEYS = [...POSE_KEYS, ...THROWABLE_KEYS];
export const THIRD_PERSON_SLOTS = ['primary', 'pistol', ...THROWABLE_TYPES];
export const GRENADE_FRAME = [0.20, -0.18, -0.53];
export const JOINT_ROTATIONS = ['shoulderRotation', 'elbowRotation', 'handRotation'];
const vector = () => [0, 0, 0];
export function emptyPose() {
    const hand = () => ({ position: vector(), rotation: vector(), shoulder: vector(), elbow: vector(),
        shoulderRotation: vector(), elbowRotation: vector(), handRotation: vector(),
        fingers: Object.fromEntries(FINGERS.map(f => [f, vector()])) });
    return { weapon: { position: vector(), rotation: vector() }, Left: hand(), Right: hand() };
}
export function emptySupportGrip() {
    return { position: vector(), rotation: vector(), fingers: Object.fromEntries(FINGERS.map(finger => [finger, vector()])) };
}
export function emptyLibrary() {
    return { version: 1, peekPoses:emptyPeekLibrary(), reloadSequence: defaultReloadSequence(), thirdPersonRightGrips: Object.fromEntries(THIRD_PERSON_SLOTS.map(slot => [slot, emptySupportGrip()])), thirdPersonGrips: Object.fromEntries(THIRD_PERSON_SLOTS.map(slot => [slot, emptySupportGrip()])), thirdPerson: Object.fromEntries(THIRD_PERSON_SLOTS.map(slot => [slot, { position: vector(), rotation: vector() }])), poses: Object.fromEntries(ALL_POSE_KEYS.map(key => [key,
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
    if (!['primary', 'pistol'].includes(slot) || !['hip', 'aim'].includes(stance)) throw new Error('Unknown weapon or stance.');
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
    const clean = emptyLibrary(); clean.peekPoses=validatePeekLibrary(input.peekPoses);
    if (input.reloadSequence) clean.reloadSequence = validateReloadSequence(input.reloadSequence);
    for (const slot of THIRD_PERSON_SLOTS) {
        clean.thirdPerson[slot].position = validateVector(input.thirdPerson?.[slot]?.position ?? vector(), 0.6);
        clean.thirdPerson[slot].rotation = validateVector(input.thirdPerson?.[slot]?.rotation ?? vector(), Math.PI);
        const grip = input.thirdPersonGrips?.[slot];
        clean.thirdPersonGrips[slot].position = validateVector(grip?.position ?? vector(), 0.6);
        clean.thirdPersonGrips[slot].rotation = validateVector(grip?.rotation ?? vector(), Math.PI);
        for (const finger of FINGERS) clean.thirdPersonGrips[slot].fingers[finger] = validateVector(grip?.fingers?.[finger] ?? vector(), 1.6);
        const right = input.thirdPersonRightGrips?.[slot];
        clean.thirdPersonRightGrips[slot].position = validateVector(right?.position ?? vector(), 0.6);
        clean.thirdPersonRightGrips[slot].rotation = validateVector(right?.rotation ?? vector(), Math.PI);
        for (const finger of FINGERS) clean.thirdPersonRightGrips[slot].fingers[finger] = validateVector(right?.fingers?.[finger] ?? vector(), 1.6);
    }
    for (const key of ALL_POSE_KEYS) {
        const pose = input.poses[key];
        if (!pose) { if (THROWABLE_KEYS.includes(key)) continue; throw new Error(`Missing pose: ${key}`); }
        if (THROWABLE_KEYS.includes(key)) {
            clean.poses[key].item.position = validateVector(pose.item?.position ?? vector(), 0.6);
            clean.poses[key].item.rotation = validateVector(pose.item?.rotation ?? vector(), Math.PI);
        }
        for (const part of ['weapon', 'Left', 'Right']) {
            clean.poses[key][part].position = validateVector(pose[part]?.position, 0.6);
            clean.poses[key][part].rotation = validateVector(pose[part]?.rotation, Math.PI);
            if (part === 'weapon') continue;
            for (const field of JOINT_ROTATIONS) clean.poses[key][part][field] = validateVector(pose[part]?.[field] ?? vector(), Math.PI);
            for (const target of ['shoulder', 'elbow']) clean.poses[key][part][target] = validateVector(pose[part]?.[target], 0.6);
            for (const finger of FINGERS) clean.poses[key][part].fingers[finger] = validateVector(pose[part]?.fingers?.[finger], 1.6);
        }
    }
    return clean;
}
export function readLibrary(storage = globalThis.localStorage) {
    try { const raw = storage?.getItem(POSE_STORAGE_KEY); return raw ? validateLibrary(JSON.parse(raw)) : emptyLibrary(); }
    catch { return emptyLibrary(); }
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
        for (const field of JOINT_ROTATIONS) out[part][field] = mix(a[part][field] || vector(), b[part][field] || vector());
        for (const field of ['shoulder', 'elbow']) out[part][field] = mix(a[part][field], b[part][field]);
        for (const finger of FINGERS) out[part].fingers[finger] = mix(a[part].fingers[finger], b[part].fingers[finger]);
    }
    return out;
}
import { defaultReloadSequence, validateReloadSequence } from './ReloadTimeline.js';

