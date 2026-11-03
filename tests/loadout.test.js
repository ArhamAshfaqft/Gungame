import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { SniperWeapon } from '../src/weapons/SniperWeapon.js';
import { Throwables } from '../src/weapons/Throwables.js';
import { SmokeCloud } from '../src/weapons/SmokeCloud.js';
import { sweepSphere, flashExposure, hasLineOfSight } from '../src/weapons/CombatQueries.js';
import { soundEngine } from '../src/audio/SoundEngine.js';
import { TrainingRoom } from '../src/world/TrainingRoom.js';
import { readFileSync } from 'node:fs';

for (const method of ['playUtility', 'playPistolShot', 'playReload', 'playSniperShot', 'playBoltCycle', 'playWoodHit', 'playDoorBreak', 'playGlassBreak']) soundEngine[method] = () => {};
class Weapon extends SniperWeapon {
    loadAssets() {}
    setupInput() {}
    performRaycast() { this.shots = (this.shots || 0) + 1; }
}
function setup() {
    globalThis.window = new EventTarget();
    const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(85, 1, 0.01, 200);
    camera.position.set(0, 1.65, 0);
    const movement = { position: camera.position, velocity: new THREE.Vector3(), mouseDelta: new THREE.Vector2(), currentFov: 85,
        standHeight: 1.65, isLocked: true, isGrounded: true, sprintRecovery: 0,
        requestWeaponReady() {}, resetInput() {}, getSpeed() { return 0; } };
    const weapon = new Weapon(scene, camera, movement);
    const equipment = new Throwables(scene, camera, movement, weapon);
    return { scene, camera, movement, weapon, equipment };
}
const tick = (weapon, seconds) => { for (let n = 0; n < Math.ceil(seconds * 60); n++) weapon.update(1 / 60); };
function wall(scene) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(5, 4, 0.1), new THREE.MeshBasicMaterial());
    mesh.position.set(0, 1, -2); mesh.userData.isShootable = true;
    scene.add(mesh); scene.updateMatrixWorld(true); return mesh;
}

test('switching keeps separate ammo and cancels reload without granting ammunition', () => {
    const { weapon } = setup();
    weapon.magAmmo = 1; weapon.reload(); tick(weapon, 0.4);
    weapon.switchWeapon('pistol'); tick(weapon, 2);
    assert.equal(weapon.magAmmo, 15); assert.equal(weapon.reserveAmmo, 45);
    weapon.shoot(); assert.equal(weapon.magAmmo, 14);
    weapon.switchWeapon('primary'); tick(weapon, 0.3);
    assert.equal(weapon.magAmmo, 1); assert.equal(weapon.reserveAmmo, 35);
    weapon.reload(); tick(weapon, 1.4);
    assert.equal(weapon.magAmmo, 5); assert.equal(weapon.reserveAmmo, 31);
    weapon.switchWeapon('pistol'); assert.equal(weapon.magAmmo, 14);
});

test('pistol is semi-auto, respects cooldown, and utility blocks firing and switching', () => {
    const { weapon } = setup();
    weapon.switchWeapon('pistol'); weapon.shoot(); assert.equal(weapon.magAmmo, 15);
    tick(weapon, 0.3); weapon.shoot(); weapon.shoot(); assert.equal(weapon.magAmmo, 14);
    tick(weapon, 0.19); assert.equal(weapon.magAmmo, 14, 'holding does not auto fire');
    weapon.shoot(); assert.equal(weapon.magAmmo, 13);
    assert.equal(weapon.beginUtility(), true);
    weapon.shoot(); assert.equal(weapon.magAmmo, 13);
    assert.equal(weapon.switchWeapon('primary'), false);
});

test('pin pull consumes one grenade, release keeps the cooked six-second fuse, and cannot repeat', () => {
    const { equipment, weapon } = setup();
    equipment.select('flash'); assert.equal(equipment.throwSelected(), false);
    assert.equal(equipment.pullPin(), true); assert.equal(equipment.pullPin(), false);
    assert.equal(equipment.counts.flash, 1);
    equipment.update(2);
    assert.equal(equipment.throwSelected(), true); assert.equal(equipment.throwSelected(), false);
    equipment.update(0.23); assert.equal(equipment.projectiles.length, 1);
    assert.ok(Math.abs(equipment.projectiles[0].age - 2.23) < 0.001);
    equipment.update(0.1); assert.equal(equipment.counts.flash, 1);
    for (let n = 0; n < 120; n++) { equipment.update(1 / 60); weapon.update(1 / 60); }
    assert.equal(equipment.projectiles.length, 1, 'cooking and flight share one fuse');
    assert.equal(equipment.pending, null);
    for (let n = 0; n < 120; n++) equipment.update(1 / 60);
    assert.equal(equipment.projectiles.length, 0);
});

