import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { instantiateSwatRig, LEFT_GRIP, RIGHT_GRIP } from '../src/models/SwatRig.js';

// Load the actual production skeleton in Node; textures are irrelevant to pose validation.
const source = readFileSync(new URL('../public/assets/operators/swat.glb', import.meta.url));
const jsonLength = source.readUInt32LE(12);
const json = JSON.parse(source.subarray(20, 20 + jsonLength).toString());
json.materials = json.materials.map(material => ({ name: material.name }));
const text = Buffer.from(JSON.stringify(json));
const padded = Buffer.alloc(Math.ceil(text.length / 4) * 4, 32);
text.copy(padded);
const binChunk = source.subarray(20 + jsonLength);
const buffer = Buffer.alloc(20 + padded.length + binChunk.length);
buffer.writeUInt32LE(0x46546c67, 0); buffer.writeUInt32LE(2, 4); buffer.writeUInt32LE(buffer.length, 8);
buffer.writeUInt32LE(padded.length, 12); buffer.writeUInt32LE(0x4e4f534a, 16);
padded.copy(buffer, 20); binChunk.copy(buffer, 20 + padded.length);
const gltf = await new GLTFLoader().parseAsync(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength), '');

const makeViewRig = () => {
    const reference = new THREE.Group();
    const rig = instantiateSwatRig(gltf.scene.getObjectByName('SWAT_ViewArms'), true);
    rig.object.position.set(-0.24, -1.65, 0.3);
    rig.object.rotation.y = Math.PI;
    reference.add(rig.object);
    return { rig, reference };
};

test('first-person arm segments preserve source lengths', () => {
    const { rig } = makeViewRig();
    const body = instantiateSwatRig(gltf.scene.getObjectByName('SWAT_Body'));
    for (const side of ['Left', 'Right']) {
        for (const name of ['ForeArm', 'Hand']) {
            const actual = rig.rest.get(rig.bones[side + name]).position.length();
            const expected = body.rest.get(body.bones[side + name]).position.length();
            assert.ok(Math.abs(actual / expected - 1) < 0.001, `${side} ${name} segment must not stretch`);
        }
    }
});

test('posed forearm cross-sections retain thickness rather than collapsing into a ribbon', () => {
    const { rig, reference } = makeViewRig();
    rig.reset();
    const rings = [];
    for (const side of ['Left', 'Right']) {
        const origin = rig.bones[side + 'ForeArm'].getWorldPosition(new THREE.Vector3());
        const end = rig.bones[side + 'Hand'].getWorldPosition(new THREE.Vector3());
        const axis = end.clone().sub(origin).normalize(), length = origin.distanceTo(end);
        for (const [min, max] of [[0.25, 0.5], [0.65, 0.85]]) {
            const vertices = [];
            rig.object.traverse(mesh => {
                if (!mesh.isSkinnedMesh) return;
                mesh.skeleton.update();
                for (let i = 0; i < mesh.geometry.attributes.position.count; i += 2) {
                    const point = mesh.getVertexPosition(i, new THREE.Vector3()).applyMatrix4(mesh.matrixWorld);
                    const offset = point.clone().sub(origin), t = offset.dot(axis) / length;
                    const radius = offset.addScaledVector(axis, -t * length).length();
                    if (t >= min && t <= max && radius > 0.006 && radius < 0.08) vertices.push({ mesh, i, point });
                }
            });
            assert.ok(vertices.length > 15, `${side} cross-section must contain actual mesh vertices`);
            rings.push({ side, origin, axis, vertices });
        }
    }
    const thickness = (points, origin, axis) => {
        const u = new THREE.Vector3(0, 0, 1).cross(axis).normalize();
        const v = axis.clone().cross(u).normalize();
        const coordinates = points.map(point => {
            const offset = point.clone().sub(origin);
            return [offset.dot(u), offset.dot(v)];
        });
        const mean = coordinates.reduce((sum, p) => [sum[0] + p[0], sum[1] + p[1]], [0, 0]).map(n => n / coordinates.length);
        let xx = 0, yy = 0, xy = 0;
        for (const [x, y] of coordinates) { xx += (x - mean[0]) ** 2; yy += (y - mean[1]) ** 2; xy += (x - mean[0]) * (y - mean[1]); }
        const minorVariance = (xx + yy - Math.sqrt((xx - yy) ** 2 + 4 * xy * xy)) / (2 * coordinates.length);
        return Math.sqrt(Math.max(0, minorVariance));
    };
    rig.poseHands(reference);
    rig.object.traverse(mesh => { if (mesh.isSkinnedMesh) mesh.skeleton.update(); });
    for (const ring of rings) {
        const origin = rig.bones[ring.side + 'ForeArm'].getWorldPosition(new THREE.Vector3());
        const axis = rig.bones[ring.side + 'Hand'].getWorldPosition(new THREE.Vector3()).sub(origin).normalize();
        const before = thickness(ring.vertices.map(vertex => vertex.point), ring.origin, ring.axis);
        const after = thickness(ring.vertices.map(({ mesh, i }) => mesh.getVertexPosition(i, new THREE.Vector3()).applyMatrix4(mesh.matrixWorld)), origin, axis);
        assert.ok(after / before > 0.7, `${ring.side} forearm retained only ${(100 * after / before).toFixed(1)}% of its minor thickness`);
    }
});

test('actual SWAT wrist skin avoids near-180-degree folds while holding, reloading and cycling bolt', () => {
    const reference = new THREE.Group();
    const rig = instantiateSwatRig(gltf.scene.getObjectByName('SWAT_ViewArms'), true);
    rig.object.position.set(-0.24, -1.65, 0.3);
    rig.object.rotation.y = Math.PI;
    reference.add(rig.object);
    rig.reset();
    const rest = {};
    for (const side of ['Left', 'Right']) {
        for (const part of ['ForeArm', 'Hand']) {
            const name = side + part;
            rest[name] = rig.bones[name].getWorldQuaternion(new THREE.Quaternion());
        }
    }
    for (const action of [{ reload: 0, bolt: 0 }, { reload: 0.5, bolt: 0 }, { reload: 0, bolt: 0.5 }]) {
        rig.reset();
        rig.poseHands(reference, action);
        for (const side of ['Left', 'Right']) {
            const deformation = part => {
                const name = side + part;
                return rig.bones[name].getWorldQuaternion(new THREE.Quaternion()).multiply(rest[name].clone().invert());
            };
            const angle = THREE.MathUtils.radToDeg(deformation('ForeArm').angleTo(deformation('Hand')));
            assert.ok(angle < 95, `${side} wrist folded ${angle.toFixed(1)} degrees during ${JSON.stringify(action)}`);
        }
        if (!action.reload && !action.bolt) {
            for (const [side, grip] of [['Left', LEFT_GRIP], ['Right', RIGHT_GRIP]]) {
                assert.ok(rig.bones[side + 'Hand'].getWorldPosition(new THREE.Vector3()).distanceTo(grip) < 0.005,
                    `${side} wrist must remain on its rifle grip`);
            }
        }
    }
});
