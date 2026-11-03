import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { instantiateSwatRig, LEFT_GRIP, RIGHT_GRIP } from '../src/models/SwatRig.js';
import { emptyPose } from '../src/studio/PoseLibrary.js';
import { sampleViewAction } from '../src/models/ViewActions.js';

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

test('adapted imported actions preserve SWAT segment lengths and saved grip inputs', () => {
    const pack = JSON.parse(readFileSync(new URL('../public/assets/animations/view-actions.json', import.meta.url)));
    const { rig, reference } = makeViewRig();
    const custom = emptyPose(); custom.Right.handRotation[1] = 0.1;
    const before = JSON.stringify(custom);
    for (const clip of pack.clips) for (const progress of [0.15, 0.5, 0.85]) {
        rig.reset();
        rig.poseHands(reference, { pose: clip.id.startsWith('pistol') ? 'pistol' : clip.id.startsWith('grenade') ? 'grenade' : 'rifle',
            custom, motion: sampleViewAction(pack, clip.id, progress) });
        for (const side of ['Left', 'Right']) for (const part of ['ForeArm', 'Hand']) {
            const bone = rig.bones[side + part];
            assert.ok(Math.abs(bone.position.length() - rig.rest.get(bone).position.length()) < 0.00001);
            assert.ok(bone.matrixWorld.elements.every(Number.isFinite));
        }
    }
    assert.equal(JSON.stringify(custom), before);
});

test('studio offsets move the actual grip and fingers without stretching bones', () => {
    const { rig, reference } = makeViewRig();
    rig.reset(); rig.poseHands(reference);
    const finger = rig.bones.LeftHandIndex2.quaternion.clone();
    const lengths = Object.fromEntries(['LeftForeArm', 'LeftHand', 'RightForeArm', 'RightHand'].map(name => [name, rig.bones[name].position.length()]));
    const custom = emptyPose(); custom.Left.position[0] = 0.025; custom.Left.fingers.Index[1] = 0.4;
    rig.reset(); rig.poseHands(reference, { custom });
    const target = LEFT_GRIP.clone().add(new THREE.Vector3(0.025, 0, 0));
    assert.ok(rig.bones.LeftHand.getWorldPosition(new THREE.Vector3()).distanceTo(target) < 0.005);
    assert.ok(Math.abs(finger.angleTo(rig.bones.LeftHandIndex2.quaternion) - 0.4) < 0.001);
    for (const [name, length] of Object.entries(lengths)) assert.ok(Math.abs(rig.bones[name].position.length() - length) < 0.00001);
});

test('hand-only rotations leave shoulder and forearm transforms unchanged on both arms', () => {
    for (const side of ['Left', 'Right']) {
        const { rig, reference } = makeViewRig();
        rig.reset(); rig.poseHands(reference);
        const before = {};
        for (const joint of ['Arm', 'ForeArm', 'Hand']) {
            const bone = rig.bones[side + joint];
            before[joint] = { position: bone.getWorldPosition(new THREE.Vector3()), rotation: bone.getWorldQuaternion(new THREE.Quaternion()) };
        }
        const custom = emptyPose(); custom[side].handRotation = [0.25, -0.3, 0.4];
        rig.reset(); rig.poseHands(reference, { custom });
        for (const joint of ['Arm', 'ForeArm', 'Hand']) {
            const bone = rig.bones[side + joint];
            assert.ok(bone.getWorldPosition(new THREE.Vector3()).distanceTo(before[joint].position) < 0.00001);
            const angle = bone.getWorldQuaternion(new THREE.Quaternion()).angleTo(before[joint].rotation);
            if (joint === 'Hand') assert.ok(angle > 0.3);
            else assert.ok(angle < 0.00001, `${side} ${joint} moved with hand-only rotation`);
        }
    }
});

test('elbow rotation leaves shoulder fixed and shoulder rotation carries child joints', () => {
    const { rig, reference } = makeViewRig();
    rig.reset(); rig.poseHands(reference);
    const shoulder = rig.bones.LeftArm.getWorldQuaternion(new THREE.Quaternion());
    const wrist = rig.bones.LeftHand.getWorldPosition(new THREE.Vector3());
    const custom = emptyPose(); custom.Left.elbowRotation = [0.35, 0.1, 0];
    rig.reset(); rig.poseHands(reference, { custom });
    assert.ok(rig.bones.LeftArm.getWorldQuaternion(new THREE.Quaternion()).angleTo(shoulder) < 0.00001);
    assert.ok(rig.bones.LeftHand.getWorldPosition(new THREE.Vector3()).distanceTo(wrist) > 0.02);
    custom.Left.elbowRotation = [0, 0, 0]; custom.Left.shoulderRotation = [0.25, 0, 0];
    rig.reset(); rig.poseHands(reference, { custom });
    assert.ok(rig.bones.LeftArm.getWorldQuaternion(new THREE.Quaternion()).angleTo(shoulder) > 0.2);
    for (const joint of ['ForeArm', 'Hand']) assert.ok(Math.abs(rig.bones['Left' + joint].position.length() - rig.rest.get(rig.bones['Left' + joint]).position.length()) < 0.00001);
});

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
    for (const action of [{ reload: 0, bolt: 0 }, { reload: 0.5, bolt: 0 }, { reload: 0, bolt: 0.5 },
        { pose: 'pistol' }, { pose: 'pistol', reload: 0.5 }, { pose: 'throw', throwProgress: 0.2 },
        { pose: 'throw', throwProgress: 0.6 }, { pose: 'grenade', pinProgress: 0 },
        { pose: 'grenade', pinProgress: 0.5 }, { pose: 'grenade', pinProgress: 1 }]) {
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
        if (!action.pose && !action.reload && !action.bolt) {
            for (const [side, grip] of [['Left', LEFT_GRIP], ['Right', RIGHT_GRIP]]) {
                assert.ok(rig.bones[side + 'Hand'].getWorldPosition(new THREE.Vector3()).distanceTo(grip) < 0.005,
                    `${side} wrist must remain on its rifle grip`);
            }
        }
    }
});
