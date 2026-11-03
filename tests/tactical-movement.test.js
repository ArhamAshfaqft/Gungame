import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { MovementController } from '../src/player/MovementController.js';
import { SniperWeapon } from '../src/weapons/SniperWeapon.js';
import { soundEngine } from '../src/audio/SoundEngine.js';

for (const method of ['playFootstep', 'playSlide', 'playJump', 'playLand', 'playSniperShot', 'playBoltCycle', 'playHitmarker']) soundEngine[method] = () => {};
function player() {
    globalThis.window = new EventTarget();
    globalThis.document = new EventTarget();
    const p = new MovementController(new THREE.PerspectiveCamera(85, 1, 0.01, 200), new EventTarget());
    p.position.set(0, p.standHeight, 0);
    p.yaw = 0;
    p.isGrounded = p.isLocked = true;
    return p;
}
const advance = (p, seconds = 1, colliders = []) => {
    for (let i = 0; i < Math.round(seconds * 60); i++) p.update(1 / 60, colliders);
};
class TestWeapon extends SniperWeapon {
    loadAssets() {}
    setupInput() {}
    performRaycast() { this.shots = (this.shots || 0) + 1; }
}

test('sprint is capped at close-quarters speed, with slower aim and quiet movement', () => {
    const p = player();
    p.keys.forward = p.keys.sprint = true;
    advance(p);
    assert.ok(p.getSpeed() > 7 && p.getSpeed() < 7.3);
    assert.ok(-p.position.z < 7.3);
    p.isAiming = true;
    advance(p);
    assert.equal(p.isSprinting, false);
    assert.ok(p.getSpeed() <= 1.81);
    p.isAiming = false;
    p.keys.walk = true;
    advance(p);
    assert.ok(p.getSpeed() <= 1.36);
});

test('diagonal movement gains no speed and stopping has a short controlled distance', () => {
    const p = player();
    p.keys.forward = p.keys.right = p.keys.sprint = true;
    advance(p);
    assert.ok(p.getSpeed() < 7.3);
    const before = p.position.clone();
    p.keys.forward = p.keys.right = p.keys.sprint = false;
    advance(p, 0.3);
    assert.ok(p.getSpeed() < 0.02);
    assert.ok(p.position.distanceTo(before) < 0.3);
});

test('lean cancels sprint, limits movement, and returns smoothly to neutral', () => {
    const p = player();
    p.keys.forward = p.keys.sprint = true;
    advance(p);
    p.keys.leanRight = true;
    advance(p, 0.6);
    assert.equal(p.isSprinting, false);
    assert.ok(p.getSpeed() <= 1.51);
    assert.ok(p.leanOffset > 0.3 && p.leanOffset <= 0.32);
    const previous = p.leanOffset;
    p.keys.leanRight = false;
    p.keys.leanLeft = true;
    p.update(1 / 60);
    assert.ok(Math.abs(p.leanOffset - previous) < 0.1, 'switching sides must not snap the eye');
    p.keys.leanLeft = false;
    advance(p);
    assert.ok(Math.abs(p.leanOffset) < 0.001);
});

test('head sweep detects thin cover at the exact clearance boundary', () => {
    const p = player();
    const wall = new THREE.Box3(new THREE.Vector3(0.27, 0, -2), new THREE.Vector3(0.271, 3, 2));
    const distance = p.resolveLean(0.32, new THREE.Vector3(1, 0, 0), 0, 0, [wall]);
    assert.ok(Math.abs(distance - 0.135) < 0.0001);
    const further = p.resolveLean(0.30, new THREE.Vector3(1, 0, 0), 0, 0, [wall]);
    assert.equal(distance, further, 'clearance should not depend on five arbitrary probe steps');
});

test('peeking exposes the actual shot origin around a corner while unleaned shots hit cover', () => {
    const p = player();
    class RayWeapon extends SniperWeapon {
        loadAssets() {}
        setupInput() {}
        createImpactSparks() {}
        createBulletTracer() {}
    }
    const scene = new THREE.Scene();
    const cover = new THREE.Mesh(new THREE.BoxGeometry(1, 3, 0.2), new THREE.MeshBasicMaterial());
    cover.position.set(-0.3, 1.5, -2);
    cover.userData.isShootable = true;
    scene.add(cover);
    let hits = 0;
    const target = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1, 0.5), new THREE.MeshBasicMaterial());
    target.position.set(0.32, 1.5, -5);
    target.userData = { isShootable: true, bot: { isAlive: true, position: target.position, takeDamage: () => hits++ } };
    scene.add(target);
    const weapon = new RayWeapon(scene, p.camera, p);
    weapon.adsProgress = 1;
    advance(p, 0.1);
    weapon.performRaycast();
    assert.equal(hits, 0);
    p.keys.leanRight = true;
    advance(p, 0.8);
    weapon.performRaycast();
    assert.equal(hits, 1);
});

