import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { smoothLoop, isLoopingMovement } from '../src/models/AnimationLoops.js';
import { ShooterAnimator } from '../src/models/ShooterAnimator.js';

const clips = ['shooter', 'pistol'].flatMap(name => JSON.parse(readFileSync(new URL(`../public/assets/animations/${name}-pack.json`, import.meta.url))).clips);
function animator() {
    const object = new THREE.Group(), bones = {};
    for (const name of new Set(clips.flatMap(clip => clip.tracks.map(track => track.bone)))) { const bone = new THREE.Bone(); bone.name = name; object.add(bone); bones[name] = bone; }
    return new ShooterAnimator({ object, bones, reset() {} }, { clips });
}

test('all looping movement tracks close exactly, with small wraparound pose changes', () => {
    let checked = 0;
    for (const clip of clips.filter(clip => isLoopingMovement(clip.id))) {
        const source = JSON.stringify(clip), loop = smoothLoop(clip); checked++;
        assert.equal(JSON.stringify(clip), source, 'source data must remain unchanged');
        assert.equal(smoothLoop(clip), loop, 'share preprocessed loops between characters');
        assert.equal(loop.duration, clip.duration, 'do not compress the gait cycle');
        for (const track of loop.tracks) {
            const size = track.property === 'quaternion' ? 4 : 3;
            assert.deepEqual(track.values.slice(0, size), track.values.slice(-size));
            const Type = size === 4 ? THREE.QuaternionKeyframeTrack : THREE.VectorKeyframeTrack;
            const sample = new Type('track', track.times, track.values).createInterpolant();
            const before = Array.from(sample.evaluate(loop.duration - 0.001)), after = Array.from(sample.evaluate(0.001));
            if (size === 4) assert.ok(new THREE.Quaternion().fromArray(before).normalize().angleTo(new THREE.Quaternion().fromArray(after).normalize()) < 0.08, `${clip.id} ${track.bone} wrap discontinuity`);
            else assert.ok(new THREE.Vector3().fromArray(before).distanceTo(new THREE.Vector3().fromArray(after)) < 0.5);
        }
    }
    assert.ok(checked > 20);
});

test('one-shot reload, hit, jump and throw clips keep their source timing and keys', () => {
    for (const clip of clips.filter(clip => !isLoopingMovement(clip.id))) assert.equal(smoothLoop(clip), clip);
});

test('endpoint correction preserves gait timing without a concentrated end-of-loop speed burst', () => {
    const times = Array.from({ length: 61 }, (_, i) => i / 60);
    const values = times.flatMap(t => [Math.sin(t * Math.PI * 2) + t * 0.8, 0, 0]);
    const loop = smoothLoop({ id: 'walk', duration: 1, tracks: [{ bone: 'Hips', property: 'position', times, values }] });
    const positions = loop.tracks[0].values.filter((_, i) => i % 3 === 0);
    const speeds = positions.slice(1).map((p, i) => Math.abs(p - positions[i]) * 60);
    assert.equal(loop.duration, 1);
    assert.ok(Math.max(...speeds) < 6.4, 'seam correction must not exceed the original sinusoidal peak speed');
    assert.ok(Math.abs(speeds[0] - speeds.at(-1)) < 0.05, 'speed must join continuously at wrap');
});

test('direction noise does not restart clips, stable direction transitions and speed changes are eased', () => {
    const a = animator(); a.update(1 / 60, { speed: 2, forward: -1, lateral: 0 });
    for (let i = 0; i < 90; i++) a.update(1 / 60, { speed: 2, forward: -1, lateral: i % 2 ? 0.99 : 1.01 });
    assert.equal(a.current, 'walkBack');
    for (let i = 0; i < 30; i++) a.update(1 / 60, { speed: 2, forward: 0, lateral: 1 });
    assert.equal(a.current, 'strafeRight');
    const action = a.actions.get(a.current), oldSpeed = action.timeScale;
    a.update(1 / 60, { speed: 3.4, forward: 0, lateral: 1 });
    assert.ok(Math.abs(action.timeScale - oldSpeed) < 0.2);
});

test('phase matching selects a pose at least as close as restarting the next cycle', () => {
    const a = animator();
    for (const [before, next] of [['walkBack', 'strafeRight'], ['walk', 'run'], ['pistolWalkBack', 'pistolStrafeLeft']]) {
        const time = a.clips.get(before).duration * 0.7;
        const chosen = a.matchPhase(next, before, time);
        const score = t => a.phaseTracks.get(next).reduce((sum, track) => {
            const old = a.phaseTracks.get(before).find(other => other.bone === track.bone);
            const q = new THREE.Quaternion().fromArray(old.sample.evaluate(time)).normalize();
            const p = new THREE.Quaternion().fromArray(track.sample.evaluate(t)).normalize();
            return sum + q.angleTo(p) ** 2;
        }, 0);
        assert.ok(score(chosen) <= score(0) + 0.00001);
    }
});
