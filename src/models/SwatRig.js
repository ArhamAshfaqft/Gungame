import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';

let assetPromise;
const normalizeName = name => name.replace(/^mixamorig[:_]?/i, '').replace(/_\d+$/, '');
const axisX = new THREE.Vector3(1, 0, 0);
const axisY = new THREE.Vector3(0, 1, 0);

// Both views use the same rifle-space grip locations and the same skinned gloves.
export const RIGHT_GRIP = new THREE.Vector3(0.048, -0.14, 0.16);
export const LEFT_GRIP = new THREE.Vector3(-0.085, -0.055, -0.26);
const handBasis = (x, y, z) => new THREE.Quaternion().setFromRotationMatrix(
    new THREE.Matrix4().makeBasis(new THREE.Vector3(...x), new THREE.Vector3(...y), new THREE.Vector3(...z)));
const gripRotation = {
    Right: handBasis([0, 0, 1], [0, 1, 0], [-1, 0, 0]),
    Left: handBasis([0, 0, 1], [1, 0, 0], [0, 1, 0]),
};

export function getMovementState(movement) {
    if (movement.isSliding) return 'slide';
    if (!movement.isGrounded) return movement.velocity.y > 0 ? 'jump' : 'fall';
    if (movement.getSpeed() < 0.4) return 'idle';
    return movement.isSprinting ? 'sprint' : 'run';
}

// Keep only sleeve/hand triangles. Skin weights, UVs and material groups survive.
export function extractArmGeometry(mesh, includeUpperArm = true) {
    const source = mesh.geometry;
    const indices = source.index;
    const skinIndex = source.attributes.skinIndex, skinWeight = source.attributes.skinWeight;
    const armPattern = includeUpperArm ? /^(Left|Right)(Arm|ForeArm|Hand)/ : /^(Left|Right)(ForeArm|Hand)/;
    const armBones = new Set(mesh.skeleton.bones.flatMap((bone, i) => armPattern.test(normalizeName(bone.name)) ? [i] : []));
    const weight = vertex => {
        let value = 0;
        for (let k = 0; k < 4; k++) if (armBones.has(skinIndex.getComponent(vertex, k))) value += skinWeight.getComponent(vertex, k);
        return value;
    };
    const geometry = new THREE.BufferGeometry();
    const remap = new Map(), used = [], output = [];
    for (const group of source.groups.length ? source.groups : [{ start: 0, count: indices?.count || source.attributes.position.count, materialIndex: 0 }]) {
        const start = output.length;
        for (let i = group.start; i < group.start + group.count; i += 3) {
            const triangle = [0, 1, 2].map(offset => indices ? indices.getX(i + offset) : i + offset);
            if (triangle.some(vertex => weight(vertex) < 0.48)) continue;
            for (const vertex of triangle) {
                if (!remap.has(vertex)) { remap.set(vertex, used.length); used.push(vertex); }
                output.push(remap.get(vertex));
            }
        }
        if (output.length > start) geometry.addGroup(start, output.length - start, group.materialIndex);
    }
    for (const [name, attribute] of Object.entries(source.attributes)) {
        const array = new attribute.array.constructor(used.length * attribute.itemSize);
        used.forEach((vertex, i) => {
            for (let k = 0; k < attribute.itemSize; k++) array[i * attribute.itemSize + k] = attribute.array[vertex * attribute.itemSize + k];
        });
        geometry.setAttribute(name, new THREE.BufferAttribute(array, attribute.itemSize, attribute.normalized));
    }
    geometry.setIndex(output);
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    return geometry;
}

async function loadAsset() {
    assetPromise ||= (async () => {
        const gltf = await new GLTFLoader().loadAsync('/assets/operators/swat.glb');
        const body = gltf.scene.getObjectByName('SWAT_Body');
        const arms = gltf.scene.getObjectByName('SWAT_ViewArms');
        if (!body || !arms) throw new Error('SWAT asset is missing its body or arm rig.');
        return { body, arms };
    })();
    return assetPromise;
}

export async function createSwatRig({ armsOnly = false } = {}) {
    const asset = await loadAsset();
    return instantiateSwatRig(armsOnly ? asset.arms : asset.body, armsOnly);
}

