// Bake the licensed source's ambient grip onto the production SWAT hand frames.
// Textures and source meshes are deliberately excluded from the runtime asset.
import { readFileSync, writeFileSync } from 'node:fs';
import * as T from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

async function load(path) {
    const source = readFileSync(path), length = source.readUInt32LE(12);
    const json = JSON.parse(source.subarray(20, 20 + length));
    json.materials = json.materials?.map(material => ({ name: material.name }));
    const text = Buffer.from(JSON.stringify(json));
    const padded = Buffer.alloc(Math.ceil(text.length / 4) * 4, 32); text.copy(padded);
    const bin = source.subarray(20 + length), buffer = Buffer.alloc(20 + padded.length + bin.length);
    buffer.writeUInt32LE(0x46546c67, 0); buffer.writeUInt32LE(2, 4); buffer.writeUInt32LE(buffer.length, 8);
    buffer.writeUInt32LE(padded.length, 12); buffer.writeUInt32LE(0x4e4f534a, 16);
    padded.copy(buffer, 20); bin.copy(buffer, 20 + padded.length);
    return new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(buffer.buffer, '');
}
const source = await load('animated_pistol.glb');
const target = await load('public/assets/operators/swat.glb');
const targetRoot = target.scene.getObjectByName('SWAT_ViewArms');
const gun = source.scene.getObjectByName('pistol');
const sourceBones = {}, targetBones = {};
source.scene.traverse(n => { if (n.isBone) sourceBones[n.name.replace(/_0\d+$/, '')] = n; });
targetRoot.traverse(n => { if (n.isBone) targetBones[n.name.replace(/^mixamorig[:_]?/, '').replace(/_\d+$/, '')] = n; });
source.scene.traverse(n => { if (n.isSkinnedMesh) n.skeleton.pose(); });
source.scene.updateMatrixWorld(true); target.scene.updateMatrixWorld(true);
const position = n => n.getWorldPosition(new T.Vector3());
const rotation = n => n.getWorldQuaternion(new T.Quaternion());
const frame = (direction, normal) => {
    const y = direction.clone().normalize();
    const z = normal.clone().addScaledVector(y, -normal.dot(y)).normalize();
    const x = new T.Vector3().crossVectors(y, z).normalize();
    return new T.Quaternion().setFromRotationMatrix(new T.Matrix4().makeBasis(x, y, z));
};
const fingers = { Thumb: 'thumb', Index: 'point', Middle: 'middle', Ring: 'ring', Pinky: 'pink' };
const sides = {};
for (const [side, prefix] of [['Left', 'L'], ['Right', 'R']]) {
    const wrist = sourceBones[`${prefix}_wrist`], hand = targetBones[`${side}Hand`];
    if (!wrist || !hand) throw new Error(`Missing ${side} wrist`);
    const palm = (w, middle, index, little) => {
        const y = position(middle).sub(position(w)).normalize();
        const x = position(index).sub(position(little)).normalize();
        return frame(y, new T.Vector3().crossVectors(x, y).normalize());
    };
    const sourcePalm = () => palm(wrist, sourceBones[`${prefix}_middle1`], sourceBones[`${prefix}_point1`], sourceBones[`${prefix}_pink1`]);
    const targetPalm = palm(hand, targetBones[`${side}HandMiddle1`], targetBones[`${side}HandIndex1`], targetBones[`${side}HandPinky1`]);
    const targetHandFrame = rotation(hand).invert().multiply(targetPalm);
    const sourceNormal = new T.Vector3(0, 0, 1).applyQuaternion(sourcePalm());
    const targetNormal = new T.Vector3(0, 0, 1).applyQuaternion(targetPalm);
    const joints = [];
    for (const [finger, name] of Object.entries(fingers)) for (let i = 1; i <= 3; i++) {
        const from = sourceBones[`${prefix}_${name}${i}`], to = targetBones[`${side}Hand${finger}${i}`];
        const nextSource = sourceBones[`${prefix}_${name}${i + 1}`];
        // The SWAT tip may be an end bone; all three deforming joints retain their lengths.
        const nextTarget = to.children.find(n => n.isBone);
        const targetDirection = nextTarget ? position(nextTarget).sub(position(to)) : position(to).sub(position(to.parent));
        const targetFrame = rotation(to).invert().multiply(frame(targetDirection, targetNormal));
        joints.push({ finger, i, from, to, nextSource, targetFrame,
            sourceNormal: sourceNormal.clone().applyQuaternion(rotation(from).invert()) });
    }
    sides[side] = { wrist, elbow: sourceBones[`${prefix}_elbow`], sourcePalm, targetHandFrame, joints };
}
const mixer = new T.AnimationMixer(source.scene);
const action = mixer.clipAction(source.animations[0]); action.setLoop(T.LoopOnce, 1); action.clampWhenFinished = true; action.play();
const conversion = new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), Math.PI);
// Align the source pistol's barrel extents with the existing M9 (including its 1.2 scale).
// Both source files use +Y up, but their muzzle directions are opposite.
const scale = (0.2255070555 * 1.2) / (20.0434093475 + 4.9323164804);
const offset = new T.Vector3(0, 0.0778324247 * 1.2 - 9.3572063446 * scale,
    0.0533503195 * 1.2 - 4.9323164804 * scale);
const packed = value => value.toArray().map(n => +n.toFixed(7));
const output = { version: 1, author: source.asset?.extras?.author || 'DJMaesen',
    source: 'https://sketchfab.com/3d-models/animated-pistol-bd896167e7ca44f19597d3afe6a8d83f',
    license: 'CC-BY-4.0', action: 'ambient', sourceFrames: [234, 264], fps: 30, duration: 1, frames: [] };
for (let i = 0; i <= 30; i++) {
    mixer.setTime((234 + i) / 30); source.scene.updateMatrixWorld(true);
    const gunInverse = rotation(gun).invert();
    const point = node => gun.worldToLocal(position(node)).multiplyScalar(scale).applyQuaternion(conversion).add(offset);
    const quaternion = q => conversion.clone().multiply(gunInverse).multiply(q).normalize();
    const sample = {};
    for (const [side, data] of Object.entries(sides)) {
        const wristRotation = quaternion(data.sourcePalm()).multiply(data.targetHandFrame.clone().invert());
        const world = new Map([[targetBones[`${side}Hand`], wristRotation]]);
        const fingerRotations = {};
        for (const joint of data.joints) {
            const direction = position(joint.nextSource).sub(position(joint.from));
            const normal = joint.sourceNormal.clone().applyQuaternion(rotation(joint.from));
            const desired = quaternion(frame(direction, normal)).multiply(joint.targetFrame.clone().invert());
            const parent = world.get(joint.to.parent);
            if (!parent) throw new Error(`Unmapped parent for ${joint.to.name}`);
            fingerRotations[`${joint.finger}${joint.i}`] = packed(parent.clone().invert().multiply(desired).normalize());
            world.set(joint.to, desired);
        }
        sample[side] = { position: packed(point(data.wrist)), elbow: packed(point(data.elbow)),
            rotation: packed(wristRotation), fingers: fingerRotations };
    }
    output.frames.push(sample);
}
writeFileSync('public/assets/animations/pistol-hold.json', JSON.stringify(output));
console.log(`Prepared ${output.frames.length} ambient grip samples (${JSON.stringify(output).length} bytes).`);
