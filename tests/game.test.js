import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { MovementController } from '../src/player/MovementController.js';
import { SniperWeapon } from '../src/weapons/SniperWeapon.js';
import { soundEngine } from '../src/audio/SoundEngine.js';

globalThis.window = new EventTarget();
globalThis.document = new EventTarget();
for (const method of ['playLand', 'playJumpPad', 'playSlide', 'playJump', 'playHitmarker']) soundEngine[method] = () => {};
const player = () => new MovementController(new THREE.PerspectiveCamera(), new EventTarget());
const box = (min, max) => new THREE.Box3(new THREE.Vector3(...min), new THREE.Vector3(...max));

test('player lands on a platform and can jump from it', () => {
    const p = player();
    p.position.set(0, 5.8, 0);
    p.velocity.y = -8;
    const platform = box([-4, 3.5, -4], [4, 3.75, 4]);
    for (let i = 0; i < 30; i++) p.update(1 / 60, [platform]);
    assert.equal(p.isGrounded, true);
    assert.equal(p.position.y, 3.75 + p.standHeight);
    p.handleJump();
    assert.ok(p.velocity.y > 0);
});

test('slide eye height stays above the floor and returns to standing', () => {
    const p = player();
    p.isGrounded = true;
    p.startSlide();
    for (let i = 0; i < 30; i++) p.update(1 / 60);
    assert.ok(p.camera.position.y >= p.slideHeight - 0.001);
    assert.ok(p.camera.position.y < 1);
    p.cancelSlide();
    for (let i = 0; i < 90; i++) p.update(1 / 60);
    assert.ok(Math.abs(p.position.y - p.standHeight) < 0.001);
});

test('jump pads launch a standing player without resetting ascent', () => {
    const p = player();
    p.position.set(0, p.standHeight, 0);
    const pads = [{ x: 0, y: 0.1, z: 0, radius: 1.8, force: 22 }];
    p.update(1 / 60, [], pads);
    assert.equal(p.velocity.y, 22);
    assert.equal(p.isGrounded, false);
    p.update(1 / 60, [], pads);
    assert.ok(p.velocity.y < 22 && p.velocity.y > 0);
});

test('input is cleared when pointer lock is lost', () => {
    const p = player();
    p.keys.forward = p.keys.sprint = true;
    p.isAiming = true;
    document.dispatchEvent(new Event('pointerlockchange'));
    assert.ok(Object.values(p.keys).every(value => value === false));
});

test('Q and E lean the camera left and right', () => {
    const p = player();
    p.position.set(0, p.standHeight, 0);
    p.yaw = 0;
    p.isGrounded = true;

    p.onKeyChange('KeyE', true);
    for (let i = 0; i < 60; i++) p.update(1 / 60);
    assert.ok(p.lean > 0.9);
    assert.ok(p.leanOffset > 0.35);
    assert.ok(p.camera.position.x > p.position.x + 0.35);
    assert.ok(p.camera.rotation.z < -0.05);

    p.onKeyChange('KeyE', false);
    p.onKeyChange('KeyQ', true);
    for (let i = 0; i < 60; i++) p.update(1 / 60);
    assert.ok(p.lean < -0.9);
    assert.ok(p.leanOffset < -0.35);
    assert.ok(p.camera.position.x < p.position.x - 0.35);
    assert.ok(p.camera.rotation.z > 0.05);

    p.onKeyChange('KeyQ', false);
    for (let i = 0; i < 60; i++) p.update(1 / 60);
    assert.ok(Math.abs(p.lean) < 0.01);
    assert.ok(Math.abs(p.leanOffset) < 0.01);
});

test('leaning stops before entering cover', () => {
    const p = player();
    p.position.set(0, p.standHeight, 0);
    p.yaw = 0;
    p.isGrounded = true;
    const wall = box([0.5, 0, -4], [3, 5, 4]);
    p.onKeyChange('KeyE', true);
    for (let i = 0; i < 60; i++) p.update(1 / 60, [wall]);
    assert.ok(p.lean > 0.9);
    assert.ok(p.leanOffset > 0.1 && p.leanOffset < 0.35, `lean offset ${p.leanOffset}`);
    assert.ok(p.camera.position.x < 0.5);
});

