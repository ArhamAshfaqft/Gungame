import * as THREE from 'three';
let promise;
export function loadViewActions() {
    promise ||= fetch('/assets/animations/view-actions.json').then(response => {
        if (!response.ok) throw new Error('Viewmodel action pack unavailable.');
        return response.json();
    });
    return promise;
}
export function sampleViewAction(pack, id, progress, strength = 1) {
    const clip = pack?.clips.find(clip => clip.id === id);
    if (!clip) return null;
    const t = THREE.MathUtils.clamp(progress, 0, 1);
    // Blend into and out of the user's saved pose without a first/last frame snap.
    const fade = Math.min(1, t / 0.12, (1 - t) / 0.16);
    const weight = fade * fade * (3 - 2 * fade) * strength;
    const frame = t * (clip.count - 1), i = Math.min(clip.count - 2, Math.floor(frame)), alpha = frame - i;
    const hands = {};
    for (const side of ['Left', 'Right']) {
        const track = clip.hands[side];
        const position = new THREE.Vector3().fromArray(track.positions, i * 3).lerp(new THREE.Vector3().fromArray(track.positions, (i + 1) * 3), alpha).multiplyScalar(weight);
        const rotation = new THREE.Quaternion().fromArray(track.rotations, i * 4).slerp(new THREE.Quaternion().fromArray(track.rotations, (i + 1) * 4), alpha);
        rotation.slerp(new THREE.Quaternion(), 1 - weight);
        hands[side] = { position, rotation };
    }
    return { id, progress: t, hands };
}
