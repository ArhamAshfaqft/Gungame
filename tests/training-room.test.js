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

test('training room builds solid walls, a fractured door and four glass panes', () => {
    const { scene, colliders, room } = makeRoom();
    assert.ok(scene.children.length > 10);
    assert.ok(colliders.length >= 10);
    assert.ok(colliders.includes(room.doorBox), 'the closed door blocks movement');
    assert.equal(room.glassPanes.length, 4);
    assert.equal(room.doorPieces.length, 8 * 16);
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

test('shots leave a real hole, neighboring wood remains solid, and the door rebuilds', () => {
    const { colliders, scene, room } = makeRoom();
    scene.updateMatrixWorld(true);
    const ray = new THREE.Raycaster(new THREE.Vector3(0, 1.2, 38), new THREE.Vector3(0, 0, 1));
    const hit = ray.intersectObject(room.doorMesh)[0];
    assert.ok(hit);
    room.doorMesh.userData.breakable.takeBulletHit(hit, 125, new THREE.Vector3(0, 0, 1));
    assert.ok(room.brokenBoards.has(hit.instanceId), 'the piece under the crosshair is gone');
    assert.ok(room.brokenBoards.size > 1, 'neighbouring boards splinter away');
    assert.equal(ray.intersectObject(room.doorMesh).length, 0, 'a later round passes through the actual hole');
    const edge = new THREE.Raycaster(new THREE.Vector3(-0.43, 0.3, 38), new THREE.Vector3(0, 0, 1));
    assert.ok(edge.intersectObject(room.doorMesh).length > 0, 'wood away from the impact still stops rounds');

    for (let i = 0; i < 4; i++) {
        const piece = room.doorPieces.find(piece => !room.brokenBoards.has(piece.id));
        if (!piece) break;
        room.doorMesh.userData.breakable.takeBulletHit(fakeHit(piece.id), 125, new THREE.Vector3(0, 0, 1));
    }
    assert.equal(room.door.destroyed, true);
    assert.equal(room.brokenBoards.size, room.doorPieces.length);
    assert.equal(colliders.includes(room.doorBox), false, 'a destroyed door no longer blocks');

    room.update(36, new THREE.Vector3(0, 1.65, 38));
    assert.equal(room.door.destroyed, false, 'the range rebuilds the door');
    assert.equal(room.brokenBoards.size, 0);
    assert.ok(colliders.includes(room.doorBox));
    scene.updateMatrixWorld(true);
    assert.ok(ray.intersectObject(room.doorMesh).length > 0, 'rebuilt wood blocks the old bullet channel');
});

test('glass shatters on impact and is replaced later', () => {
    const { room } = makeRoom();
    const pane = room.glassPanes[0];
    pane.userData.breakable.takeBulletHit({ point: new THREE.Vector3(-5, 1.45, 44) }, 125);
    assert.equal(pane.userData.shattered, true);
    assert.equal(pane.visible, false);
    assert.equal(pane.userData.isShootable, false);
    assert.ok(room.debris.length > 0, 'shards are falling');
    const positions = room.glassDebris.pieces.map(piece => piece.position);
    const extent = new THREE.Box3().setFromPoints(positions).getSize(new THREE.Vector3());
    assert.ok(extent.z > 0.9, 'shards come from the width of the pane, not just the bullet point');
    assert.ok(extent.y > 0.4);
    assert.equal(room.colliders.includes(pane.userData.collider), false, 'broken glass stops blocking movement');

    room.update(36, new THREE.Vector3(0, 1.65, 38));
    assert.equal(pane.userData.shattered, false);
    assert.equal(pane.visible, true);
    assert.equal(pane.userData.isShootable, true);
    assert.ok(room.colliders.includes(pane.userData.collider));
});

test('debris stays within a fixed render and memory budget during repeated destruction', () => {
    const { scene, room } = makeRoom();
    const originalObjects = scene.children.length;
    for (let i = 0; i < 700; i++) room.spawnDebris('wood', new THREE.Vector3(0, 1, 40), new THREE.Vector3(0, 0, 1));
    assert.equal(room.woodDebris.pieces.length, 192);
    assert.equal(scene.children.length, originalObjects, 'fragments reuse one instanced draw instead of adding meshes');
    room.update(10);
    assert.equal(room.debris.length, 0);
    assert.equal(room.woodDebris.mesh.count, 0);
});

test('opening, damaging and rebuilding the door invalidates its cached shadow', () => {
    const { room } = makeRoom();
    room.shadowsDirty = false;
    room.interact(new THREE.Vector3(0, 1.65, 38));
    room.update(0.1);
    assert.ok(room.shadowsDirty);
    room.shadowsDirty = false;
    room.breakBoard(20);
    assert.ok(room.shadowsDirty);
});
