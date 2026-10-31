import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { TrainingRoom } from '../src/world/TrainingRoom.js';

globalThis.window = new EventTarget();

const makeRoom = () => {
    const scene = new THREE.Scene();
    const colliders = [];
    return { scene, colliders, room: new TrainingRoom(scene, colliders) };
};

const fakeHit = (instanceId, point = new THREE.Vector3(0, 1.2, 40)) => ({ instanceId, point });

test('training room builds solid walls, a hinged door and two glass panes', () => {
    const { scene, colliders, room } = makeRoom();
    assert.ok(scene.children.length > 10);
    assert.ok(colliders.length >= 10);
    assert.ok(colliders.includes(room.doorBox), 'the closed door blocks movement');
    assert.equal(room.glassPanes.length, 4);
    assert.equal(room.doorMesh.count, 8 * 16);
    assert.ok(room.doorMesh.userData.breakable);
});

test('bullets block on the closed door and pass through the window opening', () => {
    const { scene, room } = makeRoom();
    scene.updateMatrixWorld(true);

    const doorRay = new THREE.Raycaster(new THREE.Vector3(0, 1.2, 30), new THREE.Vector3(0, 0, 1));
    const doorHits = doorRay.intersectObjects(scene.children, true);
    assert.ok(doorHits[0]?.object === room.doorMesh, 'the closed door stops the round');

    const windowRay = new THREE.Raycaster(new THREE.Vector3(-20, 1.45, 44), new THREE.Vector3(1, 0, 0));
    const windowHits = windowRay.intersectObjects(scene.children, true);
    assert.ok(windowHits[0]?.object === room.glassPanes[0], 'the window opening is glazed');
});

test('the door is opened and closed with the interaction key', () => {
    const { colliders, room } = makeRoom();
    const nearby = new THREE.Vector3(0, 1.65, 38);
    const far = new THREE.Vector3(0, 1.65, 20);

    assert.equal(room.interact(far), false);
    assert.equal(room.door.open, false);

    assert.equal(room.interact(nearby), true);
    assert.equal(room.door.open, true);

    room.update(0.4, nearby);
    assert.ok(room.door.openAmount > 0.5);
    assert.equal(colliders.includes(room.doorBox), false, 'an open door stops blocking');

    assert.equal(room.interact(nearby), true);
    assert.equal(room.door.open, false);
    for (let i = 0; i < 120; i++) room.update(1 / 60, nearby);
    assert.ok(room.door.openAmount < 0.01);
    assert.equal(colliders.includes(room.doorBox), true, 'the collider returns once it is shut');
});

test('shots remove the boards they hit and eventually break the door', () => {
    const { colliders, room } = makeRoom();
    const hit = fakeHit(20);
    room.doorMesh.userData.breakable.takeBulletHit(hit, 125, new THREE.Vector3(0, 0, 1));
    assert.ok(room.brokenBoards.has(20), 'the board under the crosshair is gone');
    assert.ok(room.brokenBoards.size > 1, 'neighbouring boards splinter away');

    const matrix = new THREE.Matrix4();
    room.doorMesh.getMatrixAt(20, matrix);
    assert.ok(matrix.elements[13] < -100, 'a broken board is moved out of the way');

    for (let i = 0; i < 4; i++) {
        room.doorMesh.userData.breakable.takeBulletHit(fakeHit(30 + i), 125, new THREE.Vector3(0, 0, 1));
    }
    assert.equal(room.door.destroyed, true);
    assert.equal(room.brokenBoards.size, room.doorMesh.count);
    assert.equal(colliders.includes(room.doorBox), false, 'a destroyed door no longer blocks');

    room.update(36, new THREE.Vector3(0, 1.65, 38));
    assert.equal(room.door.destroyed, false, 'the range rebuilds the door');
    assert.equal(room.brokenBoards.size, 0);
    assert.ok(colliders.includes(room.doorBox));
    room.doorMesh.getMatrixAt(20, matrix);
    assert.ok(Math.abs(matrix.elements[13] - room.boardMatrices[20].elements[13]) < 0.001);
});

test('glass shatters on impact and is replaced later', () => {
    const { room } = makeRoom();
    const pane = room.glassPanes[0];
    pane.userData.breakable.takeBulletHit({ point: new THREE.Vector3(-5, 1.45, 44) }, 125);
    assert.equal(pane.userData.shattered, true);
    assert.equal(pane.visible, false);
    assert.equal(pane.userData.isShootable, false);
    assert.ok(room.debris.length > 0, 'shards are falling');

    room.update(36, new THREE.Vector3(0, 1.65, 38));
    assert.equal(pane.userData.shattered, false);
    assert.equal(pane.visible, true);
    assert.equal(pane.userData.isShootable, true);
});
