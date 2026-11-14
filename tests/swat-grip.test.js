import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { instantiateSwatRig, LEFT_GRIP, RIGHT_GRIP } from '../src/models/SwatRig.js';
import { emptyPose } from '../src/studio/PoseLibrary.js';
import { sampleViewAction } from '../src/models/ViewActions.js';
import { samplePistolHold } from '../src/models/PistolHold.js';
import { solveHandContact } from '../src/studio/HandContact.js';
import {setCharacterEyeView,characterEyePosition,lookThroughCharacter} from '../src/models/SharedEyeView.js';

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

test('eye view hides head triangles and restores the exact full mesh without changing the shared pose',()=>{
 const rig=instantiateSwatRig(gltf.scene.getObjectByName('SWAT_Body'));
 const meshes=[];rig.object.traverse(mesh=>{if(mesh.isSkinnedMesh)meshes.push({mesh,geometry:mesh.geometry,count:mesh.geometry.index.count});});
 const before=[...rig.rest.keys()].map(b=>({p:b.position.toArray(),q:b.quaternion.toArray()}));
 setCharacterEyeView(rig,true);
 assert.ok(meshes.some(({mesh,count})=>mesh.geometry.index.count<count));
 const first=meshes.map(({mesh})=>mesh.geometry);
 setCharacterEyeView(rig,true);assert.deepEqual(meshes.map(({mesh})=>mesh.geometry),first);
 const camera=new THREE.PerspectiveCamera(85,1,.02,30);lookThroughCharacter(camera,rig);
 assert.ok(camera.position.distanceTo(characterEyePosition(rig))<1e-6);
 assert.ok(camera.getWorldDirection(new THREE.Vector3()).distanceTo(new THREE.Vector3(0,0,1))<1e-6);
 setCharacterEyeView(rig,false);for(const{mesh,geometry}of meshes)assert.equal(mesh.geometry,geometry);
 assert.deepEqual([...rig.rest.keys()].map(b=>({p:b.position.toArray(),q:b.quaternion.toArray()})),before);
});

test('marked palm contact meets a reachable gun point, follows weapon transforms and preserves wrist direction and arm lengths', () => {
    const { rig, reference } = makeViewRig();
    rig.reset(); rig.poseHands(reference);
    const hand=rig.bones.LeftHand,point=[0,4,0],rotation=hand.getWorldQuaternion(new THREE.Quaternion());
    const palm=hand.localToWorld(new THREE.Vector3().fromArray(point));
    const desired=palm.clone().add(new THREE.Vector3(.015,-.01,.02));
    const contact={weaponPoint:reference.worldToLocal(desired.clone()).toArray(),palmPoint:point};
    const lengths=['LeftForeArm','LeftHand'].map(name=>rig.bones[name].position.length());
    const miss=solveHandContact(rig,'Left',contact,reference);
    assert.ok(miss<.001,`gap ${miss}`);
    assert.ok(rotation.angleTo(hand.getWorldQuaternion(new THREE.Quaternion()))<1e-6);
    reference.position.set(.08,-.02,.01);reference.rotation.y=.12;reference.updateMatrixWorld(true);
    assert.ok(solveHandContact(rig,'Left',contact,reference)<.001);
    assert.deepEqual(['LeftForeArm','LeftHand'].map(name=>rig.bones[name].position.length()),lengths);
    const far={weaponPoint:[0,2,0],palmPoint:point};
    assert.ok(solveHandContact(rig,'Left',far,reference)>1,'unreachable contact reports the remaining gap');
    assert.deepEqual(['LeftForeArm','LeftHand'].map(name=>rig.bones[name].position.length()),lengths);
});