test('safe grenades stay visible without consuming inventory and can be stowed', () => {
    const { equipment, weapon } = setup();
    equipment.select('frag'); equipment.update(10); weapon.update(1 / 60);
    assert.equal(equipment.held.model.parent, weapon.weaponGroup);
    assert.equal(equipment.held.model.visible, true); assert.equal(equipment.counts.frag, 2);
    assert.equal(equipment.fuseRemaining, null); assert.equal(weapon.grenadeEquipped, true);
    const ammo = weapon.magAmmo; weapon.shoot(); assert.equal(weapon.magAmmo, ammo);
    weapon.switchWeapon('pistol'); assert.equal(equipment.held, null);
    assert.equal(weapon.activeSlot, 'pistol'); assert.equal(equipment.counts.frag, 2);
});

test('live grenades cannot be stowed or swapped and detonate in hand after six seconds', () => {
    for (const type of ['frag', 'flash', 'smoke']) {
        const { equipment, weapon } = setup(); let detonation;
        equipment.detonate = (type, position) => { detonation = { type, position }; };
        equipment.select(type); equipment.pullPin(); equipment.update(5.9);
        assert.equal(detonation, undefined); assert.equal(equipment.stow(), false);
        assert.equal(weapon.switchWeapon('pistol'), false); assert.equal(equipment.select('smoke'), false);
        equipment.update(0.11); assert.equal(detonation.type, type);
        assert.equal(equipment.held, null); assert.equal(equipment.counts[type], 1);
        assert.equal(equipment.trajectory.visible, false);
    }
});

test('low toss is slower, lower and shorter than high throw and launch respects cover', () => {
    const { equipment } = setup();
    const high = equipment.launchParameters('high'), low = equipment.launchParameters('low');
    assert.ok(high.velocity.length() > low.velocity.length() * 2);
    assert.ok(low.position.y < high.position.y); assert.ok(low.velocity.y < high.velocity.y);
    equipment.colliders.push(new THREE.Box3(new THREE.Vector3(-1, 0, -0.2), new THREE.Vector3(1, 3, -0.1)));
    assert.ok(equipment.launchParameters('high').position.z > -0.035);
});

test('equipping and throwing never changes saved firearm placements', () => {
    const { equipment, weapon } = setup();
    weapon.poseLibrary.poses['primary:hip'].Left.position[0] = 0.025;
    weapon.poseLibrary.poses['pistol:aim'].Right.handRotation[2] = 0.4;
    const before = JSON.stringify(weapon.poseLibrary);
    equipment.select('smoke'); weapon.update(1 / 60); equipment.pullPin(); equipment.update(1);
    equipment.throwSelected('low');
    for (let i = 0; i < 60; i++) { equipment.update(1 / 60); weapon.update(1 / 60); }
    assert.equal(JSON.stringify(weapon.poseLibrary), before);
    assert.equal(weapon.grenadeEquipped, false);
    assert.equal(weapon.poseOverrides.Left.position[0], 0.025);
});

test('gameplay reads independent saved holding and throwing offsets for the equipped throwable', () => {
    const { equipment, weapon } = setup();
    weapon.poseLibrary.poses['smoke:hold'].weapon.position[0] = 0.04;
    weapon.poseLibrary.poses['smoke:hold'].Right.handRotation[1] = 0.2;
    weapon.poseLibrary.poses['smoke:low'].Right.handRotation[1] = 0.6;
    equipment.select('smoke'); weapon.update(0);
    assert.ok(Math.abs(weapon.weaponGroup.position.x - 0.24) < 0.00001);
    assert.equal(weapon.grenadePoseOverrides.Right.handRotation[1], 0.2);
    equipment.pullPin(); equipment.update(0.35); equipment.throwSelected('low');
    equipment.update(0.21); weapon.update(0);
    assert.ok(Math.abs(weapon.grenadePoseOverrides.Right.handRotation[1] - 0.6) < 0.00001);
});