export function instantiateSwatRig(template, armsOnly = false) {
    // A wrapper gives the IK solver normalized meter coordinates around the authored FBX root.
    const object = new THREE.Group();
    object.add(clone(template));
    object.name = armsOnly ? 'SWAT_FirstPersonArms' : 'SWAT_FullBody';
    object.traverse(mesh => {
        if (!mesh.isMesh) return;
        mesh.castShadow = false;
        mesh.receiveShadow = !armsOnly;
        mesh.frustumCulled = !armsOnly;
        if (mesh.isSkinnedMesh && !armsOnly) {
            mesh.geometry.computeBoundingSphere();
            mesh.boundingSphere = mesh.geometry.boundingSphere.clone();
            mesh.boundingSphere.radius *= 1.5;
        }
    });
    return new SwatRig(object, armsOnly);
}

export class SwatRig {
    constructor(object, armsOnly = false) {
        this.object = object;
        this.armsOnly = armsOnly;
        this.bones = {};
        this.rest = new Map();
        object.updateMatrixWorld(true);
        object.traverse(bone => {
            if (!bone.isBone) return;
            this.bones[normalizeName(bone.name)] = bone;
            this.rest.set(bone, { position: bone.position.clone(), quaternion: bone.quaternion.clone() });
        });
        this.unitsPerMeter = 1 / this.bones.Hips.getWorldScale(new THREE.Vector3()).y;
        this.phase = 0;
        this.time = 0;
        this.slideBlend = 0;
        this.sprintBlend = 0;
        this.moveBlend = 0;
        this.state = 'idle';
        this.footRotation = {};
        for (const side of ['Left', 'Right']) {
            this.footRotation[side] = this.bones[`${side}Foot`].getWorldQuaternion(new THREE.Quaternion());
        }
    }

    reset() {
        for (const [bone, rest] of this.rest) {
            bone.position.copy(rest.position);
            bone.quaternion.copy(rest.quaternion);
        }
        this.object.updateMatrixWorld(true);
    }

