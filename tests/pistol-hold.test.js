import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { samplePistolHold, pistolHoldWeight } from '../src/models/PistolHold.js';

const pack = JSON.parse(readFileSync(new URL('../public/assets/animations/pistol-hold.json', import.meta.url)));
test('authored pistol holding is restricted to hip fire and disappears completely at full ADS', () => {
    for (const activeSlot of ['primary', 'assault']) assert.equal(pistolHoldWeight({ activeSlot }), 0);
    assert.equal(pistolHoldWeight({ activeSlot: 'pistol', grenadeEquipped: true }), 0);
    assert.equal(pistolHoldWeight({ activeSlot: 'pistol', adsProgress: 1 }), 0);
    assert.equal(pistolHoldWeight({ activeSlot: 'pistol', adsProgress: .4, blend: .5 }), .3);
    assert.equal(samplePistolHold(pack, 0, 0), null);
    assert.equal(samplePistolHold(null), null);
});
test('exported grip loops continuously and contains finite wrist, elbow and all fifteen finger joints per hand', () => {
    for (const time of [0, .25, .5, .99999, 1, 25.7]) {
        const sample = samplePistolHold(pack, time);
        for (const side of ['Left', 'Right']) {
            const hand = sample.hands[side];
            assert.equal(Object.keys(hand.fingers).length, 15);
            for (const q of [hand.rotation, ...Object.values(hand.fingers)]) {
                assert.ok(q.toArray().every(Number.isFinite));
                assert.ok(Math.abs(q.length() - 1) < 1e-6);
            }
            assert.ok(hand.position.length() < .3);
            assert.ok(hand.elbow.length() < .7);
        }
    }
    const start = samplePistolHold(pack, 0), end = samplePistolHold(pack, .999999);
    for (const side of ['Left', 'Right']) {
        assert.ok(start.hands[side].position.distanceTo(end.hands[side].position) < .0001);
        assert.ok(start.hands[side].rotation.angleTo(end.hands[side].rotation) < .001);
        for (const finger of Object.keys(start.hands[side].fingers)) assert.ok(start.hands[side].fingers[finger].angleTo(end.hands[side].fingers[finger]) < .001);
    }
});