test('scoped aim is FOV-normalised and follows the ADS slider', () => {
    const p = player();
    p.isLocked = true;
    const look = (dx, dy = 0) => document.dispatchEvent(Object.assign(new Event('mousemove'), { movementX: dx, movementY: dy }));

    p.camera.fov = 85;
    p.yaw = p.pitch = 0;
    look(100);
    const hipDelta = p.yaw;

    p.camera.fov = 22;
    p.yaw = 0;
    look(100);
    const scopedDelta = p.yaw;
    assert.ok(Math.abs(scopedDelta) < Math.abs(hipDelta) * 0.3);
    assert.ok(Math.abs(scopedDelta) > Math.abs(hipDelta) * 0.15);

    p.adsSensitivity = 2;
    p.yaw = 0;
    look(100);
    assert.ok(Math.abs(p.yaw) > Math.abs(scopedDelta) * 1.9);

    p.invertY = true;
    p.camera.fov = 85;
    p.pitch = 0;
    look(0, 100);
    assert.ok(p.pitch > 0);
});

test('rifle tilts in place instead of orbiting the eye while peeking', () => {
    class TestWeapon extends SniperWeapon {
        loadAssets() {}
        setupInput() {}
    }
    const movement = player();
    const weapon = new TestWeapon(new THREE.Scene(), movement.camera, movement);
    movement.lean = 1;
    movement.camera.rotation.z = -movement.leanMaxRoll;
    weapon.update(1 / 60);
    assert.ok(weapon.weaponGroup.rotation.z < -0.05);
    assert.ok(Math.abs(weapon.weaponGroup.position.x - weapon.hipPos.x) < 0.01);
    assert.ok(Math.abs(weapon.weaponGroup.position.y - weapon.hipPos.y) < 0.01);
});

test('slow walk and crouch cap speed and eye height', () => {
    const p = player();
    p.isGrounded = true;
    p.keys.forward = true;
    p.keys.walk = true;
    for (let i = 0; i < 90; i++) p.update(1 / 60);
    assert.ok(p.getSpeed() < 3.5, `walk speed ${p.getSpeed()}`);

    p.keys.sprint = true;
    p.update(1 / 60);
    assert.equal(p.isSprinting, false);

    p.onKeyChange('KeyX', true);
    p.onKeyChange('KeyX', false);
    assert.equal(p.isCrouching, true);
    for (let i = 0; i < 90; i++) p.update(1 / 60);
    assert.ok(p.camera.position.y < 1.1);
    assert.ok(p.getSpeed() < 3.1);

    p.onKeyChange('KeyX', true);
    p.onKeyChange('KeyX', false);
    assert.equal(p.isCrouching, false);
    for (let i = 0; i < 90; i++) p.update(1 / 60);
    assert.ok(Math.abs(p.position.y - p.standHeight) < 0.01);
});

test('slow walking is quiet and crouching is silent', () => {
    const steps = [];
    soundEngine.playFootstep = kind => steps.push(kind);
    const p = player();
    p.isGrounded = true;
    p.keys.forward = true;
    p.keys.walk = true;
    for (let i = 0; i < 180; i++) p.update(1 / 60);
    assert.ok(steps.length > 0);
    assert.ok(steps.every(kind => kind === 'walk'));

    steps.length = 0;
    p.toggleCrouch();
    for (let i = 0; i < 180; i++) p.update(1 / 60);
    assert.equal(steps.length, 0);
});

test('slopes support continuous uphill movement', () => {
    const p = player();
    const ramp = box([-3, 0, 4], [3, 3.75, 16]);
    ramp.ramp = { position: new THREE.Vector3(0, 0, 10), width: 6, height: 3.75, length: 12, rotation: 0 };
    p.position.set(0, p.standHeight, 16);
    p.isGrounded = true;
    p.keys.forward = true;
    for (let i = 0; i < 60; i++) p.update(1 / 60, [ramp]);
    assert.ok(p.position.z < 10);
    assert.ok(p.position.y > 3.5);
    assert.equal(p.isGrounded, true);
});

test('weapon update and raycast use supported Three.js APIs and ignore dead bots', () => {
    class TestWeapon extends SniperWeapon {
        loadAssets() {}
        setupInput() {}
    }
    const movement = player();
    movement.camera.position.set(0, movement.standHeight, 0);
    const scene = new THREE.Scene();
    const weapon = new TestWeapon(scene, movement.camera, movement);
    weapon.recoilPos.set(0, 0.1, 0.2);
    weapon.update(1 / 60);
    assert.ok(weapon.recoilPos.z < 0.2);
    let hits = 0;
    const target = new THREE.Mesh(new THREE.BoxGeometry(3, 3, 1), new THREE.MeshStandardMaterial());
    target.position.set(0, movement.standHeight, -5);
    target.userData = { isShootable: true, bot: { isAlive: true, position: target.position, takeDamage: () => hits++ } };
    scene.add(target);
    weapon.adsProgress = 1;
    weapon.performRaycast();
    assert.equal(hits, 1);
    target.userData.bot.isAlive = false;
    weapon.performRaycast();
    assert.equal(hits, 1);
});