test('low entry consumes momentum, ends crouched and cannot be chained for acceleration', () => {
    const p = player();
    p.keys.forward = p.keys.sprint = true;
    advance(p);
    const before = p.position.clone();
    const speed = p.getSpeed();
    p.handleSlidePress();
    assert.equal(p.isSliding, true);
    assert.ok(p.getSpeed() <= speed + 0.001);
    advance(p, 0.6);
    assert.equal(p.isSliding, false);
    assert.equal(p.isCrouching, true);
    assert.ok(p.position.distanceTo(before) < 2);
    assert.ok(p.slideCooldownTimer > 0);
    p.handleJump();
    assert.equal(p.velocity.y, 0, 'low entry must not launch a momentum jump');
});

test('short jumps cannot accelerate into bunny-hopping speeds', () => {
    const p = player();
    p.keys.forward = p.keys.sprint = true;
    advance(p);
    const floor = p.position.y;
    p.handleJump();
    let peak = floor;
    for (let i = 0; i < 20; i++) {
        p.update(1 / 60);
        peak = Math.max(peak, p.position.y);
        if (!p.isGrounded) assert.ok(p.getSpeed() <= 3.21);
    }
    assert.ok(peak - floor < 0.6);
});

test('crouched player cannot stand through a low ceiling', () => {
    const p = player();
    p.isCrouching = true;
    p.currentHeight = p.crouchHeight;
    p.position.y = p.crouchHeight;
    const roof = new THREE.Box3(new THREE.Vector3(-2, 1.25, -2), new THREE.Vector3(2, 1.5, 2));
    p.update(1 / 60, [roof]);
    assert.equal(p.toggleCrouch(), false);
    assert.equal(p.isCrouching, true);
    p.position.x = 4;
    assert.equal(p.toggleCrouch(), true);
});

test('firing from sprint raises the weapon before using ammo, and pause cancels buffered fire', () => {
    const p = player();
    const weapon = new TestWeapon(new THREE.Scene(), p.camera, p);
    p.keys.forward = p.keys.sprint = true;
    advance(p);
    weapon.shoot();
    assert.equal(weapon.magAmmo, 5);
    assert.ok(p.sprintRecovery > 0);
    for (let i = 0; i < 8; i++) { p.update(1 / 60); weapon.update(1 / 60); }
    assert.equal(weapon.magAmmo, 5);
    for (let i = 0; i < 10; i++) { p.update(1 / 60); weapon.update(1 / 60); }
    assert.equal(weapon.magAmmo, 4);
    assert.equal(weapon.shots, 1);
    weapon.pendingShotTime = 0.4;
    p.isLocked = false;
    weapon.update(1 / 60);
    assert.equal(weapon.pendingShotTime, 0);
});

test('Shift while crouched selects a separate faster gait without standing or sprinting',()=>{
 const p=player();p.isCrouching=true;p.keys.forward=true;advance(p);const walk=p.getSpeed();assert.ok(walk>1.5&&walk<1.7);
 p.keys.sprint=true;advance(p);assert.equal(p.isCrouchRunning,true);assert.equal(p.isSprinting,false);assert.equal(p.isCrouching,true);assert.ok(p.getSpeed()>2.7&&p.getSpeed()<2.9);assert.ok(Math.abs(p.currentHeight-p.crouchHeight)<.01);
 p.keys.sprint=false;advance(p);assert.equal(p.isCrouchRunning,false);assert.ok(p.getSpeed()<1.7);
 p.keys.sprint=true;p.isAiming=true;advance(p);assert.equal(p.isCrouchRunning,false);assert.ok(p.getSpeed()<1.7);
 p.isAiming=false;p.isReloading=true;advance(p);assert.equal(p.isCrouchRunning,false);p.resetInput();assert.equal(p.isCrouchRunning,false);
});