test('downloaded pistol grip reaches both wrists without stretching and leaves aiming and saved data intact', () => {
    const pack = JSON.parse(readFileSync(new URL('../public/assets/animations/pistol-hold.json', import.meta.url)));
    const { rig, reference } = makeViewRig();
    const custom = emptyPose(); custom.Right.fingers.Index[1] = .1;
    const before = JSON.stringify(custom);
    for (const time of [0, .2, .5, .8]) {
        const hold = samplePistolHold(pack, time);
        rig.reset(); rig.poseHands(reference, { pose: 'pistol', custom, pistolHold: hold });
        for (const side of ['Left', 'Right']) {
            assert.ok(rig.bones[side + 'Hand'].getWorldPosition(new THREE.Vector3()).distanceTo(hold.hands[side].position) < .005);
            for (const [bone, rest] of rig.rest) {
                if (!/Arm/.test(bone.name)) assert.ok(Math.abs(bone.position.length() - rest.position.length()) < 1e-6);
                assert.ok(bone.quaternion.toArray().every(Number.isFinite));
            }
        }
    }
    rig.reset(); rig.poseHands(reference, { pose: 'pistol', custom });
    const aim = [...rig.rest.keys()].map(b => b.quaternion.toArray());
    rig.reset(); rig.poseHands(reference, { pose: 'pistol', custom, pistolHold: samplePistolHold(pack, .3, 0) });
    assert.deepEqual([...rig.rest.keys()].map(b => b.quaternion.toArray()), aim);
    assert.equal(JSON.stringify(custom), before);
});

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