    rotate(name, x = 0, y = 0, z = 0) {
        const bone = this.bones[name];
        if (bone) bone.quaternion.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z)));
    }

    setWorldRotation(bone, quaternion) {
        const parent = bone.parent.getWorldQuaternion(new THREE.Quaternion()).invert();
        bone.quaternion.copy(parent.multiply(quaternion));
        bone.updateMatrixWorld(true);
    }

    // Analytic two-bone IK keeps wrists on the gun and feet at stance height.
    solveIK(upper, lower, end, target, pole) {
        const a = upper.getWorldPosition(new THREE.Vector3());
        const b = lower.getWorldPosition(new THREE.Vector3());
        const c = end.getWorldPosition(new THREE.Vector3());
        const l1 = a.distanceTo(b), l2 = b.distanceTo(c);
        const direction = target.clone().sub(a);
        const distance = THREE.MathUtils.clamp(direction.length(), Math.abs(l1 - l2) + 0.0001, l1 + l2 - 0.0001);
        direction.normalize();
        const bend = pole.clone().sub(a);
        bend.addScaledVector(direction, -bend.dot(direction));
        if (bend.lengthSq() < 0.00001) bend.crossVectors(direction, axisX);
        bend.normalize();
        const along = (l1 * l1 - l2 * l2 + distance * distance) / (2 * distance);
        const elbow = a.clone().addScaledVector(direction, along).addScaledVector(bend, Math.sqrt(Math.max(0, l1 * l1 - along * along)));
        const turn = (bone, current, desired) => {
            const rotation = new THREE.Quaternion().setFromUnitVectors(current.normalize(), desired.normalize());
            rotation.multiply(bone.getWorldQuaternion(new THREE.Quaternion()));
            this.setWorldRotation(bone, rotation);
        };
        turn(upper, b.clone().sub(a), elbow.sub(a));
        const nextB = lower.getWorldPosition(new THREE.Vector3());
        turn(lower, end.getWorldPosition(new THREE.Vector3()).sub(nextB), target.clone().sub(nextB));
    }

    curlFingers(side, amount = 1, trigger = false) {
        for (const finger of ['Index', 'Middle', 'Ring', 'Pinky']) {
            for (let joint = 1; joint <= 3; joint++) {
                const curl = trigger && finger === 'Index' ? [0.22, 0.42, 0.35][joint - 1] : [0.65, 1.05, 0.7][joint - 1];
                this.rotate(`${side}Hand${finger}${joint}`, curl * amount);
            }
        }
        this.rotate(`${side}HandThumb1`, 0.25, side === 'Left' ? -0.4 : 0.4, side === 'Left' ? 0.2 : -0.2);
        this.rotate(`${side}HandThumb2`, 0.35);
        this.rotate(`${side}HandThumb3`, 0.45);
    }

    alignForearmTwist(side, handRotation) {
        const forearm = this.bones[`${side}ForeArm`];
        const hand = this.bones[`${side}Hand`];
        const current = forearm.getWorldQuaternion(new THREE.Quaternion());
        const axis = hand.position.clone().normalize().applyQuaternion(current);
        // Recover the forearm frame implied by the desired wrist and the bind-pose wrist offset.
        const desired = handRotation.clone().multiply(this.rest.get(hand).quaternion.clone().invert());
        const project = vector => vector.addScaledVector(axis, -vector.dot(axis)).normalize();
        const from = project(axisX.clone().applyQuaternion(current));
        const to = project(axisX.clone().applyQuaternion(desired));
        const angle = Math.atan2(axis.dot(from.clone().cross(to)), THREE.MathUtils.clamp(from.dot(to), -1, 1));
        current.premultiply(new THREE.Quaternion().setFromAxisAngle(axis, angle));
        this.setWorldRotation(forearm, current);

        // A wrist-only correction transfers the same twist to the elbow blend.
        // Roll the upper arm around its length as well, keeping the IK joint positions fixed.
        const upper = this.bones[`${side}Arm`];
        const upperRotation = upper.getWorldQuaternion(new THREE.Quaternion());
        const upperAxis = forearm.position.clone().normalize().applyQuaternion(upperRotation);
        const upperDesired = current.clone().multiply(this.rest.get(forearm).quaternion.clone().invert());
        const upperProject = vector => vector.addScaledVector(upperAxis, -vector.dot(upperAxis)).normalize();
        const upperFrom = upperProject(axisX.clone().applyQuaternion(upperRotation));
        const upperTo = upperProject(axisX.clone().applyQuaternion(upperDesired));
        const roll = Math.atan2(upperAxis.dot(upperFrom.clone().cross(upperTo)),
            THREE.MathUtils.clamp(upperFrom.dot(upperTo), -1, 1));
        upperRotation.premultiply(new THREE.Quaternion().setFromAxisAngle(upperAxis, roll));
        this.setWorldRotation(upper, upperRotation);
        this.setWorldRotation(forearm, current);
    }

    poseHands(reference, { reload = 0, bolt = 0 } = {}) {
        this.object.updateMatrixWorld(true);
        reference.updateWorldMatrix(true, false);
        const left = LEFT_GRIP.clone();
        const right = RIGHT_GRIP.clone();
        // The support hand goes to the magazine; the trigger hand cycles the bolt.
        const reloadReach = Math.sin(THREE.MathUtils.clamp(reload, 0, 1) * Math.PI);
        left.lerp(new THREE.Vector3(-0.025, -0.23, 0.035), reloadReach);
        right.add(new THREE.Vector3(0.065, 0.045, -0.04).multiplyScalar(Math.sin(bolt * Math.PI)));
        for (const side of ['Left', 'Right']) {
            if (this.armsOnly) {
                // Place the shoulder behind the lower frame instead of stretching the bones to reach the rifle.
                const shoulder = side === 'Left' ? new THREE.Vector3(-0.28, -0.34, 0.04) : new THREE.Vector3(0.30, -0.36, 0.26);
                const upper = this.bones[`${side}Arm`];
                const world = reference.localToWorld(shoulder);
                upper.position.copy(upper.parent.worldToLocal(world));
                upper.updateMatrixWorld(true);
            }
            const target = reference.localToWorld((side === 'Left' ? left : right).clone());
            const pole = this.armsOnly
                ? reference.localToWorld(new THREE.Vector3(side === 'Left' ? -0.6 : 0.5, -0.6, 0.05))
                : this.object.localToWorld(new THREE.Vector3(side === 'Left' ? 0.65 : -0.65, 1.03, 0.16));
            this.solveIK(this.bones[`${side}Arm`], this.bones[`${side}ForeArm`], this.bones[`${side}Hand`], target, pole);
            const rotation = reference.getWorldQuaternion(new THREE.Quaternion()).multiply(gripRotation[side]);
            this.alignForearmTwist(side, rotation);
            this.setWorldRotation(this.bones[`${side}Hand`], rotation);
            this.curlFingers(side, 1 - reloadReach * 0.35, side === 'Right');
        }
    }

    updateView(delta, weapon) {
        const reload = weapon.isReloading ? weapon.reloadProgress || 0 : 0;
        const bolt = weapon.boltActive ? weapon.boltProgress : 0;
        // These grips are defined in weapon space, so camera movement needs no new IK solve.
        if (this.lastReload === reload && this.lastBolt === bolt) return;
        this.lastReload = reload;
        this.lastBolt = bolt;
        this.reset();
        this.poseHands(weapon.weaponGroup, {
            reload,
            bolt,
        });
    }

    update(delta, state = {}) {
        this.reset();
        this.time += delta;
        const speed = state.speed || 0;
        const slide = state.isSliding ? 1 : 0;
        const sprint = state.isSprinting ? 1 : 0;
        const grounded = state.isGrounded !== false;
        this.state = slide ? 'slide' : !grounded ? (state.verticalVelocity > 0 ? 'jump' : 'fall') : speed < 0.4 ? 'idle' : sprint ? 'sprint' : 'run';
        this.slideBlend = THREE.MathUtils.damp(this.slideBlend, slide, 18, delta);
        this.sprintBlend = THREE.MathUtils.damp(this.sprintBlend, sprint, 10, delta);
        this.moveBlend = THREE.MathUtils.damp(this.moveBlend, speed > 0.4 && grounded ? 1 : 0, 12, delta);
        this.phase += delta * Math.min(speed, 12) * 2.5;
        const hips = this.bones.Hips;
        const bounce = Math.abs(Math.sin(this.phase)) * 0.035 * this.moveBlend * (1 - this.slideBlend);
        hips.position.y += (-0.035 - 0.64 * this.slideBlend + bounce) * this.unitsPerMeter;
        this.rotate('Spine', 0.10 * this.sprintBlend - 0.2 * this.slideBlend);
        this.rotate('Spine1', 0.08 * this.sprintBlend - 0.15 * this.slideBlend);
        this.rotate('Head', 0, Math.sin(this.time * 0.7) * 0.025 * (1 - this.moveBlend));
        this.object.updateMatrixWorld(true);
        const worldRotation = this.object.getWorldQuaternion(new THREE.Quaternion());
        for (let i = 0; i < 2; i++) {
            const side = i === 0 ? 'Left' : 'Right';
            const cycle = this.phase + i * Math.PI;
            const stride = Math.sin(cycle) * (0.19 + this.sprintBlend * 0.12) * this.moveBlend;
            const lift = Math.max(0, Math.cos(cycle)) * 0.13 * this.moveBlend;
            const foot = new THREE.Vector3(i === 0 ? 0.15 : -0.15, 0.12 + lift, stride - 0.03);
            foot.lerp(new THREE.Vector3(i === 0 ? 0.18 : -0.16, 0.12, i === 0 ? 0.55 : 0.30), this.slideBlend);
            if (!grounded) foot.set(i === 0 ? 0.15 : -0.15, 0.30, i === 0 ? 0.13 : -0.12);
            const pole = this.object.localToWorld(new THREE.Vector3(i === 0 ? 0.2 : -0.2, 0.55, 1));
            this.solveIK(this.bones[`${side}UpLeg`], this.bones[`${side}Leg`], this.bones[`${side}Foot`], this.object.localToWorld(foot), pole);
            this.setWorldRotation(this.bones[`${side}Foot`], worldRotation.clone().multiply(this.footRotation[side]));
        }
        if (this.rifle) {
            this.rifle.position.set(-0.10, 1.38 - 0.64 * this.slideBlend + bounce, 0.20);
            this.rifle.quaternion.setFromAxisAngle(axisY, Math.PI);
            this.rifle.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(axisX, (state.aimPitch || 0) + this.sprintBlend * 0.35));
            this.poseHands(this.rifle, { reload: state.reloadProgress || 0, bolt: state.boltProgress || 0 });
        }
        this.object.updateMatrixWorld(true);
    }

    attachRifle(rifle) {
        this.rifle = rifle;
        rifle.scale.setScalar(0.85);
        this.object.add(rifle);
        this.update(0);
    }
}
