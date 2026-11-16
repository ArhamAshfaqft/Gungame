import {pistolGripFrame,fitPistolPalm,orientPistolSleeve} from './PistolGrip.js';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { ShooterAnimator, loadShooterPack, loadPistolPack } from './ShooterAnimator.js';
import { readLibrary, POSE_STORAGE_KEY } from '../studio/PoseLibrary.js';
import {fitWeaponReach} from './WeaponGripFit.js';
import { applyBodyLean } from './BodyLean.js';
import { samplePeekPose,applyPeekHands,applyPistolReady,applyCrouchedRiflePeek } from '../studio/PeekPoses.js';
import {ASSAULT_LEFT_GRIP,ASSAULT_RIGHT_GRIP} from './AssaultRifleModel.js';
import {solveHandContact} from '../studio/HandContact.js';
import {measurePalm,bindPalmGripFrames,fitPalmGrip,keepPalmTargetsReachable,palmWorldPosition,prepareM4HoldingArms,isM4StandingIdle,preferredElbow,referenceArmFrames} from './PalmGripFrames.js';

import {throwableHandTargets,throwableMotion,poseThrowableBody,firstPersonThrowSample} from './ThrowableMotion.js';
let assetPromise;
const normalizeName = name => name.replace(/^mixamorig[:_]?/i, '').replace(/_\d+$/, '');
const axisX = new THREE.Vector3(1, 0, 0);
const axisY = new THREE.Vector3(0, 1, 0);

// Both views use the same rifle-space grip locations and the same skinned gloves.
export const RIGHT_GRIP = new THREE.Vector3(0.048, -0.14, 0.16);
export const LEFT_GRIP = new THREE.Vector3(-0.085, -0.055, -0.26);
export const BODY_SUPPORT_GRIP = new THREE.Vector3(-0.085, -0.055, -0.18);
const handBasis = (x, y, z) => new THREE.Quaternion().setFromRotationMatrix(
    new THREE.Matrix4().makeBasis(new THREE.Vector3(...x), new THREE.Vector3(...y), new THREE.Vector3(...z)));
const gripRotation = {
    Right: handBasis([0, 0, 1], [0, 1, 0], [-1, 0, 0]),
    Left: handBasis([0, 0, 1], [1, 0, 0], [0, 1, 0]),
};