test('guided elbow direction changes the bend while retaining the hand target and bone lengths',()=>{
 const {rig,reference}=makeViewRig(),custom=emptyPose();rig.reset();rig.poseHands(reference,{custom});
 const elbow=rig.bones.LeftForeArm.getWorldPosition(new THREE.Vector3());custom.Left.elbowTarget=[.3,.1,0];rig.reset();rig.poseHands(reference,{custom});
 assert.ok(rig.bones.LeftForeArm.getWorldPosition(new THREE.Vector3()).distanceTo(elbow)>.005);
 assert.ok(rig.bones.LeftHand.getWorldPosition(new THREE.Vector3()).distanceTo(LEFT_GRIP)<.005);
 for(const part of ['ForeArm','Hand'])assert.ok(Math.abs(rig.bones['Left'+part].position.length()-rig.rest.get(rig.bones['Left'+part]).position.length())<1e-6);
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

test('loaded hand overrides apply immediately even when startup cached the same weapon and revision',()=>{
 const {rig,reference}=makeViewRig();
 const weapon={activeSlot:'primary',weaponGroup:reference,poseRevision:1,adsProgress:0};
 let solves=0;const original=rig.poseHands.bind(rig);rig.poseHands=(...args)=>{solves++;return original(...args);};
 rig.updateView(0,weapon);const initial=rig.bones.LeftHand.quaternion.clone();
 weapon.poseOverrides=emptyPose();weapon.poseOverrides.Left.rotation=[0,.8,.09];
 rig.updateView(0,weapon);const applied=rig.bones.LeftHand.quaternion.clone();assert.ok(initial.angleTo(applied)>.3);
 assert.equal(solves,2);rig.updateView(0,weapon);assert.equal(solves,2,'unchanged holding pose still uses the cache');
 rig.lastPose='pistol';rig.updateView(0,weapon);assert.ok(rig.bones.LeftHand.quaternion.angleTo(applied)<1e-7,'switching back must match the first loaded pose');
});


test('throwable grip remains attached through windup and release despite different authored item offsets',async()=>{
 const {Throwables}=await import('../src/weapons/Throwables.js');
 const {createGrenadeModel,applyGrenadePlacement}=await import('../src/models/GrenadeModel.js');
 const {throwableMotion}=await import('../src/models/ThrowableMotion.js');
 const {rig,reference}=makeViewRig(),model=createGrenadeModel('frag');reference.add(model);
 const custom=emptyPose();custom.item={position:[-.14,-.04,-.11],rotation:[0,.2,0]};
 rig.reset();rig.poseHands(reference,{pose:'grenade',custom});applyGrenadePlacement(model,0,'high',custom);
 const equipment={held:{model},pending:null,weapon:{armsRig:rig,weaponGroup:reference}};
 Throwables.prototype.syncGrip.call(equipment);const anchor=equipment.held.gripAnchor.clone();
 equipment.pending={mode:'high'};
 for(const mode of ['high','low'])for(const t of [.05,.25,.45,.55,.9,1]){
  rig.reset();rig.poseHands(reference,{pose:'throw',throwProgress:t,throwMode:mode,custom});
  applyGrenadePlacement(model,t,mode,{item:{position:[0,0,0],rotation:[0,0,0]}});
  Throwables.prototype.syncGrip.call(equipment);
  const actual=rig.bones.RightHand.matrixWorld.clone().invert().multiply(model.matrixWorld);
  assert.ok(actual.elements.every((n,i)=>Math.abs(n-anchor.elements[i])<1e-6));
 }
 assert.ok(throwableMotion(.55).open>.9,'fingers open after release');
 assert.ok(throwableMotion(.25,'high').offset.y>0&&throwableMotion(.25,'low').offset.y<0);
});


test('Militia frag wind-up preserves limb lengths, leg poses, and the palm attachment',async()=>{
 const {createGrenadeModel}=await import('../src/models/GrenadeModel.js');
 const {poseThrowableBody}=await import('../src/models/ThrowableMotion.js');
 const {measurePalm,palmWorldPosition}=await import('../src/models/PalmGripFrames.js');
 const rig=instantiateSwatRig(gltf.scene.getObjectByName('SWAT_Body')),model=createGrenadeModel('frag');
 rig.attachAnimatedModel(model,'grenade','frag');
 const lengths={};for(const side of ['Right','Left'])for(const part of ['ForeArm','Hand'])lengths[side+part]=rig.bones[side+part].position.length();
 let anchor;
 for(const p of [0,.12,.25,.35,.46,.6,.8,1]){
  rig.reset();const legs=['Hips','LeftUpLeg','LeftLeg','RightUpLeg','RightLeg'].map(n=>rig.bones[n].quaternion.toArray());
  poseThrowableBody(rig,{throwProgress:p,throwMode:'high'});rig.placeModelInHand(model,rig.grenadeGrip(model),'grenade');
  assert.deepEqual(['Hips','LeftUpLeg','LeftLeg','RightUpLeg','RightLeg'].map(n=>rig.bones[n].quaternion.toArray()),legs);
  for(const[name,length]of Object.entries(lengths))assert.ok(Math.abs(rig.bones[name].position.length()-length)<1e-6);
  const hand=rig.bones.RightHand,relative=hand.matrixWorld.clone().invert().multiply(model.matrixWorld);
  anchor??=relative.clone();assert.ok(relative.elements.every((n,i)=>Math.abs(n-anchor.elements[i])<.003),`p=${p}; relative error=${Math.max(...relative.elements.map((n,i)=>Math.abs(n-anchor.elements[i])))}`);
  const palm=measurePalm(rig,'Right'),distance=palmWorldPosition(palm).distanceTo(model.getWorldPosition(new THREE.Vector3()));
  assert.ok(Math.abs(distance-.052)<.004,`grenade meets palm: ${distance}`);
 }
});


test('flash and smoke share frag arm motion with palm-calibrated canister grips',async()=>{
 const {createGrenadeModel}=await import('../src/models/GrenadeModel.js');
 const {poseThrowableBody}=await import('../src/models/ThrowableMotion.js');
 const {measurePalm,palmWorldPosition}=await import('../src/models/PalmGripFrames.js');
 const poses=new Map();
 for(const type of ['frag','flash','smoke']){
  const rig=instantiateSwatRig(gltf.scene.getObjectByName('SWAT_Body')),model=createGrenadeModel(type);rig.attachAnimatedModel(model,'grenade',type);
  for(const p of [0,.25,.46,.7,1]){
   rig.reset();poseThrowableBody(rig,{throwProgress:p,throwMode:'high'});rig.placeModelInHand(model,rig.grenadeGrip(model),'grenade');
   const pose=['RightArm','RightForeArm','RightHand','LeftArm','LeftForeArm','LeftHand'].flatMap(n=>rig.bones[n].quaternion.toArray());
   if(type==='frag')poses.set(p,pose);else assert.deepEqual(pose,poses.get(p));
   const distance=palmWorldPosition(measurePalm(rig,'Right')).distanceTo(model.getWorldPosition(new THREE.Vector3()));
   assert.ok(Math.abs(distance-(type==='frag'?.052:.036))<.004);
  }
 }
});


test('pistol holding keeps real palms on the grip and sleeve backs facing upward',async()=>{
 const {pistolGripFrame}=await import('../src/models/PistolGrip.js');
 const {measurePalm,palmWorldPosition}=await import('../src/models/PalmGripFrames.js');
 const {rig,reference}=makeViewRig(),model=new THREE.Group();model.scale.setScalar(1.2);reference.add(model);
 for(const lift of [0,.06]){
  reference.position.y=lift;rig.reset();rig.poseHands(reference,{pose:'pistol',contactModel:model});
  for(const side of ['Left','Right']){
   const sample=pistolGripFrame(rig,side).sample,point=model.localToWorld(new THREE.Vector3(side==='Right'?.0175:-.044,-.038,side==='Right'?.016:.008));
   assert.ok(palmWorldPosition(sample).distanceTo(point)<.006,'palm meets the pistol surface');
   const hand=rig.bones[side+'Hand'],lower=rig.bones[side+'ForeArm'];
   const dorsal=sample.normal.clone().negate().applyQuaternion(rig.rest.get(hand).quaternion).applyQuaternion(lower.getWorldQuaternion(new THREE.Quaternion()));
   const axis=hand.getWorldPosition(new THREE.Vector3()).sub(lower.getWorldPosition(new THREE.Vector3())).normalize(),up=new THREE.Vector3(0,1,0);up.addScaledVector(axis,-up.dot(axis)).normalize();dorsal.addScaledVector(axis,-dorsal.dot(axis)).normalize();
   assert.ok(dorsal.dot(up)>.99,'sleeve equipment stays on the upper side');
  }
 }
});

test('pistol reload keeps the trigger palm attached while the support hand moves',async()=>{
 const {pistolGripFrame}=await import('../src/models/PistolGrip.js');
 const {palmWorldPosition}=await import('../src/models/PalmGripFrames.js');
 const {sequenceMotion,defaultReloadSequence,sampleReloadSequence,addTimelinePose}=await import('../src/studio/ReloadTimeline.js');
 const {emptyLibrary}=await import('../src/studio/PoseLibrary.js');
 const {rig,reference}=makeViewRig(),model=new THREE.Group();reference.add(model);
 const base=emptyLibrary().poses['pistol:hip'],sequence=defaultReloadSequence(),left=[];
 for(const progress of [.01,.2,.4,.6,.8,.99]){
  rig.reset();const sample=sampleReloadSequence(sequence,progress*sequence.duration);
  rig.poseHands(reference,{pose:'pistol',reload:progress,contactModel:model,custom:addTimelinePose(base,sample.pose),motion:sequenceMotion(progress)});
  const point=model.localToWorld(new THREE.Vector3(.0175,-.038,.016));
  assert.ok(palmWorldPosition(pistolGripFrame(rig,'Right').sample).distanceTo(point)<.006,`trigger grip at ${progress}`);
  left.push(rig.bones.LeftHand.getWorldPosition(new THREE.Vector3()));
 }
 assert.ok(left.some(point=>point.distanceTo(left[0])>.05),'magazine hand retains reload travel');
});