test('grenade-only placement moves and rotates the held model without changing group or hand pose', () => {
    const { equipment, weapon } = setup();
    equipment.select('frag'); equipment.update(0); weapon.update(0);
    const group = weapon.weaponGroup.position.clone();
    const base = equipment.held.model.position.clone();
    const grip = JSON.stringify(weapon.grenadePoseOverrides.Right);
    weapon.poseLibrary.poses['frag:hold'].item.position = [0.05, -0.02, 0.01];
    weapon.poseLibrary.poses['frag:hold'].item.rotation = [0, 0.4, 0.2];
    weapon.poseRevision++;
    equipment.update(0); weapon.update(0);
    assert.ok(equipment.held.model.position.distanceTo(base.clone().add(new THREE.Vector3(0.05, -0.02, 0.01))) < 0.00001);
    assert.equal(equipment.held.model.rotation.y, 0.4);
    assert.ok(weapon.weaponGroup.position.distanceTo(group) < 0.00001);
    assert.equal(JSON.stringify(weapon.grenadePoseOverrides.Right), grip);
});

test('imported actions follow gameplay states without changing saved poses or ammo timing', () => {
    const { weapon, equipment } = setup();
    weapon.viewActionPack = JSON.parse(readFileSync(new URL('../public/assets/animations/view-actions.json', import.meta.url)));
    const before = JSON.stringify(weapon.poseLibrary);
    weapon.switchWeapon('pistol'); weapon.update(0.1); assert.equal(weapon.viewMotion.id, 'pistolDraw');
    tick(weapon, 0.3); weapon.shoot(); weapon.update(0.04); assert.equal(weapon.viewMotion.id, 'pistolFire');
    weapon.reload(); weapon.update(0.3); assert.equal(weapon.viewMotion.id, 'pistolReload');
    assert.equal(weapon.magAmmo, 14); tick(weapon, 1); assert.equal(weapon.magAmmo, 15);
    equipment.select('flash'); weapon.update(0.1); assert.equal(weapon.viewMotion.id, 'grenadeDraw');
    equipment.pullPin(); equipment.update(0.15); weapon.update(0.01); assert.equal(weapon.viewMotion.id, 'grenadePin');
    equipment.update(0.2); equipment.throwSelected(); equipment.update(0.1); weapon.update(0.01);
    assert.equal(weapon.viewMotion.id, 'grenadeThrow');
    assert.equal(JSON.stringify(weapon.poseLibrary), before);
});

test('swept grenade cannot tunnel through thin cover, then bounces away', () => {
    const { equipment } = setup();
    const box = new THREE.Box3(new THREE.Vector3(-2, 0, -1.01), new THREE.Vector3(2, 3, -0.99));
    const start = new THREE.Vector3(0, 1, 0), end = new THREE.Vector3(0, 1, -5);
    const hit = sweepSphere(start, end, 0.065, [box]);
    assert.ok(hit.time < 0.2); assert.equal(hit.normal.z, 1);
    equipment.colliders.push(box);
    const projectile = equipment.spawn('frag', start, new THREE.Vector3(0, 0, -100));
    equipment.integrate(projectile, 0.05);
    assert.ok(projectile.position.z > -0.925); assert.ok(projectile.velocity.z > 0);
});

test('flash is reduced when looking away and blocked by opaque cover', () => {
    assert.ok(flashExposure(2, 1) > flashExposure(2, -1) * 4);
    assert.equal(flashExposure(2, 1, false), 0); assert.equal(flashExposure(12, 1), 0);
    const { equipment, scene } = setup();
    const position = new THREE.Vector3(0, 1.65, -4);
    const cover = wall(scene); equipment.flash(position); assert.equal(equipment.flashRemaining, 0);
    scene.remove(cover); equipment.flash(position); assert.ok(equipment.flashRemaining > 2);
});

test('frag damage falls off with distance and opaque cover protects targets and player', () => {
    const { equipment, scene } = setup(); let nearby = 0, distant = 0;
    equipment.bots = { bots: [
        { isAlive: true, position: new THREE.Vector3(0, 0, -1), takeDamage: d => nearby += d },
        { isAlive: true, position: new THREE.Vector3(0, 0, -5), takeDamage: d => distant += d },
    ] };
    equipment.explode(new THREE.Vector3(0, 0.9, 0));
    assert.ok(nearby > distant && distant > 0);
    equipment.playerHealth = 100; nearby = distant = 0;
    wall(scene); equipment.explode(new THREE.Vector3(0, 0.9, -4));
    assert.equal(nearby, 0); assert.ok(distant > 0); assert.equal(equipment.playerHealth, 100);
});

