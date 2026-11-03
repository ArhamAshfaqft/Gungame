import * as THREE from 'three';

export function isLoopingMovement(id) {
    if (/Stop|Reload|Hit|StandTo|ToStand|ToKneel|Turn/i.test(id)) return false;
    if (/^(rifle|pistol)Crouch/.test(id)) return true;
    return /idle|walk|run|strafe/i.test(id) && !/kneelTo|standTo/i.test(id);
}

const cache = new WeakMap();
// Preserve original gait timing. Remove endpoint drift across the entire cycle,
// then apply a small circular filter to join endpoint velocities without a rush.
export function smoothLoop(data) {
    if (!isLoopingMovement(data.id)) return data;
    if (cache.has(data)) return cache.get(data);
    const duration = data.duration;
    const frames = Math.ceil(duration * 60);
    const tracks = data.tracks.map(track => {
        const quaternion = track.property === 'quaternion';
        const Type = quaternion ? THREE.QuaternionKeyframeTrack : THREE.VectorKeyframeTrack;
        const source = new Type('source', track.times, track.values).createInterpolant();
        const times = [], values = [], samples = [];
        const start = Array.from(source.evaluate(0)), end = Array.from(source.evaluate(duration));
        const correction = quaternion ? new THREE.Quaternion().fromArray(end).normalize().invert().multiply(new THREE.Quaternion().fromArray(start).normalize()) : null;
        for (let frame = 0; frame < frames; frame++) {
            const time = frame / frames * duration;
            const sample = Array.from(source.evaluate(time)), phase = frame / frames;
            if (quaternion) new THREE.Quaternion().fromArray(sample).normalize().multiply(new THREE.Quaternion().slerp(correction, phase)).normalize().toArray(sample);
            else for (let i = 0; i < sample.length; i++) sample[i] -= (end[i] - start[i]) * phase;
            samples.push(sample);
        }
        const weights = [1, 4, 6, 4, 1];
        for (let frame = 0; frame < frames; frame++) {
            let total = 0;
            const average = quaternion ? new THREE.Quaternion() : new Array(3).fill(0);
            for (let tap = -2; tap <= 2; tap++) {
                const sample = samples[(frame + tap + frames) % frames], weight = weights[tap + 2];
                total += weight;
                if (quaternion) {
                    const q = new THREE.Quaternion().fromArray(sample);
                    if (tap === -2) average.copy(q); else average.slerp(q, weight / total);
                } else for (let i = 0; i < 3; i++) average[i] += sample[i] * weight / 16;
            }
            times.push(frame / frames * duration);
            values.push(...(quaternion ? average.normalize().toArray() : average));
        }
        times.push(duration); values.push(...values.slice(0, quaternion ? 4 : 3));
        return { ...track, times, values };
    });
    const result = { ...data, duration, tracks }; cache.set(data, result); return result;
}
