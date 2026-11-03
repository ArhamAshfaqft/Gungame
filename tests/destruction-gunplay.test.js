import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { TrainingRoom } from '../src/world/TrainingRoom.js';
import { SniperWeapon } from '../src/weapons/SniperWeapon.js';
import { soundEngine } from '../src/audio/SoundEngine.js';

globalThis.window = new EventTarget();
for (const name of ['playWoodHit', 'playDoorBreak', 'playGlassBreak', 'playHitmarker']) soundEngine[name] = () => {};

class TestWeapon extends SniperWeapon {
    loadAssets() {}
    setupInput() {}
    createImpactSparks() {}
    createBulletTracer(start, end) { this.lastImpact = end.clone(); }
}

function fixture(x, y) {
    const scene = new THREE.Scene();
    const room = new TrainingRoom(scene, []);
    const camera = new THREE.PerspectiveCamera(60, 1, 0.01, 200);
    camera.position.set(x, y, 36);
    camera.lookAt(x, y, 44);
    const movement = { camera, position: camera.position, isGrounded: true };
    const weapon = new TestWeapon(scene, camera, movement);
    weapon.adsProgress = 1;
    const target = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.5, 0.5), new THREE.MeshBasicMaterial());
    target.position.set(x, y, 42);
    const damage = [];
    target.userData = { isShootable: true, bot: { isAlive: true, position: new THREE.Vector3(x, 0, 42), takeDamage: amount => damage.push(amount) } };
    scene.add(target);
    return { scene, room, camera, weapon, target, damage };
}

test('one shot shatters a window and continues to the target behind it with reduced damage', () => {
    const { room, weapon, damage } = fixture(3.1, 1.4);
    weapon.performRaycast();
    assert.equal(room.glassPanes.filter(pane => pane.userData.shattered).length, 1);
    assert.deepEqual(damage, [100], 'glass reduces the 125 body damage by 20%');
    assert.ok(weapon.lastImpact.z > 41, 'the tracer ends at the target, not at the glass');
    weapon.performRaycast();
    assert.deepEqual(damage, [100, 125], 'the next shot travels through the open window without glass attenuation');
});

test('wood stops the first round, while a second round travels through its new hole', () => {
    const { room, weapon, damage } = fixture(0, 1.2);
    weapon.performRaycast();
    assert.equal(room.door.damage, 125);
    assert.equal(damage.length, 0, 'solid wood protects the target on the first shot');
    weapon.performRaycast();
    assert.deepEqual(damage, [125]);
    assert.equal(room.door.damage, 125, 'an existing hole does not take extra damage from a passing round');
});

test('damage is not applied to a target behind an opaque wall', () => {
    const { scene, weapon, damage, room } = fixture(3.1, 1.4);
    const wall = new THREE.Mesh(new THREE.BoxGeometry(2, 3, 0.2), new THREE.MeshBasicMaterial());
    wall.position.set(3.1, 1.5, 39);
    wall.userData.isShootable = true;
    scene.add(wall);
    weapon.performRaycast();
    assert.equal(damage.length, 0);
    assert.ok(room.glassPanes.every(pane => !pane.userData.shattered));
});

test('pistol uses lighter damage through glass and against wood', () => {
    const glass = fixture(3.1, 1.4);
    glass.weapon.switchWeapon('pistol'); glass.weapon.performRaycast();
    assert.deepEqual(glass.damage, [27]);
    const wood = fixture(0, 1.2);
    wood.weapon.switchWeapon('pistol'); wood.weapon.performRaycast();
    assert.equal(wood.room.door.damage, 34); assert.equal(wood.damage.length, 0);
});

test('distant pistol rounds transfer less damage to breakable panels and report range to surface effects',()=>{
 const {camera,weapon,room}=fixture(0,1.2);camera.position.z=-10;camera.lookAt(0,1.2,44);weapon.switchWeapon('pistol');
 const impacts=[];weapon.surfaceDamage={hit:(...args)=>impacts.push(args)};weapon.performRaycast();
 assert.ok(room.door.damage>0&&room.door.damage<25);
 assert.ok(impacts[0][3].distance>40);assert.equal(impacts[0][3].damage,34);assert.equal(impacts[0][3].panel,true);
});