test('smoke grows, clips indoors, fades, and uses a bounded instanced pool', () => {
    const { equipment, scene } = setup();
    const clip = new THREE.Box3(new THREE.Vector3(-1, 0, -1), new THREE.Vector3(1, 3, 1));
    const cloud = new SmokeCloud(scene, new THREE.Vector3(), clip);
    assert.equal(cloud.strength, 0); cloud.update(1);
    assert.ok(cloud.opacityAt(new THREE.Vector3(0, 0.8, 0)) > 0.9);
    assert.equal(cloud.opacityAt(new THREE.Vector3(1.1, 0.8, 0)), 0);
    assert.equal(cloud.mesh.count, 36); cloud.update(13); assert.equal(cloud.strength, 0); cloud.dispose(scene);
    for (let n = 0; n < 5; n++) equipment.detonate('smoke', new THREE.Vector3());
    assert.equal(equipment.clouds.length, 3);
    equipment.update(15); assert.equal(equipment.clouds.length, 0);
});

test('blast down recovers and resupplies the training loadout', () => {
    const { equipment, movement, weapon } = setup();
    equipment.damagePlayer(160); assert.equal(movement.isDisabled, true);
    weapon.magAmmo = 0; equipment.counts.frag = 0; equipment.update(2.6);
    assert.equal(movement.isDisabled, false); assert.equal(equipment.playerHealth, 100);
    assert.equal(weapon.magAmmo, 5); assert.equal(equipment.counts.frag, 2);
    assert.equal(movement.position.y, movement.standHeight);
});

test('frag breaches a nearby real door and grenade impact shatters a real pane', () => {
    const { equipment, scene } = setup();
    equipment.room = new TrainingRoom(scene, equipment.colliders);
    scene.updateMatrixWorld(true);
    equipment.explode(new THREE.Vector3(0, 1, 39.5));
    assert.equal(equipment.room.door.destroyed, true);
    const glazing = setup();
    glazing.equipment.room = new TrainingRoom(glazing.scene, glazing.equipment.colliders);
    glazing.scene.updateMatrixWorld(true);
    const pane = glazing.equipment.room.glassPanes.find(p => Math.abs(p.getWorldPosition(new THREE.Vector3()).x - 3.1) < 0.1);
    assert.ok(pane);
    const center = pane.getWorldPosition(new THREE.Vector3());
    const projectile = glazing.equipment.spawn('smoke', center.clone().add(new THREE.Vector3(0, 0, -0.5)), new THREE.Vector3(0, 0, 15));
    glazing.equipment.integrate(projectile, 0.08);
    assert.equal(pane.userData.shattered, true);
    assert.equal(glazing.equipment.colliders.includes(pane.userData.collider), false);
});

test('M9 timeline duration and ammo event drive gameplay exactly once, including cancellation', () => {
    const { weapon } = setup(); weapon.switchWeapon('pistol'); tick(weapon,.3); weapon.magAmmo=3;
    const sequence=weapon.poseLibrary.reloadSequence; sequence.duration=2; for (const key of sequence.keys) key.time=key.time/1.15*2; sequence.events=[{type:'ammo',time:1}];
    weapon.reload(); assert.equal(weapon.reloadRemaining,2); sequence.duration=4;
    tick(weapon,.8); assert.equal(weapon.magAmmo,3); tick(weapon,.3); assert.equal(weapon.magAmmo,15); assert.equal(weapon.reserveAmmo,33); assert.equal(weapon.isReloading,true);
    tick(weapon,1); assert.equal(weapon.reserveAmmo,33); assert.equal(weapon.isReloading,false);
    weapon.poseLibrary.reloadSequence.duration=2; weapon.magAmmo=2; weapon.reload(); tick(weapon,.5); weapon.switchWeapon('primary'); tick(weapon,2); assert.equal(weapon.ammoStores.pistol.ammo,2);
});

test('grenades pass underneath hollow stair flights and bounce on the real sloped surface',()=>{
 const box=new THREE.Box3(new THREE.Vector3(-1,3.4,-3.5),new THREE.Vector3(1,6.8,3.5));box.ramp={position:new THREE.Vector3(0,3.4,0),width:2,length:7,height:3.4,rotation:0,thickness:.26};
 assert.equal(sweepSphere(new THREE.Vector3(0,3.5,.5),new THREE.Vector3(0,3.5,-.5),.065,[box]),null);
 const hit=sweepSphere(new THREE.Vector3(0,7,0),new THREE.Vector3(0,4,0),.065,[box]);assert.ok(hit);assert.ok(hit.normal.y>.8);assert.ok(hit.normal.z>0);assert.ok(hit.time>.4&&hit.time<.7);
});
