import * as THREE from 'three';

let promise;
export function loadPistolHold() {
    promise ||= fetch('/assets/animations/pistol-hold.json').then(response => {
        if (!response.ok) throw new Error('Pistol holding animation unavailable.');
        return response.json();
    });
    return promise;
}

// The imported base affects hip holding only. ADS always reaches exactly zero.
export function pistolHoldWeight({ activeSlot, grenadeEquipped, adsProgress = 0, blend = 1 }) {
    return activeSlot === 'pistol' && !grenadeEquipped
        ? THREE.MathUtils.clamp(blend, 0, 1) * (1 - THREE.MathUtils.clamp(adsProgress, 0, 1)) : 0;
}

export function samplePistolHold(pack, seconds = 0, weight = 1) {
    if (!pack || weight <= 0) return null;
    const phase = ((seconds % pack.duration) + pack.duration) % pack.duration / pack.duration;
    const index = phase * (pack.frames.length - 1), start = Math.floor(index), alpha = index - start;
    const a = pack.frames[start], b = pack.frames[start + 1];
    const vector = (from, to) => new THREE.Vector3().fromArray(from).lerp(new THREE.Vector3().fromArray(to), alpha);
    const quaternion = (from, to) => new THREE.Quaternion().fromArray(from).slerp(new THREE.Quaternion().fromArray(to), alpha).normalize();
    const hands = {};
    for (const side of ['Left', 'Right']) hands[side] = {
        position: vector(a[side].position, b[side].position),
        elbow: vector(a[side].elbow, b[side].elbow),
        rotation: quaternion(a[side].rotation, b[side].rotation),
        fingers: Object.fromEntries(Object.keys(a[side].fingers).map(key => [key, quaternion(a[side].fingers[key], b[side].fingers[key])])),
    };
    return { key: `${phase}:${weight}`, weight: THREE.MathUtils.clamp(weight, 0, 1), hands };
}
