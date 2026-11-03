// Reads the isolated local audit export, not the executable or any game scripts.
// Adapt source wrist trajectories as bounded IK offsets; retain SWAT proportions.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import * as THREE from 'three';

const source = JSON.parse(readFileSync('artifacts/csmetal-actions/source-curves.json'));
const output = { version: 1, source: 'User-supplied CS Metal build: selected legacy first-person action curves',
    provenance: 'Original animation authors/licenses unverified. No blanket CC0 claim. No audio, models, textures or executable code included.', clips: [] };
for (const clip of source.clips) {
    const paths = [...new Set(clip.tracks.map(t => t.path))].sort((a, b) => a.split('/').length - b.split('/').length);
    const root = new THREE.Group(), nodes = new Map();
    for (const path of paths) {
        const node = new THREE.Object3D(); nodes.set(path, node);
        (nodes.get(path.split('/').slice(0, -1).join('/')) || root).add(node);
    }
    const samplers = clip.tracks.map(track => {
        const Type = track.property === 'quaternion' ? THREE.QuaternionKeyframeTrack : THREE.VectorKeyframeTrack;
        return { node: nodes.get(track.path), property: track.property, interpolant: new Type('source', track.times, track.values).createInterpolant() };
    });
    const wrists = Object.fromEntries(['Left', 'Right'].map(side => [side, [...nodes].find(([path]) => path.endsWith(`Arms_${side}Wrist`))?.[1]]));
    if (!wrists.Left || !wrists.Right) throw new Error(`Missing wrist in ${clip.id}`);
    const sample = time => {
        for (const s of samplers) s.node[s.property].fromArray(s.interpolant.evaluate(time));
        root.updateMatrixWorld(true);
        return Object.fromEntries(Object.entries(wrists).map(([side, node]) => [side, { position: node.getWorldPosition(new THREE.Vector3()), quaternion: node.getWorldQuaternion(new THREE.Quaternion()).normalize() }]));
    };
    const start = sample(0);
    // Source rigs are already metre-scaled; derive scale from arm length as a guard.
    const rightPath = [...nodes].find(([, node]) => node === wrists.Right)[0];
    const elbow = nodes.get(rightPath.split('/').slice(0, -1).join('/'));
    const shoulder = elbow.parent;
    const armLength = start.Right.position.distanceTo(elbow.getWorldPosition(new THREE.Vector3())) + elbow.getWorldPosition(new THREE.Vector3()).distanceTo(shoulder.getWorldPosition(new THREE.Vector3()));
    const scale = THREE.MathUtils.clamp(0.52 / armLength, 0.01, 100);
    const count = Math.ceil(clip.duration * 30) + 1;
    const hands = { Left: { positions: [], rotations: [] }, Right: { positions: [], rotations: [] } };
    for (let i = 0; i < count; i++) {
        const state = sample(i / (count - 1) * clip.duration);
        for (const side of ['Left', 'Right']) {
            const delta = state[side].position.clone().sub(start[side].position).multiplyScalar(scale);
            delta.z *= -1; delta.clampLength(0, side === 'Left' ? 0.19 : 0.09);
            // Keep recoil on the existing spring; reduce the imported trigger-hand travel.
            if (/Fire$/.test(clip.id)) delta.multiplyScalar(0.25);
            const q = state[side].quaternion.clone().multiply(start[side].quaternion.clone().invert());
            q.set(-q.x, -q.y, q.z, q.w).normalize();
            const angle = q.angleTo(new THREE.Quaternion());
            if (angle > 0.85) q.slerp(new THREE.Quaternion(), 1 - 0.85 / angle);
            hands[side].positions.push(...delta.toArray().map(n => +n.toFixed(6)));
            hands[side].rotations.push(...q.toArray().map(n => +n.toFixed(6)));
        }
    }
    output.clips.push({ id: clip.id, duration: clip.duration, count, hands, sourceId: clip.sourceId });
}
if (output.clips.length !== 9) throw new Error('Expected nine selected action clips.');
mkdirSync('public/assets/animations', { recursive: true });
writeFileSync('public/assets/animations/view-actions.json', JSON.stringify(output));
console.log(`Prepared ${output.clips.length} bounded viewmodel action trajectories.`);