export function handTargets({ pose = 'rifle', throwProgress = 0, pinProgress = 0, throwMode = 'high' } = {}) {
    const Left = LEFT_GRIP.clone(), Right = RIGHT_GRIP.clone();
    if(pose==='assault'){Left.copy(ASSAULT_LEFT_GRIP);Right.copy(ASSAULT_RIGHT_GRIP);}
    if (pose === 'pistol') { Right.set(0.035, -0.12, 0.025); Left.set(-0.045, -0.075, 0.11); }
    if (pose === 'throw' || pose === 'grenade') return throwableHandTargets(pose === 'throw' ? throwProgress : 0,pinProgress,throwMode);
    return { Left, Right };
}

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
    const rig = instantiateSwatRig(armsOnly ? asset.arms : asset.body, armsOnly);
    if (!armsOnly) {
        const refresh = () => { const saved = readLibrary(); rig.thirdPersonPlacements = saved.thirdPerson; rig.thirdPersonGrips = saved.thirdPersonGrips; rig.thirdPersonRightGrips = saved.thirdPersonRightGrips; rig.peekPoses=saved.peekPoses; };
        window.addEventListener('storage', event => { if (event.key === POSE_STORAGE_KEY || event.key === null) refresh(); });
        window.addEventListener('focus', refresh);
        document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
        document.addEventListener('pointerlockchange', () => { if (document.pointerLockElement) refresh(); });
        try {
            const [rifle, pistol] = await Promise.all([loadShooterPack(), loadPistolPack()]);
            rig.animator = new ShooterAnimator(rig, { ...rifle, clips: [...rifle.clips, ...pistol.clips] });
            // Calibrate against the glove while the character loads, not at the
            // first grenade selection in a running match.
            for(const type of ['frag','flash','smoke']){rig.reset();rig.animatedSlot=type;poseThrowableBody(rig,{throwProgress:0,pinProgress:0});rig.grenadeGrip({scale:new THREE.Vector3(1,1,1)});}
            rig.reset();rig.animatedSlot=undefined;
        }
        catch (error) { console.warn('Using procedural movement while the animation pack is unavailable.', error); }
    }
    return rig;
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
        this.peekPoses=readLibrary().peekPoses;
        this.thirdPersonPlacements = readLibrary().thirdPerson;
        this.thirdPersonGrips = readLibrary().thirdPersonGrips;
        this.thirdPersonRightGrips = readLibrary().thirdPersonRightGrips;
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

    curlFingers(side, amount = 1, trigger = false, overrides = null) {
        for (const finger of ['Index', 'Middle', 'Ring', 'Pinky']) {
            for (let joint = 1; joint <= 3; joint++) {
                const curl = trigger && finger === 'Index' ? [0.22, 0.42, 0.35][joint - 1] : [0.65, 1.05, 0.7][joint - 1];
                this.rotate(`${side}Hand${finger}${joint}`, curl * amount + (overrides?.[finger]?.[joint - 1] || 0));
            }
        }
        this.rotate(`${side}HandThumb1`, 0.25, side === 'Left' ? -0.4 : 0.4, side === 'Left' ? 0.2 : -0.2);
        this.rotate(`${side}HandThumb2`, 0.35);
        this.rotate(`${side}HandThumb3`, 0.45);
        for (let joint = 1; joint <= 3; joint++) this.rotate(`${side}HandThumb${joint}`, overrides?.Thumb?.[joint - 1] || 0);
    }

    alignForearmTwist(side, handRotation, stable = false) {
        const forearm = this.bones[`${side}ForeArm`];
        const hand = this.bones[`${side}Hand`];
        const current = forearm.getWorldQuaternion(new THREE.Quaternion());
        const axis = hand.position.clone().normalize().applyQuaternion(current);
        // Recover the forearm frame implied by the desired wrist and the bind-pose wrist offset.
        const desired = handRotation.clone().multiply(this.rest.get(hand).quaternion.clone().invert());
        const project = vector => vector.addScaledVector(axis, -vector.dot(axis)).normalize();
        const transverse=stable&&Math.abs(hand.position.clone().normalize().dot(axisX))>.8?new THREE.Vector3(0,0,1):axisX;
        const from = project(transverse.clone().applyQuaternion(current));
        const to = project(transverse.clone().applyQuaternion(desired));
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
        const upperTransverse=stable&&Math.abs(forearm.position.clone().normalize().dot(axisX))>.8?new THREE.Vector3(0,0,1):axisX;
        const upperFrom = upperProject(upperTransverse.clone().applyQuaternion(upperRotation));
        const upperTo = upperProject(upperTransverse.clone().applyQuaternion(upperDesired));
        const roll = Math.atan2(upperAxis.dot(upperFrom.clone().cross(upperTo)),
            THREE.MathUtils.clamp(upperFrom.dot(upperTo), -1, 1));
        upperRotation.premultiply(new THREE.Quaternion().setFromAxisAngle(upperAxis, roll));
        this.setWorldRotation(upper, upperRotation);
        this.setWorldRotation(forearm, current);
    }

    poseHands(reference, { reload = 0, bolt = 0, pose = 'rifle', throwProgress = 0, pinProgress = 0, throwMode = 'high', custom = null, motion = null, pistolHold = null, contactModel = null } = {}) {
        this.object.updateMatrixWorld(true);
        reference.updateWorldMatrix(true, false);
        const { Left: left, Right: right } = handTargets({ pose, throwProgress, pinProgress, throwMode });
        const sharedThrow=this.armsOnly&&pose==='throw'&&throwMode!=='low'&&throwProgress>0?firstPersonThrowSample(throwProgress):null;
        const limbLength=side=>this.bones[side+'Arm'].getWorldPosition(new THREE.Vector3()).distanceTo(this.bones[side+'ForeArm'].getWorldPosition(new THREE.Vector3()))+this.bones[side+'ForeArm'].getWorldPosition(new THREE.Vector3()).distanceTo(this.bones[side+'Hand'].getWorldPosition(new THREE.Vector3()));
        const throwReach=sharedThrow?limbLength('Right'):0;
        if(sharedThrow){
            right.set(.035,-.12,.025).addScaledVector(sharedThrow.offset,throwReach);
            right.y+=.16*sharedThrow.weight;
            // Keep the cocked hand beside the eye, ahead of the near plane.
            right.x+=.12*sharedThrow.weight;right.z-=.22*sharedThrow.weight;
            left.set(-.18,-.23,.12).addScaledVector(firstPersonThrowSample(throwProgress,'Left').offset,limbLength('Left')*.45);
        }
        const rotations = { ...gripRotation };
        if (pose === 'pistol') {
            rotations.Left = handBasis([0, -1, 0], [0, 0, -1], [1, 0, 0]);
        }
        // The support hand goes to the magazine; the trigger hand cycles the bolt.
        const reloadReach = motion?.id.endsWith('Reload') ? 0 : Math.sin(THREE.MathUtils.clamp(reload, 0, 1) * Math.PI);
        if (pose === 'pistol') rotations.Left.slerp(gripRotation.Left, reloadReach);
        left.lerp(new THREE.Vector3(-0.025, -0.23, 0.035), reloadReach);
        right.add(new THREE.Vector3(0.065, 0.045, -0.04).multiplyScalar(Math.sin(bolt * Math.PI)));
        for (const side of ['Left', 'Right']) {
            const imported = pose === 'pistol' ? pistolHold?.hands[side] : null;
            const importedWeight = imported ? pistolHold.weight : 0;
            if (this.armsOnly) {
                // Place the shoulder behind the lower frame instead of stretching the bones to reach the rifle.
                const shoulder = side === 'Left' ? new THREE.Vector3(-0.28, -0.34, 0.04) : new THREE.Vector3(0.30, -0.36, 0.26);
                const upper = this.bones[`${side}Arm`];
                if (custom) shoulder.add(new THREE.Vector3().fromArray(custom[side].shoulder));
                if(side==='Right'&&sharedThrow){
                    // Let the shoulder rise with the overhand wind-up. A fixed
                    // rifle shoulder clamps the wrist below eye level in IK.
                    shoulder.addScaledVector(sharedThrow.offset,throwReach*.35);
                    shoulder.y+=.22*sharedThrow.weight;
                }
                if(side==='Right'&&pose==='throw'&&!sharedThrow)shoulder.add(throwableMotion(throwProgress,throwMode).offset);
                const world = reference.localToWorld(shoulder);
                upper.position.copy(upper.parent.worldToLocal(world));
                upper.updateMatrixWorld(true);
            }
            const grip = (side === 'Left' ? left : right).clone();
            if (imported) grip.lerp(imported.position, importedWeight);
            if (custom) grip.add(new THREE.Vector3().fromArray(custom[side].position));
            if(side==='Left'&&pose==='grenade'&&custom?.item)grip.add(new THREE.Vector3().fromArray(custom.item.position).multiplyScalar(Math.sin(Math.PI*pinProgress)));
            if (motion) grip.add(motion.hands[side].position);
            const target = reference.localToWorld(grip);
            const pole = this.armsOnly
                ? reference.localToWorld(new THREE.Vector3(side === 'Left' ? -0.6 : 0.5, -0.6, 0.05))
                : this.object.localToWorld(new THREE.Vector3(side === 'Left' ? 0.65 : -0.65, 1.03, 0.16));
            if (imported) pole.lerp(reference.localToWorld(imported.elbow.clone()), importedWeight);
            if(sharedThrow&&side==='Right')pole.lerp(this.bones.RightArm.getWorldPosition(new THREE.Vector3()).addScaledVector(sharedThrow.pole.clone().applyQuaternion(reference.getWorldQuaternion(new THREE.Quaternion())),throwReach),sharedThrow.weight);
            // Throwable elbow targets participate in IK. Keep existing firearm pose behavior.
            if (custom && (pose === 'grenade' || pose === 'throw')) pole.add(new THREE.Vector3().fromArray(custom[side].elbow).applyQuaternion(reference.getWorldQuaternion(new THREE.Quaternion())));
            if(custom?.[side].elbowTarget)pole.add(new THREE.Vector3().fromArray(custom[side].elbowTarget).applyQuaternion(reference.getWorldQuaternion(new THREE.Quaternion())));
            this.solveIK(this.bones[`${side}Arm`], this.bones[`${side}ForeArm`], this.bones[`${side}Hand`], target, pole);
            const pistolContact=this.armsOnly&&pose==='pistol'&&contactModel&&((!reload&&(!motion||/Fire$/.test(motion.id)))||(side==='Right'&&motion?.id==='pistolReload'));
            const localRotation = pistolContact?pistolGripFrame(this,side).rotation.clone():rotations[side].clone();
            if (imported&&!pistolContact) localRotation.slerp(imported.rotation, importedWeight);
            const rotation = reference.getWorldQuaternion(new THREE.Quaternion()).multiply(localRotation);
            if (motion) {
                const animated = reference.getWorldQuaternion(new THREE.Quaternion()).multiply(motion.hands[side].rotation).multiply(localRotation);
                rotation.copy(animated);
            }
            if (custom) {
                rotation.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(...custom[side].rotation)));
            }
            if(sharedThrow&&side==='Right'){
                const frame=reference.getWorldQuaternion(new THREE.Quaternion());
                rotation.premultiply(frame.clone().multiply(sharedThrow.rotation).multiply(frame.invert()));
            }
            if(pistolContact){
                const offset=new THREE.Vector3().fromArray(custom?.[side].position||[0,0,0]).applyQuaternion(reference.getWorldQuaternion(new THREE.Quaternion()));
                fitPistolPalm(this,side,contactModel,pole,rotation,offset);
            }
            this.alignForearmTwist(side, rotation, !!pistolContact);
            if(pistolContact)orientPistolSleeve(this,side,reference);
            this.setWorldRotation(this.bones[`${side}Hand`], rotation);
            const throwable=pose==='throw'||pose==='grenade';
            const grasp=throwable?(side==='Right'?.78*(1-throwableMotion(throwProgress,throwMode).open):.24+.4*Math.sin(Math.PI*pinProgress)):1-reloadReach*.35;
            this.curlFingers(side,grasp,!throwable&&side==='Right',custom?.[side].fingers);
            if (imported&&!pistolContact) for (const [name, quaternion] of Object.entries(imported.fingers)) {
                const bone = this.bones[`${side}Hand${name}`];
                const finger = name.slice(0, -1), joint = Number(name.slice(-1)) - 1;
                const offset = custom?.[side].fingers[finger]?.[joint] || 0;
                const target = quaternion.clone().multiply(new THREE.Quaternion().setFromAxisAngle(axisX, offset));
                bone.quaternion.slerp(target, importedWeight);
            }
            if (motion?.coordinated && side === 'Left') {
                // Preserve thumb volume while closing the grasp around the magazine.
                this.rotate('LeftHandThumb1', 0, 0, -0.12 * motion.contact);
            }
            // Artist joint offsets run after IK and automatic twist distribution. Hand-only
            // rotation must never feed back into the forearm or upper-arm orientation.
            for (const [field, joint] of [['shoulderRotation', 'Arm'], ['elbowRotation', 'ForeArm'], ['handRotation', 'Hand']]) {
                const offset = custom?.[side]?.[field];
                if (offset) this.rotate(`${side}${joint}`, ...offset);
            }
            this.bones[`${side}Arm`].updateMatrixWorld(true);
            if(custom?.[side].thumbRotation)this.rotate(`${side}HandThumb1`,...custom[side].thumbRotation);
            this.contactMiss??={};
            this.contactMiss[side]=!reload&&(!motion||/Fire$/.test(motion.id))?solveHandContact(this,side,custom?.[side].contact,contactModel):null;
        }
    }

    updateView(delta, weapon) {
        const reload = weapon.isReloading ? weapon.reloadProgress || 0 : 0;
        const bolt = weapon.boltActive ? weapon.boltProgress : 0;
        const pose = weapon.utilityTimer > 0 ? 'throw' : weapon.grenadeEquipped ? 'grenade' : weapon.activeSlot === 'pistol' ? 'pistol' : weapon.activeSlot==='assault'?'assault':'rifle';
        const pinProgress = weapon.pinProgress || 0;
        const throwMode = weapon.throwMode || 'high';
        const throwProgress = weapon.throwProgress || 0;
        // These grips are defined in weapon space, so camera movement needs no new IK solve.
        const revision = weapon.poseRevision || 0;
        const aimBlend = weapon.adsProgress || 0;
        const fireState=!!weapon.overrideFire;
        const motionKey = weapon.viewMotion ? `${weapon.viewMotion.id}:${weapon.viewMotion.progress}` : '';
        const holdKey = weapon.pistolHold?.key || '';
        const customPose = weapon.grenadeEquipped ? weapon.grenadePoseOverrides : weapon.utilityTimer > 0 ? null : weapon.reloadPoseOverrides || weapon.poseOverrides;
        if (holdKey !== this.lastHoldKey) this.lastRevision = -1;
        this.lastHoldKey = holdKey;
        if (this.lastCustomPose===customPose && this.lastViewEditStamp===weapon.viewEditStamp && this.lastFireState === fireState && this.lastReload === reload && this.lastBolt === bolt && this.lastPose === pose && this.lastThrow === throwProgress && this.lastPin === pinProgress && this.lastMode === throwMode && this.lastRevision === revision && this.lastAimBlend === aimBlend && this.lastMotionKey === motionKey) return;
        this.lastCustomPose=customPose;
        this.lastViewEditStamp=weapon.viewEditStamp;
        this.lastFireState=fireState;
        this.lastMotionKey = motionKey;
        this.lastMode = throwMode;
        this.lastPin = pinProgress;
        this.lastRevision = revision;
        this.lastAimBlend = aimBlend;
        this.lastReload = reload;
        this.lastBolt = bolt;
        this.lastPose = pose;
        this.lastThrow = throwProgress;
        this.reset();
        this.poseHands(weapon.weaponGroup, {
            reload,
            bolt,
            pose,
            throwProgress,
            pinProgress,
            throwMode,
            custom: customPose,
            motion: weapon.viewMotion,
            pistolHold: weapon.pistolHold,
            contactModel: weapon.grenadeEquipped ? weapon.equipment?.held?.model : weapon.activeSlot==='pistol'?weapon.pistolModel:weapon.activeSlot==='assault'?weapon.assaultModel:weapon.rifleModel,
        });
    }

    update(delta, state = {}) {
        if (this.animator && !state.isSliding) {
            this.animator.update(delta, state);
            if(this.hitKick?.remaining>0){this.hitKick.remaining=Math.max(0,this.hitKick.remaining-delta);this.rotate(this.hitKick.bone,-(this.hitKick.pitch??1)*this.hitKick.amount*this.hitKick.remaining/.22,0,this.hitKick.side*this.hitKick.amount*.4*this.hitKick.remaining/.22);}
            if (state.legsOnly) this.object.updateMatrixWorld(true);
            // Animator captures the transition pose before procedural lean/IK.
            // Capturing again here would bake the lean into the next blend and apply it twice.
            else {this.finishAnimatedPose({...state,delta,actionActive:this.animator.actionRemaining>0});}
            return;
        }
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
        applyBodyLean(this,state);
        const heldModel = this.animatedModel || this.rifle;
        if (heldModel) {
            heldModel.position.set(-0.10, 1.38 - 0.64 * this.slideBlend + bounce, 0.20);
            heldModel.quaternion.setFromAxisAngle(axisY, Math.PI);
            heldModel.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(axisX, (state.aimPitch || 0) + this.sprintBlend * 0.35));
            this.poseHands(heldModel, { pose: this.animatedKind === 'pistol' ? 'pistol' : this.animatedKind === 'grenade' ? 'grenade' : 'rifle', reload: state.reloadProgress || 0, bolt: state.boltProgress || 0 });
        }
        this.object.updateMatrixWorld(true);
    }

    attachRifle(rifle) {
        this.rifle = rifle;
        rifle.scale.setScalar(0.85);
        this.object.add(rifle);
        this.update(0);
    }

    attachAnimatedModel(model, kind = 'rifle', slot = kind === 'rifle' ? 'primary' : kind === 'grenade' ? 'frag' : kind) {
        if (this.animatedKind !== kind && this.animator) { this.animator.actionRemaining = 0; this.animator.wasCrouching = undefined; }
        if (this.animatedModel && this.animatedModel !== model) this.animatedModel.visible = false;
        this.animatedModel = model; this.animatedKind = kind;
        this.animatedSlot = slot;
        if (model.parent !== this.object) this.object.add(model);
        model.visible = true;
    }

    placeModelInHand(model, grip = RIGHT_GRIP, kind = 'rifle') {
        this.object.updateMatrixWorld(true);
        const hand = this.bones.RightHand;
        const rotation = hand.getWorldQuaternion(new THREE.Quaternion()).multiply(this.animationGrips?.[kind] || this.animationGrip || gripRotation.Right.clone().invert());
        const offset = grip.clone().multiply(model.scale).applyQuaternion(rotation);
        const position = hand.getWorldPosition(new THREE.Vector3()).sub(offset);
        model.position.copy(this.object.worldToLocal(position));
        model.quaternion.copy(this.object.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(rotation));
        model.updateMatrixWorld(true);
    }

    placeGuidedShoulder(side,guide,model){
        if(!guide?.shoulder?.some(n=>n!==0))return;
        const upper=this.bones[side+'Arm'],base=upper.position.clone(),position=upper.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3().fromArray(guide.shoulder).applyQuaternion(model.getWorldQuaternion(new THREE.Quaternion())));
        upper.position.copy(upper.parent.worldToLocal(position));upper.updateMatrixWorld(true);
        (this.guidedShoulderOffsets??=new Map()).set(side,{base,applied:upper.position.clone()});
    }
    guidedElbowPole(side,guide,model){
        const pole=this.object.localToWorld(new THREE.Vector3(side==='Left'?.65:-.65,1.03,.16));
        if(guide?.elbowTarget)pole.add(new THREE.Vector3().fromArray(guide.elbowTarget).applyQuaternion(model.getWorldQuaternion(new THREE.Quaternion())));
        return pole;
    }
    rotateGuidedArm(side,guide){
        for(const [field,joint] of [['shoulderRotation','Arm'],['elbowRotation','ForeArm']])if(guide?.[field]?.some(n=>n!==0))this.rotate(side+joint,...guide[field]);
        this.bones[side+'Arm'].updateMatrixWorld(true);
    }
    applyReferenceGripFingers(side,fit){
        for(const finger of ['Thumb','Index','Middle','Ring','Pinky'])for(let joint=1;joint<=3;joint++){
            const name=`${side}Hand${finger}${joint}`,authored=this.animator?.holdingPoses?.rifle?.get(name);
            if(authored)this.bones[name].quaternion.copy(authored);
            this.rotate(name,fit?.fingers?.[finger]?.[joint-1]||0);
        }
    }
    applyManualHandJoints(side,fit){
        if(!fit)return;
        for(const [field,joint] of [['shoulderRotation','Arm'],['elbowRotation','ForeArm'],['handRotation','Hand'],['thumbRotation','HandThumb1']])
            if(fit[field]?.some(n=>n!==0))this.rotate(side+joint,...fit[field]);
        const model=this.animatedModel||this.rifle;
        if(model&&fit.contact)solveHandContact(this,side,fit.contact,model);
    }
    grenadeGrip(model) {
        const type=this.animatedSlot||'frag';
        this.throwablePalmGrips??={};
        if(this.throwablePalmGrips[type])return this.throwablePalmGrips[type];
        const hand=this.bones.RightHand,sample=measurePalm(this,'Right');
        const handRotation=hand.getWorldQuaternion(new THREE.Quaternion());
        const modelRotation=handRotation.clone().multiply(this.animationGrip||gripRotation.Right.clone().invert());
        const center=hand.localToWorld(sample.point.clone()).addScaledVector(sample.normal.clone().applyQuaternion(handRotation),type==='frag'?.052:.036);
        this.fragPalmGrip=hand.getWorldPosition(new THREE.Vector3()).sub(center).applyQuaternion(modelRotation.invert()).divide(model.scale);
        this.throwablePalmGrips[type]=this.fragPalmGrip;
        return this.throwablePalmGrips[type];
    }

    finishAnimatedPose(state = {}) {
        state={...state,animationTime:this.animator?.actions.get(this.animator.current)?.time||0};
        if(this.captureStudioInput){
            this.studioInputState={...state};
            this.studioInputPose ||= new Map(Object.values(this.bones).map(bone=>[bone,{position:new THREE.Vector3(),rotation:new THREE.Quaternion()}]));
            for(const [bone,pose] of this.studioInputPose){pose.position.copy(bone.position);pose.rotation.copy(bone.quaternion);}
        }
        if(this.refinedPeek&&this.animatedKind==='rifle'&&!state.isReloading&&!state.isSliding&&!state.isSprinting&&state.isGrounded!==false&&!/reload|throw|hit/.test(this.animator.current||'')){
            const posture=/^rifle(StandToCrouch|CrouchToStand)$/.test(this.animator.current||'');
            const carryTransition=posture||state.isCrouching||(this.crouchCarryWeight||0)>.001;
            this.object.updateMatrixWorld(true);
            const root=this.object.getWorldQuaternion(new THREE.Quaternion());
            if(this.previousCarryTransition&&!carryTransition)this.standingCarryRelease=1;
            this.previousCarryTransition=carryTransition;
            if(!carryTransition&&this.standingCarryRelease>.001&&state.delta>0&&this.standingCarrySource){
                this.standingCarryRelease=THREE.MathUtils.damp(this.standingCarryRelease,0,8,state.delta);
                for(const [name,rotation]of this.standingCarrySource){
                    const bone=this.bones[name],current=bone.getWorldQuaternion(new THREE.Quaternion());
                    this.setWorldRotation(bone,current.slerp(root.clone().multiply(rotation),this.standingCarryRelease));
                }
            }else if(!carryTransition){
                this.standingCarrySource=new Map(Object.entries(this.bones).filter(([name])=>/^(Spine\d*|Neck|Head|LeftShoulder|RightShoulder|LeftArm|RightArm|LeftForeArm|RightForeArm|LeftHand.*|RightHand.*)$/.test(name)).map(([name,bone])=>[name,root.clone().invert().multiply(bone.getWorldQuaternion(new THREE.Quaternion()))]));
            }else if(carryTransition&&this.standingCarrySource){
                // Posture clips supply the legs and hips. Keep their unrelated
                // arm motion out of the blend between the two holding poses.
                for(const [name,rotation]of this.standingCarrySource)this.setWorldRotation(this.bones[name],root.clone().multiply(rotation));
            }
        }
        this.resolveAnimationPose?.(state);
        prepareM4HoldingArms(this,state);
        // Keep hand constraints through neutral: a lean threshold would switch
        // wrist/arm solvers midway through the camera's smooth return.
        const refinedRifleHolding=this.refinedPeek&&this.animatedKind==='rifle'&&!state.isReloading&&!/reload|throw|hit/.test(this.animator.current);
        const crouchedRiflePeek=applyCrouchedRiflePeek(this,state);
        const peek=samplePeekPose(this.peekPoses,this.animatedSlot || 'primary',state,this.peekTimelines);
        if(this.animatedKind==='pistol'&&state.isCrouching)applyPistolReady(this,state);
        applyBodyLean(this,{...state,lean:(state.lean||0)*(peek?.strength??1)});
        if(peek)for(const [bone,angles] of Object.entries(peek.body))this.rotate(bone,...angles);
        for(const [name,edit] of Object.entries(this.thirdPersonBody||{})){
            const bone=this.bones[name];if(!bone)continue;
            if(edit.position?.some(n=>n!==0))bone.position.add(new THREE.Vector3().fromArray(edit.position).divide(bone.parent.getWorldScale(new THREE.Vector3())));
            this.rotate(name,...edit.rotation);
        }
        if(peek?.bodyPosition)for(const [name,offset] of Object.entries(peek.bodyPosition)){
            const bone=this.bones[name];if(bone&&offset.some(n=>n!==0))bone.position.add(new THREE.Vector3().fromArray(offset).divide(bone.parent.getWorldScale(new THREE.Vector3())));
        }
        if(this.animatedKind==='grenade')poseThrowableBody(this,state);
        if (state.aimPitch) this.rotate('Spine2', -THREE.MathUtils.clamp(state.aimPitch, -0.8, 0.8) * 0.65);
        const model = this.animatedModel || this.rifle;
        if (model) {
            const kind = this.animatedModel ? this.animatedKind : 'rifle';
            const grip = kind === 'grenade' ? this.grenadeGrip(model)
                : kind === 'pistol' ? new THREE.Vector3(0.025, -0.09, 0.02) : model.userData.triggerGrip || RIGHT_GRIP;
            this.placeModelInHand(model, grip, kind);
            const m4Holding=this.animatedSlot==='assault'&&this.palmReferences?.rifle&&!state.isReloading&&!['reload','throw','hit'].includes(this.animator.current);
            if(crouchedRiflePeek||m4Holding){
                // Turn the complete arm chains together, keeping the authored wrist
                // bend intact while cancelling the crouch/lean's upward muzzle tilt.
                const forward=new THREE.Vector3(0,0,-1).applyQuaternion(model.getWorldQuaternion(new THREE.Quaternion()));
                const ads=THREE.MathUtils.clamp(state.adsProgress??(state.isAiming?1:0),0,1);
                const desired=new THREE.Vector3(0,-(isM4StandingIdle(this,state)?.035:m4Holding?.25:.12)*(1-ads),1).normalize().applyQuaternion(this.object.getWorldQuaternion(new THREE.Quaternion()));
                desired.applyAxisAngle(new THREE.Vector3(1,0,0).applyQuaternion(this.object.getWorldQuaternion(new THREE.Quaternion())),-(state.aimPitch||0));
                const correction=new THREE.Quaternion().setFromUnitVectors(forward,desired);
                if(refinedRifleHolding&&!m4Holding)correction.slerp(new THREE.Quaternion(),1-(this.crouchCarryWeight??1));
                for(const side of ['Right','Left']){
                    const shoulder=this.bones[side+'Shoulder'];
                    this.setWorldRotation(shoulder,correction.clone().multiply(shoulder.getWorldQuaternion(new THREE.Quaternion())));
                    shoulder.updateMatrixWorld(true);
                }
                this.placeModelInHand(model,grip,kind);
            }
            if(isM4StandingIdle(this,state)){
                // Relaxed upper-chest carry: the head stays above the sights.
                // Fade this local carry offset out as ADS raises the rifle.
                const ready=1-THREE.MathUtils.clamp(state.adsProgress??(state.isAiming?1:0),0,1);
                model.position.add(new THREE.Vector3(0,-.09,-.04).multiplyScalar(ready));
                model.updateMatrixWorld(true);
            }
            const originalRightPosition=this.bones.RightHand.getWorldPosition(new THREE.Vector3());
            const originalRightRotation=this.bones.RightHand.getWorldQuaternion(new THREE.Quaternion());
            const rightAnchor=model.worldToLocal(originalRightPosition.clone());
            const rightBasis=model.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(originalRightRotation);
            this.thirdPersonBase = { position: model.position.clone(), quaternion: model.quaternion.clone() };
            const slot = this.animatedModel ? this.animatedSlot : 'primary';
            const placement = this.thirdPersonPlacements?.[slot];
            if (placement) {
                model.position.add(new THREE.Vector3().fromArray(placement.position).applyQuaternion(this.thirdPersonBase.quaternion));
                model.quaternion.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(...placement.rotation)));
                model.updateMatrixWorld(true);
            }
            if(peek){
                model.position.add(new THREE.Vector3().fromArray(peek.weapon.position).applyQuaternion(this.thirdPersonBase.quaternion));
                model.quaternion.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(...peek.weapon.rotation)));
                model.updateMatrixWorld(true);
            }
            if(refinedRifleHolding){
                fitWeaponReach(this,model,rightAnchor,model.userData.supportGrip||BODY_SUPPORT_GRIP,this.thirdPersonRightGrips?.[slot],this.thirdPersonGrips?.[slot]);
            }
            // Solve the trigger hand after placing the weapon from its unmodified animation
            // anchor, so moving the hand does not drag the weapon along with it.
            const sharedM4Trigger=refinedRifleHolding&&slot==='primary'&&!!model.userData.assaultParts;
            const palmFrames=(slot==='assault'||sharedM4Trigger)&&kind==='rifle'?bindPalmGripFrames(this,model,{shared:sharedM4Trigger}):null;
            // Shared-M4 offsets were calibrated as wrist offsets for the sniper.
            // A measured palm contact must use the physical M4 handle instead.
            const savedRight=this.thirdPersonRightGrips?.[slot];
            const right=sharedM4Trigger?{...savedRight,position:[0,0,0],elbowTarget:[0,0,0],contact:null}:savedRight;
            this.palmGripAdjustment=palmFrames?keepPalmTargetsReachable(this,model,palmFrames,{Right:right,Left:this.thirdPersonGrips?.[slot]},!sharedM4Trigger&&state.handIK!==false&&this.poseSupportIK!==false&&!['reload','throw','hit'].includes(this.animator.current)):null;
            this.palmGripDiagnostics=null;
            const pinTrigger=this.pinTriggerToWeapon||refinedRifleHolding;
            const basePosition = pinTrigger ? model.localToWorld(rightAnchor) : originalRightPosition;
            const baseRotation = pinTrigger ? model.getWorldQuaternion(new THREE.Quaternion()).multiply(rightBasis) : originalRightRotation;
            this.rightGripBase = { position: basePosition.clone(), quaternion: baseRotation.clone() };
            if(palmFrames&&!right?.contact){
                this.placeGuidedShoulder('Right',right,model);
                this.applyReferenceGripFingers('Right',right);
                const solved=fitPalmGrip(this,model,'Right',palmFrames.Right,right,state);
                this.applyManualHandJoints('Right',right);
                this.rightGripTarget={position:solved.wrist,quaternion:solved.rotation};this.rightGripMiss=solved.error;
                this.palmGripDiagnostics={Right:solved};
            }else if (right) {
                this.placeGuidedShoulder('Right',right,model);
                const target = basePosition.clone().add(new THREE.Vector3().fromArray(right.position).applyQuaternion(model.getWorldQuaternion(new THREE.Quaternion())));
                const rotation = baseRotation.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(...right.rotation)));
                if (refinedRifleHolding||right.position.some(value => value !== 0)||(pinTrigger&&(placement?.position.some(n=>n!==0)||placement?.rotation.some(n=>n!==0)||peek?.weapon.position.some(n=>n!==0)||peek?.weapon.rotation.some(n=>n!==0)))||right.shoulder?.some(n=>n!==0)||right.elbowTarget?.some(n=>n!==0)) {
                    this.solveIK(this.bones.RightArm, this.bones.RightForeArm, this.bones.RightHand, target,
                        refinedRifleHolding?preferredElbow(this,'Right',target,rotation,right,state):this.guidedElbowPole('Right',right,model));
                }
                // Match the bent authored elbow frame, preserving the solved joint
                // positions and grip instead of concentrating axial roll at the sleeve.
                if(refinedRifleHolding)referenceArmFrames(this,'Right',rotation,state);
                this.setWorldRotation(this.bones.RightHand, rotation);
                for (const finger of ['Thumb', 'Index', 'Middle', 'Ring', 'Pinky']) for (let joint = 1; joint <= 3; joint++) this.rotate(`RightHand${finger}${joint}`, right.fingers[finger][joint - 1]);
                this.applyManualHandJoints('Right',right);
                this.bones.RightArm.updateMatrixWorld(true);
                this.rightGripTarget = { position: target, quaternion: rotation };
                this.rightGripMiss = this.bones.RightHand.getWorldPosition(new THREE.Vector3()).distanceTo(target);
            }
            const rifleSupport = kind === 'rifle' && state.handIK !== false && this.poseSupportIK !== false && !['reload', 'throw', 'hit'].includes(this.animator.current);
            if(rifleSupport&&palmFrames&&!sharedM4Trigger&&!this.thirdPersonGrips?.[slot]?.contact){
                const support=this.thirdPersonGrips?.[slot];
                this.placeGuidedShoulder('Left',support,model);this.applyReferenceGripFingers('Left',support);
                const solved=fitPalmGrip(this,model,'Left',palmFrames.Left,support,state);
                this.applyManualHandJoints('Left',support);
                this.supportGripTarget={position:solved.wrist,quaternion:solved.rotation};this.supportGripMiss=solved.error;
                this.supportGripBaseQuaternion=solved.rotation.clone();this.palmGripDiagnostics ||= {};this.palmGripDiagnostics.Left=solved;
            }else if (rifleSupport) {
                const support = this.thirdPersonGrips?.[slot];
                this.placeGuidedShoulder('Left',support,model);
                const local = (model.userData.supportGrip||BODY_SUPPORT_GRIP).clone();
                if (support) local.add(new THREE.Vector3().fromArray(support.position));
                const target = model.localToWorld(local);
                const standingPole=this.object.localToWorld(new THREE.Vector3(0.65,1.03,0.16));
                const crouchingPole=this.bones.LeftArm.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(.28,-.22,.18).applyQuaternion(this.object.getWorldQuaternion(new THREE.Quaternion())));
                const pole=refinedRifleHolding?standingPole.lerp(crouchingPole,this.crouchCarryWeight??(state.isCrouching?1:0)):(crouchedRiflePeek?crouchingPole:standingPole);
                if(support?.elbowTarget)pole.add(new THREE.Vector3().fromArray(support.elbowTarget).applyQuaternion(this.object.getWorldQuaternion(new THREE.Quaternion())));
                this.solveIK(this.bones.LeftArm, this.bones.LeftForeArm, this.bones.LeftHand, target, pole);
                const rotation = model.getWorldQuaternion(new THREE.Quaternion()).multiply(this.animationSupportGrips?.rifle || gripRotation.Left);
                this.supportGripBaseQuaternion = rotation.clone();
                if (support) rotation.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(...support.rotation)));
                this.supportGripTarget = { position: target.clone(), quaternion: rotation.clone() };
                // IK keeps the authored arm roll. Forcing the procedural wrist basis
                // through both arm bones spins the sleeve/brace and crushes the elbow.
                this.setWorldRotation(this.bones.LeftHand, rotation);
                // The imported wrist basis and its authored finger curl belong together.
                // A procedural curl uses different axes and can open/reverse this grasp.
                for(const finger of ['Thumb','Index','Middle','Ring','Pinky'])for(let joint=1;joint<=3;joint++){
                    const name=`LeftHand${finger}${joint}`,authored=this.animator.holdingPoses?.rifle?.get(name);
                    if(authored)this.bones[name].quaternion.copy(authored);
                    this.rotate(name,support?.fingers?.[finger]?.[joint-1]||0);
                }
                this.applyManualHandJoints('Left',support);
                this.bones.LeftArm.updateMatrixWorld(true);
                this.supportGripMiss = this.bones.LeftHand.getWorldPosition(new THREE.Vector3()).distanceTo(target);
            } else {
                // Other equipment and released-hand actions keep their authored hand motion.
                // Apply artist offsets to that moving anchor, instead of forcing a rifle grip.
                const support = this.thirdPersonGrips?.[slot];
                this.placeGuidedShoulder('Left',support,model);
                const basePosition = this.bones.LeftHand.getWorldPosition(new THREE.Vector3());
                const baseRotation = this.bones.LeftHand.getWorldQuaternion(new THREE.Quaternion());
                this.supportGripBasePosition = basePosition.clone();
                this.supportGripBaseQuaternion = baseRotation.clone();
                const target = basePosition.clone().add(new THREE.Vector3().fromArray(support?.position || [0, 0, 0]).applyQuaternion(model.getWorldQuaternion(new THREE.Quaternion())));
                if (support&&(support.position.some(value => value !== 0)||support.shoulder?.some(n=>n!==0)||support.elbowTarget?.some(n=>n!==0))) this.solveIK(this.bones.LeftArm, this.bones.LeftForeArm, this.bones.LeftHand, target,
                    this.guidedElbowPole('Left',support,model));
                const rotation = baseRotation.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(...(support?.rotation || [0, 0, 0]))));
                this.setWorldRotation(this.bones.LeftHand, rotation);
                if (support) for (const finger of ['Thumb', 'Index', 'Middle', 'Ring', 'Pinky']) for (let joint = 1; joint <= 3; joint++) this.rotate(`LeftHand${finger}${joint}`, support.fingers[finger][joint - 1]);
                this.applyManualHandJoints('Left',support);
                this.bones.LeftArm.updateMatrixWorld(true);
                this.supportGripTarget = { position: target, quaternion: rotation };
                this.supportGripMiss = this.bones.LeftHand.getWorldPosition(new THREE.Vector3()).distanceTo(target);
            }
            this.supportUsesWeaponTarget = rifleSupport;
            applyPeekHands(this,model,peek);
            if(palmFrames&&this.palmGripDiagnostics)for(const side of ['Left','Right']){
                const result=this.palmGripDiagnostics[side];if(!result)continue;
                result.actual=palmWorldPosition(palmFrames[side].sample);result.error=result.actual.distanceTo(result.point);
                if(side==='Left')this.supportGripMiss=result.error;else this.rightGripMiss=result.error;
            }
        }
        this.object.updateMatrixWorld(true);
    }
}
