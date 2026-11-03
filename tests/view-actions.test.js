import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sampleViewAction } from '../src/models/ViewActions.js';
const pack = JSON.parse(readFileSync(new URL('../public/assets/animations/view-actions.json', import.meta.url)));

test('nine selected first-person actions contain finite bounded motion and normalized rotations', () => {
    assert.equal(pack.clips.length, 9);
    assert.equal(new Set(pack.clips.map(c => c.id)).size, 9);
    for (const clip of pack.clips) {
        assert.ok(clip.duration > 0 && clip.count > 1);
        for (let i = 0; i <= 100; i++) {
            const motion = sampleViewAction(pack, clip.id, i / 100);
            for (const side of ['Left', 'Right']) {
                assert.ok(motion.hands[side].position.toArray().every(Number.isFinite));
                assert.ok(motion.hands[side].position.length() <= (side === 'Left' ? 0.191 : 0.091));
                assert.ok(Math.abs(motion.hands[side].rotation.length() - 1) < 0.00001);
            }
        }
    }
});

test('imported motion blends back to the saved pose at both ends without mutating the source', () => {
    const before = JSON.stringify(pack);
    for (const clip of pack.clips) for (const t of [0, 1]) {
        const motion = sampleViewAction(pack, clip.id, t);
        for (const hand of Object.values(motion.hands)) {
            assert.ok(hand.position.length() < 0.00001);
            assert.ok(Math.abs(hand.rotation.w) > 0.99999);
        }
    }
    assert.equal(JSON.stringify(pack), before);
    assert.equal(sampleViewAction(null, 'pistolReload', 0.5), null);
    assert.equal(sampleViewAction(pack, 'missing', 0.5), null);
});
