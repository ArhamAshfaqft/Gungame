import {SkeletalRagdoll} from '../src/models/SkeletalRagdoll.js';
import {emptyPeekLibrary} from '../src/studio/PeekPoses.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { instantiateSwatRig, RIGHT_GRIP } from '../src/models/SwatRig.js';
import { ShooterAnimator, expandedRifleClip, locomotionClip, pistolLocomotionClip, equipmentClips } from '../src/models/ShooterAnimator.js';
import {emptyLibrary} from '../src/studio/PoseLibrary.js';
import {applyFullBodyPose,fullBodyPose} from '../src/studio/FullBodyPoses.js';
import {ensureAnimationEdit} from '../src/studio/AnimationEdits.js';

const pack = JSON.parse(readFileSync(new URL('../public/assets/animations/shooter-pack.json', import.meta.url)));
const pistolPack = JSON.parse(readFileSync(new URL('../public/assets/animations/pistol-pack.json', import.meta.url)));
const combined = { ...pack, clips: [...pack.clips, ...pistolPack.clips] };
const source = readFileSync(new URL('../public/assets/operators/swat.glb', import.meta.url));
const length = source.readUInt32LE(12), json = JSON.parse(source.subarray(20, 20 + length).toString());
json.materials = json.materials.map(material => ({ name: material.name }));
const text = Buffer.from(JSON.stringify(json)), padded = Buffer.alloc(Math.ceil(text.length / 4) * 4, 32); text.copy(padded);
const bin = source.subarray(20 + length), bytes = Buffer.alloc(20 + padded.length + bin.length);
bytes.writeUInt32LE(0x46546c67, 0); bytes.writeUInt32LE(2, 4); bytes.writeUInt32LE(bytes.length, 8);
bytes.writeUInt32LE(padded.length, 12); bytes.writeUInt32LE(0x4e4f534a, 16); padded.copy(bytes, 20); bin.copy(bytes, 20 + padded.length);
const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
function rig(animationPack = pack) {
    const rig = instantiateSwatRig(gltf.scene.getObjectByName('SWAT_Body'));
    rig.animator = new ShooterAnimator(rig, animationPack); return rig;
}

test('third-person rifle support keeps imported wrist and finger axes without rolling the sleeve after IK', () => {
    const r=rig(),model=new THREE.Group();r.object.add(model);
    r.attachAnimatedModel(model,'rifle','primary');
    const solve=r.solveIK.bind(r);let solved;
    r.solveIK=(upper,lower,...args)=>{
        solve(upper,lower,...args);
        if(upper===r.bones.LeftArm)solved=[upper.quaternion.clone(),lower.quaternion.clone()];
    };
    r.alignForearmTwist=()=>{throw Error('Procedural roll must not change imported rifle arms');};
    for(const clip of ['idle','runBack','walk']){
        r.animator.sample(clip,.1);r.finishAnimatedPose({isAiming:true,adsProgress:1});
        assert.deepEqual(r.bones.LeftArm.quaternion.toArray(),solved[0].toArray());
        assert.deepEqual(r.bones.LeftForeArm.quaternion.toArray(),solved[1].toArray());
        const relative=model.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(r.bones.LeftHand.getWorldQuaternion(new THREE.Quaternion()));
        assert.ok(relative.normalize().angleTo(r.animationSupportGrips.rifle.clone().normalize())<1e-6);
        for(const [name,q] of r.animator.holdingPoses.rifle)if(/^LeftHand(Thumb|Index|Middle|Ring|Pinky)/.test(name))assert.ok(r.bones[name].quaternion.clone().normalize().angleTo(q.clone().normalize())<1e-6);
    }
});

test('saved body, shoulder, forearm, wrist, thumb and finger controls reach the actual production skeleton',()=>{
    const r=rig(),model=new THREE.Group();r.object.add(model);r.attachAnimatedModel(model,'rifle','primary');
    r.animator.sample('idle',0);r.finishAnimatedPose({isAiming:true});
    const names=['Head','LeftArm','LeftForeArm','LeftHand','LeftHandThumb1','LeftHandIndex2'];
    const before=names.map(name=>r.bones[name].quaternion.clone());
    const lengths=['LeftForeArm','LeftHand'].map(name=>r.bones[name].position.length());
    const library=emptyLibrary(),edit=ensureAnimationEdit(library,'primary','idle','aim',fullBodyPose(library,'primary','aim'));
    edit.pose.body.Head.rotation[1]=.1;
    Object.assign(edit.pose.Left,{shoulder:[.005,0,0],elbowTarget:[0,-.03,0],shoulderRotation:[.05,0,0],elbowRotation:[.08,0,0],handRotation:[.06,0,0],thumbRotation:[0,.2,0]});
    edit.pose.Left.fingers.Index[1]=.2;
    r.animator.sample('idle',0);applyFullBodyPose(r,library,'primary',1,{clip:'idle'});r.finishAnimatedPose({isAiming:true});
    names.forEach((name,i)=>assert.ok(before[i].clone().normalize().angleTo(r.bones[name].quaternion.clone().normalize())>.001,name+' must respond'));
    assert.deepEqual(['LeftForeArm','LeftHand'].map(name=>r.bones[name].position.length()),lengths);
});

test('all sixteen runtime clips have valid keys and mapped bones without horizontal root motion', () => {
    const r = rig(); assert.equal(pack.clips.length, 16); assert.equal(new Set(pack.clips.map(c => c.id)).size, 16);
    for (const clip of pack.clips) {
        assert.ok(clip.duration > 0 && clip.tracks.length > 0);
        for (const track of clip.tracks) {
            assert.ok(r.bones[track.bone], `${clip.id}: missing bone ${track.bone}`);
            const size = track.property === 'quaternion' ? 4 : 3;
            assert.equal(track.values.length, track.times.length * size);
            assert.ok([...track.times, ...track.values].every(Number.isFinite));
            assert.ok(track.times.every((time, i) => time >= 0 && time <= clip.duration + 0.00001 && (i === 0 || time > track.times[i - 1])));
            for (let i = 0; i < track.values.length; i += size) {
                if (size === 4) assert.ok(Math.abs(new THREE.Quaternion().fromArray(track.values, i).length() - 1) < 0.00001);
                else { assert.equal(track.values[i], track.values[0]); assert.equal(track.values[i + 2], track.values[2]); }
            }
        }
    }
    assert.ok(pack.clips.find(c => c.id === 'strafeLeft').sourceRootDelta[0] < 0);
    assert.ok(pack.clips.find(c => c.id === 'strafeRight').sourceRootDelta[0] > 0);
});

test('directional movement selects forward, backward, strafe, sprint and jump clips', () => {
    assert.equal(locomotionClip({ speed: 0 }), 'idle');
    assert.equal(locomotionClip({ speed: 2, forward: -1 }), 'walkBack');
    assert.equal(locomotionClip({ speed: 5, forward: 1 }), 'run');
    assert.equal(locomotionClip({ speed: 2, forward: 0, lateral: -1 }), 'strafeLeft');
    assert.equal(locomotionClip({ speed: 5, forward: 0, lateral: 1 }), 'strafeRunRight');
    assert.equal(locomotionClip({ speed: 2, isGrounded: false }), 'jump');
});

test('every clip samples on the actual character without changing root placement or bone lengths', () => {
    const r = rig(); r.object.position.set(4, 2, -3); r.object.rotation.y = 0.8;
    const lengths = new Map(Object.values(r.bones).map(bone => [bone, bone.position.length()]));
    for (const clip of pack.clips) for (const phase of [0, 0.5, 1]) {
        r.animator.sample(clip.id, clip.duration * phase); r.object.updateMatrixWorld(true);
        assert.deepEqual(r.object.position.toArray(), [4, 2, -3]); assert.equal(r.object.rotation.y, 0.8);
        for (const bone of Object.values(r.bones)) {
            assert.ok(bone.matrixWorld.elements.every(Number.isFinite), `${clip.id} invalid bone transform`);
            if (bone !== r.bones.Hips) assert.ok(Math.abs(bone.position.length() - lengths.get(bone)) < 0.00001);
        }
    }
});

test('weapon follows the trigger hand with calibrated forward orientation', () => {
    const r = rig(), rifle = new THREE.Group(); rifle.scale.setScalar(0.85); r.attachAnimatedModel(rifle);
    r.animator.sample('idle', 0); r.finishAnimatedPose();
    assert.ok(rifle.localToWorld(RIGHT_GRIP.clone()).distanceTo(r.bones.RightHand.getWorldPosition(new THREE.Vector3())) < 0.00001);
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(rifle.getWorldQuaternion(new THREE.Quaternion()));
    assert.ok(forward.z > 0.99);
});

test('hit reaction finishes and locomotion resumes with a bounded crossfade', () => {
    const r = rig(); r.update(0.1, { speed: 2 }); assert.equal(r.animator.current, 'walk');
    r.animator.trigger('hit'); r.update(0.15, { speed: 2 }); assert.equal(r.animator.current, 'hit');
    r.update(0.5, { speed: 2 }); assert.equal(r.animator.current, 'walk');
    for (const id of ['idle', 'run', 'reload', 'walkBack', 'fire']) r.animator.play(id);
    assert.ok([...r.animator.actions.values()].filter(action => action.isRunning()).length <= 2);
});

test('twenty pistol clips bind and sample with no root drift, stretch or invalid keys', () => {
    const r = rig(combined); assert.equal(pistolPack.clips.length, 20);
    assert.equal(new Set(combined.clips.map(c => c.id)).size, 36);
    for (const clip of pistolPack.clips) {
        for (const track of clip.tracks) {
            assert.ok(r.bones[track.bone]); assert.ok([...track.values, ...track.times].every(Number.isFinite));
            if (track.property === 'position') for (let i = 0; i < track.values.length; i += 3) {
                assert.equal(track.values[i], track.values[0]); assert.equal(track.values[i + 2], track.values[2]);
            }
        }
        for (const phase of [0, 0.5, 1]) {
            r.animator.sample(clip.id, phase * clip.duration); r.object.updateMatrixWorld(true);
            assert.deepEqual(r.object.position.toArray(), [0, 0, 0]);
            for (const bone of Object.values(r.bones)) {
                assert.ok(bone.matrixWorld.elements.every(Number.isFinite));
                if (bone !== r.bones.Hips) assert.ok(Math.abs(bone.position.length() - r.rest.get(bone).position.length()) < 0.00001);
            }
        }
    }
});

test('pistol movement chooses its own idle, arcs, strafes, jumps and kneeling states', () => {
    assert.equal(pistolLocomotionClip({ speed: 0 }), 'pistolIdle');
    assert.equal(pistolLocomotionClip({ speed: 2, forward: -1, lateral: -0.4 }), 'pistolWalkBackArcLeft');
    assert.equal(pistolLocomotionClip({ speed: 5, forward: 1, lateral: 0.3 }), 'pistolRunArcRight');
    assert.equal(pistolLocomotionClip({ speed: 2, forward: 0, lateral: 1 }), 'pistolStrafeRight');
    assert.equal(pistolLocomotionClip({ speed: 0, isCrouching: true }), 'pistolKneelIdle');
    assert.equal(pistolLocomotionClip({ speed: 3, isGrounded: false }), 'pistolJumpForward');
    const r = rig(combined); r.attachAnimatedModel(new THREE.Group(), 'pistol');
    r.update(0.05, { speed: 2 }); assert.equal(r.animator.current, 'pistolWalk');
    r.update(0.05, { speed: 0, isCrouching: true }); assert.equal(r.animator.current, 'pistolStandToKneel');
    r.update(1.2, { speed: 0, isCrouching: true }); assert.equal(r.animator.current, 'pistolKneelIdle');
    r.update(0.05, { speed: 0, isCrouching: false }); assert.equal(r.animator.current, 'pistolKneelToStand');
});

test('equipment catalogs keep pistol, rifle and grenade animations separate', () => {
    assert.equal(equipmentClips(combined, 'pistol').length, 20);
    assert.equal(equipmentClips(combined, 'rifle').length, 16);
    assert.deepEqual(equipmentClips(combined, 'grenade').map(c => c.id), ['throw']);
    assert.ok(equipmentClips(combined, 'pistol').every(c => c.id.startsWith('pistol')));
    assert.ok(equipmentClips(combined, 'pistol').every(c => !['fire', 'reload'].includes(c.id)));
});

test('pistol attachment uses its own calibrated hand basis and keeps the grip on the wrist', () => {
    const r = rig(combined), pistol = new THREE.Group(); pistol.scale.setScalar(1.2);
    r.attachAnimatedModel(pistol, 'pistol'); r.animator.sample('pistolIdle', 0); r.finishAnimatedPose();
    const grip = new THREE.Vector3(0.025, -0.09, 0.02);
    assert.ok(pistol.localToWorld(grip).distanceTo(r.bones.RightHand.getWorldPosition(new THREE.Vector3())) < 0.00001);
    assert.ok(new THREE.Vector3(0, 0, -1).applyQuaternion(pistol.getWorldQuaternion(new THREE.Quaternion())).z > 0.99);
    assert.ok(r.animationGrips.pistol.angleTo(r.animationGrips.rifle) > 0.01);
});

test('saved third-person weapon offsets change only the weapon relative to its animated hand', () => {
    const r = rig(combined), model = new THREE.Group(); model.scale.setScalar(1.2);
    r.attachAnimatedModel(model, 'pistol'); r.animator.sample('pistolIdle', 0.4); r.finishAnimatedPose();
    const before = r.bones.RightHand.getWorldPosition(new THREE.Vector3());
    const rotation = r.bones.RightHand.getWorldQuaternion(new THREE.Quaternion());
    const base = model.position.clone(), baseRotation = model.quaternion.clone();
    r.thirdPersonPlacements.pistol = { position: [0.02, -0.05, 0], rotation: [0, 0, 0.3] };
    r.animator.sample('pistolIdle', 0.4); r.finishAnimatedPose();
    assert.ok(model.position.distanceTo(base.add(new THREE.Vector3(0.02, -0.05, 0).applyQuaternion(baseRotation))) < 0.00001);
    assert.ok(model.quaternion.angleTo(baseRotation) > 0.29);
    assert.ok(r.bones.RightHand.getWorldPosition(new THREE.Vector3()).distanceTo(before) < 0.00001);
    assert.ok(r.bones.RightHand.getWorldQuaternion(new THREE.Quaternion()).normalize().angleTo(rotation.clone().normalize()) < 0.00001);
});

test('support-hand correction follows the weapon without moving the weapon or trigger hand', () => {
    const r = rig(), rifle = new THREE.Group(); rifle.scale.setScalar(0.85); r.attachAnimatedModel(rifle);
    for (const id of ['idle', 'walk', 'run']) {
        r.thirdPersonGrips.primary.position = [0, 0, 0];
        r.animator.sample(id, 0.2); r.finishAnimatedPose();
        const model = rifle.matrixWorld.elements.slice();
        const right = r.bones.RightHand.matrixWorld.elements.slice();
        r.thirdPersonGrips.primary.position = [0.01, 0.015, 0];
        r.animator.sample(id, 0.2); r.finishAnimatedPose();
        assert.deepEqual(rifle.matrixWorld.elements, model); assert.deepEqual(r.bones.RightHand.matrixWorld.elements, right);
        const miss = r.bones.LeftHand.getWorldPosition(new THREE.Vector3()).distanceTo(r.supportGripTarget.position);
        assert.ok(miss < 0.005, `${id} support target miss: ${miss}`);
    }
});

test('support finger curls are deterministic and do not accumulate over sampled animation frames', () => {
    const r = rig(), rifle = new THREE.Group(); r.attachAnimatedModel(rifle);
    r.thirdPersonGrips.primary.fingers.Index[1] = 0.3;
    r.animator.sample('idle', 0.3); r.finishAnimatedPose();
    const before = r.bones.LeftHandIndex2.quaternion.toArray();
    for (let i = 0; i < 20; i++) { r.animator.sample('idle', 0.3); r.finishAnimatedPose(); }
    assert.deepEqual(r.bones.LeftHandIndex2.quaternion.toArray(), before);
});

test('trigger-hand corrections leave weapon and support hand fixed and do not stretch arm bones', () => {
    const r = rig(), model = new THREE.Group(); model.scale.setScalar(0.85); r.attachAnimatedModel(model);
    r.animator.sample('idle', 0.3); r.finishAnimatedPose();
    const gun = model.matrixWorld.elements.slice(), left = r.bones.LeftHand.matrixWorld.elements.slice();
    const right = r.bones.RightHand.getWorldPosition(new THREE.Vector3());
    const length = r.bones.RightForeArm.position.length();
    r.thirdPersonRightGrips.primary.position = [0, -0.01, 0];
    r.thirdPersonRightGrips.primary.rotation = [0.1, 0, 0];
    r.thirdPersonRightGrips.primary.fingers.Index[1] = 0.2;
    r.animator.sample('idle', 0.3); r.finishAnimatedPose();
    assert.deepEqual(model.matrixWorld.elements, gun);
    assert.deepEqual(r.bones.LeftHand.matrixWorld.elements, left);
    assert.ok(r.bones.RightHand.getWorldPosition(new THREE.Vector3()).distanceTo(right) > 0.009);
    assert.ok(r.rightGripMiss < 0.005); assert.equal(r.bones.RightForeArm.position.length(), length);
    const curl = r.bones.RightHandIndex2.quaternion.toArray();
    r.animator.sample('idle', 0.3); r.finishAnimatedPose();
    assert.deepEqual(r.bones.RightHandIndex2.quaternion.toArray(), curl);
});

test('left hand adjusts independently on pistols and grenades, including action clips', () => {
    for (const [kind, slot, clip] of [['pistol', 'pistol', 'pistolIdle'], ['grenade', 'flash', 'throw'], ['rifle', 'primary', 'reload']]) {
        const r = rig(combined), model = new THREE.Group(); r.attachAnimatedModel(model, kind, slot);
        r.animator.sample(clip, 0.3); r.finishAnimatedPose();
        const left = r.bones.LeftHand.getWorldPosition(new THREE.Vector3());
        const gun = model.matrixWorld.elements.slice(), right = r.bones.RightHand.matrixWorld.elements.slice();
        const length = r.bones.LeftForeArm.position.length();
        r.thirdPersonGrips[slot].position = [0, -0.01, 0];
        r.thirdPersonGrips[slot].rotation = [0.1, 0, 0];
        r.thirdPersonGrips[slot].fingers.Index[1] = 0.2;
        r.animator.sample(clip, 0.3); r.finishAnimatedPose();
        assert.ok(r.bones.LeftHand.getWorldPosition(new THREE.Vector3()).distanceTo(left) > 0.009, `${slot}: left hand did not move`);
        assert.deepEqual(model.matrixWorld.elements, gun); assert.deepEqual(r.bones.RightHand.matrixWorld.elements, right);
        assert.equal(r.bones.LeftForeArm.position.length(), length);
        assert.ok(r.supportGripMiss < 0.005);
        const finger = r.bones.LeftHandIndex2.quaternion.toArray();
        r.animator.sample(clip, 0.3); r.finishAnimatedPose();
        assert.deepEqual(r.bones.LeftHandIndex2.quaternion.toArray(), finger);
    }
});

test('normal tactical running selects source run strides rather than sped-up walks',()=>{
 assert.equal(locomotionClip({speed:3.2,forward:1}),'run');
 assert.equal(locomotionClip({speed:3.2,forward:0,lateral:-1}),'strafeRunLeft');
 assert.equal(locomotionClip({speed:3.2,forward:0,lateral:1}),'strafeRunRight');
 assert.equal(locomotionClip({speed:1.35,forward:0,lateral:-1}),'strafeLeft');
});
test('weapon holding layer steadies the arms while preserving the current authored leg pose',()=>{
 const r=rig(combined),reference=rig(combined);
 for(let n=0;n<60;n++)r.update(1/60,{equipment:'rifle',speed:3.2,forward:0,lateral:-3.2,isGrounded:true});
 const a=r.animator,action=a.actions.get(a.current);reference.animator.sample(a.current,action.time);
 const idle=a.holdingPoses.rifle.get('RightArm');
 assert.ok(r.bones.RightArm.quaternion.angleTo(idle)<reference.bones.RightArm.quaternion.angleTo(idle));
 for(const name of ['LeftUpLeg','RightUpLeg','LeftLeg','RightLeg'])assert.ok(r.bones[name].quaternion.angleTo(reference.bones[name].quaternion)<.001);
 const old=a.holdingBlend;r.update(.1,{equipment:'rifle',speed:5,isSprinting:true});assert.ok(a.holdingBlend<old);
});

test('additional rifle run retargets cleanly and is used for non-ADS without overriding aimed movement',()=>{
 const extra=JSON.parse(readFileSync(new URL('../public/assets/animations/rifle-run-pack.json',import.meta.url)));
 const r=rig({...combined,clips:[...combined.clips,...extra.clips]});
 assert.equal(extra.clips.length,1);assert.ok(extra.clips[0].tracks.length>40);
 for(const track of extra.clips[0].tracks){assert.ok(r.bones[track.bone]);assert.ok(track.values.every(Number.isFinite));}
 for(let n=0;n<60;n++)r.update(1/60,{equipment:'rifle',speed:3.2,forward:1,isAiming:false,isGrounded:true});
 assert.equal(r.animator.current,'rifleRunReady');assert.ok(r.animator.aimBlend<.01);
 for(let n=0;n<60;n++)r.update(1/60,{equipment:'rifle',speed:1.8,forward:1,isAiming:true,isGrounded:true});
 assert.equal(r.animator.current,'walk');assert.ok(r.animator.aimBlend>.99);
 for(const bone of Object.values(r.bones))assert.ok(bone.matrixWorld.elements.every(Number.isFinite));
});

test('downloaded rifle expansion binds in place, maps measured directions and provides crouch at rest',()=>{
 const extra=JSON.parse(readFileSync(new URL('../public/assets/animations/rifle-expansion-pack.json',import.meta.url)));
 const run=JSON.parse(readFileSync(new URL('../public/assets/animations/rifle-run-pack.json',import.meta.url)));
 const r=rig({...combined,clips:[...combined.clips,...run.clips,...extra.clips]});assert.equal(extra.clips.length,22);
 const lengths=new Map(Object.entries(r.bones).filter(([n])=>n!=='Hips').map(([n,b])=>[n,b.position.length()]));
 for(const clip of extra.clips){for(const track of clip.tracks){assert.ok(r.bones[track.bone]);assert.ok([...track.times,...track.values].every(Number.isFinite));if(track.property==='position')for(let i=0;i<track.values.length;i+=3){assert.equal(track.values[i],track.values[0]);assert.equal(track.values[i+2],track.values[2])}}
  for(const phase of [0,.5,.999]){r.animator.sample(clip.id,clip.duration*phase);r.object.updateMatrixWorld(true);for(const [n,length] of lengths)assert.ok(Math.abs(r.bones[n].position.length()-length)<1e-4);}
  if(/Left$/.test(clip.id))assert.ok(clip.sourceRootDelta[0]<0,clip.id);if(/Right$/.test(clip.id))assert.ok(clip.sourceRootDelta[0]>0,clip.id);
 }
 const states=[[{speed:3,forward:1,lateral:-1},'rifleRunForwardLeft'],[{speed:3,forward:-1,lateral:1},'rifleRunBackwardRight'],[{speed:1.6,isCrouching:true,forward:0,lateral:-1},'rifleCrouchLeft'],[{speed:0,isCrouching:true},'rifleCrouchIdle'],[{speed:0},'rifleReadyIdle']];
 for(const [state,expected] of states)assert.equal(expandedRifleClip(state,r.animator.clips),expected);
 r.animator.sample('idle',0);const standing=r.bones.Hips.position.y;r.animator.sample('rifleCrouchIdle',0);assert.ok(r.bones.Hips.position.y<standing-10,'crouch stays lowered at rest');
});


test('stationary crouch aim correction does not accumulate on constant mixer tracks',()=>{
 const extra=JSON.parse(readFileSync(new URL('../public/assets/animations/rifle-expansion-pack.json',import.meta.url)));
 const r=rig({...combined,clips:[...combined.clips,...extra.clips.filter(clip=>clip.id!=='rifleCrouchIdle')]});
 const state={equipment:'rifle',speed:0,isCrouching:true,isGrounded:true,aimPitch:.5};
 for(let i=0;i<60;i++)r.update(1/60,state);
 const before=r.bones.Head.getWorldQuaternion(new THREE.Quaternion());
 for(let i=0;i<300;i++)r.update(1/60,state);
 assert.ok(before.angleTo(r.bones.Head.getWorldQuaternion(new THREE.Quaternion()))<.001,'stationary head orientation must not spin over time');
});


test('new crouch walks select forward and diagonals while sideways and backward keep their own clips',()=>{
 const extra=JSON.parse(readFileSync(new URL('../public/assets/animations/rifle-expansion-pack.json',import.meta.url)));
 const available=new Set(extra.clips.map(c=>c.id));
 const crouch=(forward,lateral)=>expandedRifleClip({isCrouching:true,isGrounded:true,speed:1.6,forward,lateral},available);
 assert.equal(crouch(1,0),'rifleCrouchWalk');assert.equal(crouch(1,-1),'rifleCrouchWalkForwardLeft');assert.equal(crouch(1,1),'rifleCrouchWalkForwardRight');
 assert.equal(crouch(0,-1),'rifleCrouchLeft');assert.equal(crouch(-1,0),'rifleCrouchBack');
});


test('interrupted transitions preserve the displayed pose and finish with a bounded action count',()=>{
 const r=rig(combined),a=r.animator;
 for(let i=0;i<30;i++)r.update(1/60,{speed:2,forward:1,isGrounded:true});
 a.play('strafeLeft',{fade:.3});r.update(.04,{clip:'strafeLeft',speed:2,isGrounded:true});
 const shown=r.bones.LeftUpLeg.quaternion.clone(),hips=r.bones.Hips.position.clone();
 a.play('walkBack',{fade:.28});r.update(0,{clip:'walkBack',speed:2,isGrounded:true});
 assert.ok(shown.angleTo(r.bones.LeftUpLeg.quaternion)<1e-5,'interrupted fade must begin at the shown leg pose');assert.ok(hips.distanceTo(r.bones.Hips.position)<1e-5);
 for(let i=0;i<40;i++)r.update(1/60,{clip:'walkBack',speed:2,isGrounded:true});
 assert.equal(a.transition,null);assert.ok([...a.actions.values()].filter(action=>action.isRunning()).length<=2);
});
test('authored crouch idle and reversible posture transitions are bound, interruptible and do not modify sources',()=>{
 const extra=JSON.parse(readFileSync(new URL('../public/assets/animations/rifle-expansion-pack.json',import.meta.url))),before=JSON.stringify(extra);
 const r=rig({...combined,clips:[...combined.clips,...extra.clips]}),a=r.animator;
 assert.equal(a.pack.clips.find(c=>c.id==='rifleCrouchIdle').sourceFile,'Idle Crouching.fbx');
 for(let i=0;i<30;i++)r.update(1/60,{speed:0,isCrouching:false,isGrounded:true});
 r.update(1/60,{speed:0,isCrouching:true,isGrounded:true});assert.equal(a.current,'rifleStandToCrouch');
 for(let i=0;i<60;i++)r.update(1/60,{speed:0,isCrouching:true,isGrounded:true});assert.equal(a.current,'rifleCrouchIdle');
 r.update(1/60,{speed:0,isCrouching:false,isGrounded:true});assert.equal(a.current,'rifleCrouchToStand');
 r.update(1/60,{speed:2,isCrouching:false,isGrounded:true});assert.notEqual(a.current,'rifleCrouchToStand');
 assert.equal(JSON.stringify(extra),before);
});

test('transition bones interpolate during the fade rather than holding then snapping at its end',()=>{
 const r=rig(combined),a=r.animator;
 for(let i=0;i<30;i++)r.update(1/60,{speed:0,equipment:'rifle'});
 const old=r.bones.LeftUpLeg.quaternion.clone();a.play('run',{fade:.4});
 r.update(.1,{clip:'run',speed:3});r.update(.1,{clip:'run',speed:3});
 assert.ok(a.transition);assert.ok(old.angleTo(r.bones.LeftUpLeg.quaternion)>.001,'leg must already be interpolating before the fade completes');
});

test('composed pistol crouch preserves footwork, fits a pistol torso, and leaves sources intact',()=>{
 const extra=JSON.parse(readFileSync(new URL('../public/assets/animations/rifle-expansion-pack.json',import.meta.url))),before=JSON.stringify(extra);
 const r=rig({...combined,clips:[...combined.clips,...extra.clips]}),a=r.animator;
 assert.equal(a.pack.clips.filter(c=>c.composedFrom).length,10);
 const source=a.pack.clips.find(c=>c.id==='rifleCrouchWalk'),composed=a.pack.clips.find(c=>c.id==='pistolCrouchWalk');
 assert.deepEqual(composed.tracks.filter(t=>t.bone==='Hips'||/^(Left|Right)(UpLeg|Leg|Foot|ToeBase)/.test(t.bone)),source.tracks.filter(t=>t.bone==='Hips'||/^(Left|Right)(UpLeg|Leg|Foot|ToeBase)/.test(t.bone)));
 a.sample('pistolIdle',0);r.object.updateMatrixWorld(true);const reference=r.bones.Spine.getWorldQuaternion(new THREE.Quaternion());
 a.sample('pistolCrouchWalk',0);r.object.updateMatrixWorld(true);assert.ok(reference.angleTo(r.bones.Spine.getWorldQuaternion(new THREE.Quaternion()))<.001);
 for(const id of a.pack.clips.filter(c=>c.composedFrom).map(c=>c.id))for(const phase of [0,.5,.999]){a.sample(id,a.clips.get(id).duration*phase);r.object.updateMatrixWorld(true);for(const bone of Object.values(r.bones))assert.ok(bone.matrixWorld.elements.every(Number.isFinite));}
 assert.equal(JSON.stringify(extra),before);
});
test('pistol crouching selects movement instead of stationary kneeling and exits posture actions on motion',()=>{
 const extra=JSON.parse(readFileSync(new URL('../public/assets/animations/rifle-expansion-pack.json',import.meta.url)));
 const r=rig({...combined,clips:[...combined.clips,...extra.clips]}),a=r.animator;
 const states=[[{speed:0},'pistolCrouchIdle'],[{speed:1.6,forward:1},'pistolCrouchWalk'],[{speed:1.6,forward:-1},'pistolCrouchBack'],[{speed:1.6,forward:0,lateral:-1},'pistolCrouchLeft'],[{speed:1.6,forward:0,lateral:1},'pistolCrouchRight'],[{speed:1.6,forward:1,lateral:-1},'pistolCrouchForwardLeft'],[{speed:1.6,forward:1,lateral:1},'pistolCrouchForwardRight']];
 for(const [state,id] of states){for(let i=0;i<75;i++)r.update(1/60,{equipment:'pistol',isCrouching:true,isGrounded:true,forward:0,lateral:0,...state});assert.equal(a.current,id);}
 r.update(1/60,{equipment:'pistol',speed:0,isCrouching:false,isGrounded:true});assert.equal(a.current,'pistolCrouchToStand');
 r.update(1/60,{equipment:'pistol',speed:2,forward:1,isCrouching:false,isGrounded:true});assert.notEqual(a.current,'pistolCrouchToStand');
 const contacts=JSON.parse(readFileSync(new URL('../public/assets/animations/foot-contacts.json',import.meta.url)));assert.deepEqual(contacts.clips.pistolCrouchWalk,contacts.clips.rifleCrouchWalk);
});

test('Shift crouch running uses a different forward clip for both rifle and pistol',()=>{
 const extra=JSON.parse(readFileSync(new URL('../public/assets/animations/rifle-expansion-pack.json',import.meta.url))),r=rig({...combined,clips:[...combined.clips,...extra.clips]});
 for(const equipment of ['rifle','pistol']){
  for(let i=0;i<75;i++)r.update(1/60,{equipment,isCrouching:true,isGrounded:true,speed:1.6,forward:1});
  assert.equal(r.animator.current,equipment==='pistol'?'pistolCrouchWalk':'rifleCrouchWalk');
  for(let i=0;i<75;i++)r.update(1/60,{equipment,isCrouching:true,isCrouchRunning:true,isGrounded:true,speed:2.8,forward:1});
  assert.equal(r.animator.current,equipment==='pistol'?'pistolCrouchRun':'rifleCrouchRunAlt');
 }
});

test('third-person peek bends toward the resolved exposure without stretching bones or moving feet',()=>{
 const r=rig(combined),model=new THREE.Group();r.attachAnimatedModel(model,'pistol');
 for(const id of ['idle','pistolIdle','pistolKneelIdle'])for(const yaw of [0,.8,Math.PI]){
  r.object.rotation.y=yaw;r.animator.sample(id,0);r.finishAnimatedPose({lean:0});r.object.updateMatrixWorld(true);
  const head=r.bones.Head.getWorldPosition(new THREE.Vector3()),feet=['LeftFoot','RightFoot'].map(n=>r.bones[n].getWorldPosition(new THREE.Vector3()));
  const translations=new Map(Object.values(r.bones).map(bone=>[bone,bone.position.clone()]));
  const scales=new Map(Object.values(r.bones).map(bone=>[bone,bone.scale.clone()]));
  for(const amount of [-1,-.3,0,.45,1]){
   r.animator.sample(id,0);r.finishAnimatedPose({lean:amount,leanDistance:.32});r.object.updateMatrixWorld(true);
   const offset=r.bones.Head.getWorldPosition(new THREE.Vector3()).sub(head),right=new THREE.Vector3(-1,0,0).applyAxisAngle(new THREE.Vector3(0,1,0),yaw);
   if(amount)assert.ok(offset.dot(right)*Math.sign(amount)>0,`${id} correct lean direction`);
   else assert.ok(offset.length()<.0001);
   assert.ok(Math.abs(offset.dot(right))<.4,'bounded anatomical exposure');
   for(const bone of Object.values(r.bones)){assert.ok(bone.position.distanceTo(translations.get(bone))<1e-6,`${bone.name} translation must not stretch`);assert.ok(bone.scale.distanceTo(scales.get(bone))<1e-6);}
   for(const [i,n] of ['LeftFoot','RightFoot'].entries())assert.ok(r.bones[n].getWorldPosition(new THREE.Vector3()).distanceTo(feet[i])<.0001);
   for(const bone of Object.values(r.bones))assert.ok(bone.matrixWorld.elements.every(Number.isFinite));
  }
 }
});
test('repeated peek updates do not accumulate and blocked/airborne/sliding states center the body',()=>{
 const r=rig(combined),state={speed:0,equipment:'pistol',isGrounded:true,lean:.7};
 for(let i=0;i<120;i++)r.update(1/60,state);const reference=r.bones.Head.getWorldPosition(new THREE.Vector3());
 for(let i=0;i<300;i++)r.update(1/60,state);
 assert.ok(reference.distanceTo(r.bones.Head.getWorldPosition(new THREE.Vector3()))<.02,'idle breathing only, no accumulating lean');
 r.update(0,{...state,lean:0});assert.equal(r.bodyLean,0);
 r.update(0,{...state,isGrounded:false});assert.equal(r.bodyLean,0);
 r.animator.sample('idle',0);r.finishAnimatedPose({...state,isSliding:true});assert.equal(r.bodyLean,0);
});

test('editable peek offsets apply independently while preserving bone translations',()=>{
 const r=rig(combined),model=new THREE.Group();r.attachAnimatedModel(model,'pistol');
 const library=emptyPeekLibrary();r.peekPoses=library;
 const p=library['pistol:stand:right:aim'];p.strength=0;p.body.Head=[0,.2,0];p.weapon.position=[.025,.01,0];p.Right.handRotation=[.12,0,.1];p.Left.position=[-.02,.01,0];p.Left.fingers.Index=[.1,.2,.1];
 r.animator.sample('pistolIdle',0);r.finishAnimatedPose({lean:1,isAiming:false});const neutral=model.position.clone(),hand=r.bones.RightHand.quaternion.clone();
 r.animator.sample('pistolIdle',0);const positions=new Map(Object.values(r.bones).map(bone=>[bone,bone.position.clone()]));r.finishAnimatedPose({lean:1,isAiming:true});
 assert.equal(r.bodyLean,0);assert.ok(model.position.distanceTo(neutral)>.01);assert.ok(r.bones.RightHand.quaternion.angleTo(hand)>.05);
 for(const bone of Object.values(r.bones))assert.ok(bone.position.distanceTo(positions.get(bone))<1e-6);
});


test('non-ADS crouched pistol carry lowers the muzzle while ADS keeps the authored pose and artist offsets',()=>{
 const extra=JSON.parse(readFileSync(new URL('../public/assets/animations/rifle-expansion-pack.json',import.meta.url))),r=rig({...combined,clips:[...combined.clips,...extra.clips]}),model=new THREE.Group();r.attachAnimatedModel(model,'pistol');
 r.animator.sample('pistolCrouchIdle',0);r.finishAnimatedPose({isCrouching:true,lean:.6,isAiming:true,adsProgress:1});const aim=new THREE.Vector3(0,0,-1).applyQuaternion(model.getWorldQuaternion(new THREE.Quaternion()));
 r.animator.sample('pistolCrouchIdle',0);r.finishAnimatedPose({isCrouching:true,lean:.6,isAiming:false,adsProgress:0});const ready=new THREE.Vector3(0,0,-1).applyQuaternion(model.getWorldQuaternion(new THREE.Quaternion()));assert.ok(ready.y<aim.y-.35);assert.ok(ready.y<-.15);
 r.animator.sample('pistolCrouchIdle',0);r.finishAnimatedPose({isCrouching:true,lean:.6,isAiming:true,adsProgress:1});const aimAgain=new THREE.Vector3(0,0,-1).applyQuaternion(model.getWorldQuaternion(new THREE.Quaternion()));assert.ok(aim.distanceTo(aimAgain)<1e-6);
});
test('skeletal ragdoll falls under gravity, responds to impact and preserves limb translations',()=>{
 const r=rig(combined);r.animator.sample('idle',0);r.object.position.set(0,1,0);r.object.updateMatrixWorld(true);const lengths=new Map(Object.entries(r.bones).filter(([n])=>n!=='Hips').map(([n,b])=>[n,b.position.clone()]));
 const start=r.bones.Hips.getWorldPosition(new THREE.Vector3());const doll=new SkeletalRagdoll(r,[],new THREE.Vector3(0,0,1),r.bones.Head.getWorldPosition(new THREE.Vector3()),1.8);
 for(let i=0;i<360;i++)doll.update(1/120);
 assert.ok(doll.particles.get('Hips').position.y<start.y-.5);assert.ok(doll.particles.get('Head').position.z>0);for(const p of doll.particles.values()){assert.ok(p.position.toArray().every(Number.isFinite));assert.ok(p.position.y>=p.radius-.03)}
 for(const [name,pos] of lengths)assert.ok(r.bones[name].position.distanceTo(pos)<1e-6,`${name} must not stretch`);
 for(const bone of Object.values(r.bones))assert.ok(bone.matrixWorld.elements.every(Number.isFinite));
});


test('ragdolls retain torso volume, bounded limb folding, and deterministic rotations across fall directions',()=>{
 for(const direction of [new THREE.Vector3(0,0,1),new THREE.Vector3(1,0,0),new THREE.Vector3(0,0,-1)]){
  const r=rig(combined);r.animator.sample('idle',.3);r.object.updateMatrixWorld(true);
  const doll=new SkeletalRagdoll(r,[],direction,r.bones.Spine2.getWorldPosition(new THREE.Vector3()),1.8);
  const chestLength=doll.particles.get('Hips').position.distanceTo(doll.particles.get('Spine2').position);
  for(let i=0;i<360;i++)doll.update(1/120);
  const p=n=>doll.particles.get(n).position;
  assert.ok(Math.abs(p('Hips').distanceTo(p('Spine2'))-chestLength)<.025,'torso must not collapse');
  for(const side of ['Left','Right']){const thigh=p(side+'UpLeg').distanceTo(p(side+'Leg')),shin=p(side+'Leg').distanceTo(p(side+'Foot'));assert.ok(p(side+'UpLeg').distanceTo(p(side+'Foot'))>(thigh+shin)*.5,'knees cannot fold through torso');}
  const before=new Map(Object.entries(r.bones).map(([n,b])=>[n,b.getWorldQuaternion(new THREE.Quaternion())]));
  for(let i=0;i<20;i++)doll.pose();
  for(const [n,q] of before)assert.ok(q.clone().normalize().angleTo(r.bones[n].getWorldQuaternion(new THREE.Quaternion()).normalize())<1e-5,`${n} must not accumulate twist`);
 }
});

test('crouched rifle peeking retains authored forward posture instead of importing a standing backward arch',()=>{
 const extra=JSON.parse(readFileSync(new URL('../public/assets/animations/rifle-expansion-pack.json',import.meta.url)));
 const r=rig({...combined,clips:[...combined.clips,...extra.clips]}),model=new THREE.Group();r.attachAnimatedModel(model,'rifle','primary');
 const local=n=>r.object.worldToLocal(r.bones[n].getWorldPosition(new THREE.Vector3()));
 for(const yaw of [0,.8,Math.PI])for(const lean of [-1,1])for(const adsProgress of [0,1]){
  r.object.rotation.y=yaw;r.animator.sample('rifleCrouchIdle',1.442);r.animator.actionRemaining=0;r.object.updateMatrixWorld(true);
  const head=local('Head').sub(local('Hips')),feet=['LeftFoot','RightFoot'].map(local),hips=r.bones.Hips.quaternion.clone();
  const positions=new Map(Object.values(r.bones).map(b=>[b,b.position.clone()]));
  r.finishAnimatedPose({isGrounded:true,isCrouching:true,lean,adsProgress,isAiming:!!adsProgress,aimPitch:0});r.object.updateMatrixWorld(true);
  const peek=local('Head').sub(local('Hips'));
  assert.ok(Math.abs(peek.z-head.z)<1e-5,'sideways peek must not push the head behind the pelvis');
  assert.ok((peek.x-head.x)*lean<0,'head moves toward the selected peek side');
  assert.ok(r.bones.Hips.quaternion.angleTo(hips)<1e-6);
  for(const [i,n] of ['LeftFoot','RightFoot'].entries())assert.ok(local(n).distanceTo(feet[i])<1e-6);
  for(const [bone,p] of positions)assert.ok(bone.position.distanceTo(p)<1e-6,'joint positions preserve authored bone lengths');
 }
});

test('moving reload keeps directional legs cycling without changing upper-body reload rotations',()=>{
 const extra=JSON.parse(readFileSync(new URL('../public/assets/animations/rifle-expansion-pack.json',import.meta.url))),run=JSON.parse(readFileSync(new URL('../public/assets/animations/rifle-run-pack.json',import.meta.url)));
 const all={...combined,clips:[...combined.clips,...run.clips,...extra.clips]};
 for(const direction of [{forward:1,lateral:0},{forward:-1,lateral:0},{forward:0,lateral:1},{forward:1,lateral:-1}]){
  const actual=rig(all),reference=rig(all);reference.animator.reloadLocomotion.apply=()=>{};
  for(const r of [actual,reference]){r.animatedKind='rifle';r.animator.update(.016,{speed:0,isGrounded:true});r.animator.trigger('reload');}
  const state={...direction,speed:2.5,isGrounded:true,isReloading:true,equipment:'rifle'};let first=null,motion=0;
  for(let frame=0;frame<60;frame++){
   actual.animator.update(1/60,state);reference.animator.update(1/60,state);actual.object.updateMatrixWorld(true);reference.object.updateMatrixWorld(true);
   assert.equal(actual.animator.current,'reload');
   for(const name of ['Spine','Spine2','Neck','Head','RightArm','RightForeArm','RightHand','LeftHand'])assert.ok(actual.bones[name].getWorldQuaternion(new THREE.Quaternion()).normalize().angleTo(reference.bones[name].getWorldQuaternion(new THREE.Quaternion()).normalize())<2e-5,name+' must retain reload rotation');
   const q=actual.bones.LeftLeg.quaternion.clone();if(first)motion+=first.angleTo(q);first=q;
  }
  assert.ok(motion>.2,'reload legs must keep stepping');assert.equal(actual.animator.reloadLocomotion.active,true);
 }
});
test('crouching during reload changes only the lower stance and does not interrupt the reload action',()=>{
 const extra=JSON.parse(readFileSync(new URL('../public/assets/animations/rifle-expansion-pack.json',import.meta.url))),r=rig({...combined,clips:[...combined.clips,...extra.clips]});
 r.animatedKind='rifle';r.animator.update(.016,{isGrounded:true,speed:0,isCrouching:false});r.animator.trigger('reload');
 for(let i=0;i<30;i++)r.animator.update(1/60,{isReloading:true,isGrounded:true,isCrouching:true,speed:1,forward:-1});
 assert.equal(r.animator.current,'reload');assert.equal(r.animator.reloadLocomotion.clip,'rifleCrouchBack');
 for(let i=0;i<12;i++)r.animator.update(1/60,{isReloading:true,isGrounded:true,isCrouching:true,speed:0});
 assert.equal(r.animator.current,'reload');assert.equal(r.animator.reloadLocomotion.clip,'rifleCrouchIdle');
});
import {applyBodyLean} from '../src/models/BodyLean.js';

test('crouched moving peeks stay lateral in character space and preserve the strafe footwork',()=>{
 const extra=JSON.parse(readFileSync(new URL('../public/assets/animations/rifle-expansion-pack.json',import.meta.url)));
 const r=rig({...combined,clips:[...combined.clips,...extra.clips]});
 for(const clip of ['rifleCrouchLeft','rifleCrouchRight'])for(const phase of [.1,.4,.7])for(const yaw of [0,.9])for(const lean of [-1,1]){
  assert.ok(r.animator.clips.has(clip),clip);r.object.rotation.y=yaw;r.animator.sample(clip,phase);r.object.updateMatrixWorld(true);
  const head=r.object.worldToLocal(r.bones.Head.getWorldPosition(new THREE.Vector3()));
  const feet=['LeftFoot','RightFoot'].map(n=>r.bones[n].getWorldPosition(new THREE.Vector3()));
  const legs=['LeftUpLeg','LeftLeg','RightUpLeg','RightLeg'].map(n=>r.bones[n].quaternion.clone());
  applyBodyLean(r,{lean,isGrounded:true,isCrouching:true});
  const after=r.object.worldToLocal(r.bones.Head.getWorldPosition(new THREE.Vector3()));
  assert.ok(Math.abs(after.z-head.z)<1e-5,`${clip}: lean cannot fold the torso forward`);
  assert.ok((head.x-after.x)*lean>.02,`${clip}: visible lateral lean`);
  for(const [i,n] of ['LeftFoot','RightFoot'].entries())assert.ok(r.bones[n].getWorldPosition(new THREE.Vector3()).distanceTo(feet[i])<1e-5);
  for(const [i,n] of ['LeftUpLeg','LeftLeg','RightUpLeg','RightLeg'].entries())assert.deepEqual(r.bones[n].quaternion.toArray(),legs[i].toArray());
 }
});

test('lean is not baked into movement transition sources or applied twice',()=>{
 const neutral=rig(combined),leaning=rig(combined);
 for(const movement of [{speed:0},{speed:1.5,lateral:1},{speed:1.5,lateral:-1},{speed:1.5,forward:-1},{speed:0}])for(let frame=0;frame<20;frame++){
  const state={...movement,equipment:'rifle',isGrounded:true};
  neutral.update(1/60,{...state,lean:0});leaning.update(1/60,{...state,lean:.85});
  for(const name of ['Spine','Spine1','Spine2','Neck','Head'])assert.deepEqual(leaning.animator.presentedPose.get(leaning.bones[name]).rotation.toArray(),neutral.animator.presentedPose.get(neutral.bones[name]).rotation.toArray(),`${name}: transitions contain animation only`);
 }
});

test('rifle peeking keeps the muzzle forward through left and right strafe clips',()=>{
 const extra=JSON.parse(readFileSync(new URL('../public/assets/animations/rifle-expansion-pack.json',import.meta.url))),r=rig({...combined,clips:[...combined.clips,...extra.clips]}),model=new THREE.Group();r.attachAnimatedModel(model,'rifle','primary');
 for(const clip of ['rifleCrouchLeft','rifleCrouchRight'])for(const lean of [-1,1])for(const adsProgress of [0,1]){
  r.animator.sample(clip,.4);r.finishAnimatedPose({lean,adsProgress,isGrounded:true,isCrouching:true});
  const direction=new THREE.Vector3(0,0,-1).applyQuaternion(model.getWorldQuaternion(new THREE.Quaternion()));
  assert.ok(direction.z>.97,'rifle stays forward');assert.ok(Math.abs(direction.y+(adsProgress?0:.119145))<.001,'ADS and ready keep their intended muzzle elevation');
 }
});

test('stationary standing peek retains its original local spine and wrist-independent head rotations',()=>{
 const r=rig(combined),axis=new THREE.Vector3(0,0,1);
 // Before this fix these stationary poses used local Z, not character-space Z.
 for(const clip of ['idle','rifleReadyIdle'])for(const lean of [-1,1]){
  if(!r.animator.clips.has(clip))continue;
  r.animator.sample(clip,.2);
  const before=new Map(['Spine','Spine1','Spine2','Neck','Head'].map(n=>[n,r.bones[n].quaternion.clone()]));
  applyBodyLean(r,{lean,isGrounded:true,speed:0});
  const fittedAngle=lean*.55*(1-1/1024);
  for(const [name,weight]of [['Spine',.5],['Spine1',.3],['Spine2',.2],['Neck',-.055/(.55*(1-1/1024))],['Head',-.055/(.55*(1-1/1024))]]){
   const expected=before.get(name).multiply(new THREE.Quaternion().setFromAxisAngle(axis,fittedAngle*weight));
   assert.ok(r.bones[name].quaternion.clone().normalize().angleTo(expected.normalize())<1e-6,`${clip}/${name}: stationary authored basis preserved`);
  }
 }
});

test('ragdoll knees stay in their anatomical bend plane and bodies settle without continuing physics work',()=>{
 for(const direction of [new THREE.Vector3(0,0,1),new THREE.Vector3(1,0,0),new THREE.Vector3(0,0,-1)]){
  const r=rig(combined);r.animator.sample('idle',.3);r.object.updateMatrixWorld(true);
  const doll=new SkeletalRagdoll(r,[],direction,r.bones.Spine2.getWorldPosition(new THREE.Vector3()),1.8);
  for(let i=0;i<1200;i++)doll.update(1/120);
  assert.equal(doll.sleeping,true,'settled corpse sleeps');
  const positions=[...doll.particles.values()].map(p=>p.position.clone());
  for(let i=0;i<240;i++)doll.update(1/60);
  for(const [i,p]of [...doll.particles.values()].entries())assert.ok(p.position.distanceTo(positions[i])<1e-9,'resting body cannot wobble');
  const rotation=doll.frame().multiply(doll.referenceFrame.clone().invert()),forward=new THREE.Vector3(0,0,1).applyQuaternion(r.object.getWorldQuaternion(new THREE.Quaternion())).applyQuaternion(rotation);
  for(const side of ['Left','Right']){
   const a=doll.particles.get(side+'UpLeg').position,b=doll.particles.get(side+'Leg').position,c=doll.particles.get(side+'Foot').position;
   const axis=c.clone().sub(a).normalize(),bend=b.clone().sub(a);bend.addScaledVector(axis,-bend.dot(axis));
   assert.ok(bend.dot(forward)>-.002,`${side}: no backwards knee`);
   assert.ok(Math.abs(a.distanceTo(b)-doll.boneLengths.get(side+'Leg'))<.035,'thigh does not stretch');
  }
 }
});

test('ragdoll retains body shape against furniture and an elevated villa floor',()=>{
 const r=rig(combined);r.object.position.set(0,2,0);r.animator.sample('idle',.3);r.object.updateMatrixWorld(true);
 const floor=new THREE.Box3(new THREE.Vector3(-5,1.8,-5),new THREE.Vector3(5,2,5)),cabinet=new THREE.Box3(new THREE.Vector3(.7,2,-1),new THREE.Vector3(1.2,3.4,1));
 const doll=new SkeletalRagdoll(r,[floor,cabinet],new THREE.Vector3(1,0,0),null,1);
 for(let i=0;i<1200;i++)doll.update(1/120);
 for(const p of doll.particles.values()){assert.ok(p.position.y>=2+p.radius-.035,'body stays above raised floor');assert.ok(!cabinet.containsPoint(p.position),'body does not pass through furniture');}
 const chest=doll.particles.get('Spine2').position.distanceTo(doll.particles.get('Hips').position);assert.ok(chest>.3,'torso retains volume against cabinet');
});

test('visible ragdoll torso stays rigid and matches physical joints after moving and crouched deaths',()=>{
 const extra=JSON.parse(readFileSync(new URL('../public/assets/animations/rifle-expansion-pack.json',import.meta.url)));
 for(const clip of ['idle','strafeLeft','rifleCrouchIdle','rifleCrouchLeft','rifleCrouchRight']){
  const r=rig({...combined,clips:[...combined.clips,...extra.clips]});r.animator.sample(clip,.3);r.object.updateMatrixWorld(true);
  const bind=new Map(['Spine','Spine1','Spine2'].map(n=>[n,r.bones[n].quaternion.clone()]));
  const doll=new SkeletalRagdoll(r,[],new THREE.Vector3(0,0,-1),r.bones.Spine2.getWorldPosition(new THREE.Vector3()),1.8);
  for(let i=0;i<1200;i++)doll.update(1/120);
  assert.equal(doll.sleeping,true,`${clip}: settled`);
  for(const [name,q]of bind)assert.ok(r.bones[name].quaternion.clone().normalize().angleTo(q.clone().normalize())<1e-5,`${clip}/${name}: no visible waist/chest shear`);
  for(const [name,p]of doll.particles)assert.ok(p.position.distanceTo(p.bone.getWorldPosition(new THREE.Vector3()))<.035,`${clip}/${name}: visible joint matches simulated joint`);
  for(const side of ['Left','Right']){
   const chest=doll.particles.get('Spine2').position,hip=doll.particles.get(side+'UpLeg').position,knee=doll.particles.get(side+'Leg').position;
   const torso=chest.clone().sub(hip).normalize(),thigh=knee.clone().sub(hip).normalize();
   assert.ok(torso.dot(thigh)<0,`${clip}/${side}: thigh cannot fold over the chest`);
  }
 }
});


test('ragdoll ankles remain bounded and grounded bodies stop creeping on raised platforms',()=>{
 for(const yaw of [0,.9]){
  const r=rig(combined);r.object.position.y=2;r.object.rotation.y=yaw;r.animator.sample('idle',.3);r.object.updateMatrixWorld(true);
  const floor=new THREE.Box3(new THREE.Vector3(-8,1.8,-8),new THREE.Vector3(8,2,8));
  const doll=new SkeletalRagdoll(r,[floor],new THREE.Vector3(0,0,1),r.bones.Spine2.getWorldPosition(new THREE.Vector3()),2);
  for(let i=0;i<1200;i++)doll.update(1/120);
  assert.equal(doll.sleeping,true,'platform corpse settles');
  for(const side of ['Left','Right']){
   const knee=doll.particles.get(side+'Leg').position,ankle=doll.particles.get(side+'Foot').position,toe=doll.particles.get(side+'ToeBase').position;
   const angle=knee.clone().sub(ankle).angleTo(toe.clone().sub(ankle))*180/Math.PI;
   assert.ok(angle>=60&&angle<=120,`${side}: ankle angle ${angle}`);
  }
  const before=[...doll.particles.values()].map(p=>p.position.clone());
  for(let i=0;i<600;i++)doll.update(1/60);
  for(const [i,p]of [...doll.particles.values()].entries())assert.ok(before[i].distanceTo(p.position)<1e-9,'no sliding after rest');
 }
});


test('single-player crouched peeks keep both rifle grips attached across directional gaits without changing legs',()=>{
 const extra=JSON.parse(readFileSync(new URL('../public/assets/animations/rifle-expansion-pack.json',import.meta.url)));
 const r=rig({...combined,clips:[...combined.clips,...extra.clips]}),model=new THREE.Group();r.object.add(model);model.scale.setScalar(.85);r.attachAnimatedModel(model,'rifle','primary');r.refinedPeek=true;
 const library=JSON.parse(readFileSync(new URL('../public/assets/poses/studio-library.json',import.meta.url)));
 r.resolveAnimationPose=()=>applyFullBodyPose(r,library,'primary',0);r.peekPoses=library.peekPoses;
 for(const clip of ['idle','rifleCrouchIdle','rifleCrouchWalk','rifleCrouchBack','rifleCrouchLeft','rifleCrouchRight','rifleCrouchWalkForwardLeft','rifleCrouchWalkForwardRight'])for(const lean of [-1,-.5,.5,1])for(const adsProgress of [0,1])for(const phase of [.1,.4,.7]){
  r.animator.sample(clip,phase);r.animator.actionRemaining=0;r.object.updateMatrixWorld(true);
  const legs=['Hips','LeftUpLeg','LeftLeg','LeftFoot','RightUpLeg','RightLeg','RightFoot'];
  const before=legs.map(n=>({q:r.bones[n].quaternion.clone(),p:r.bones[n].getWorldPosition(new THREE.Vector3())}));
  r.resolveAnimationPose=()=>applyFullBodyPose(r,library,'primary',adsProgress);
  r.finishAnimatedPose({isGrounded:true,isCrouching:clip!=='idle',lean,adsProgress,speed:clip.includes('Idle')?0:1.4});
  assert.ok(r.rightGripMiss<.005,`${clip}: trigger grip ${r.rightGripMiss}`);
  const reference=r.animator.holdingPoses.rifleReady.get('RightForeArm').clone().slerp(r.animator.holdingPoses.rifle.get('RightForeArm'),adsProgress);
  const delta=r.bones.RightForeArm.quaternion.clone().multiply(reference.clone().invert()).normalize();
  const axis=r.bones.RightForeArm.position.clone().normalize();
  const twist=2*Math.atan2(delta.x*axis.x+delta.y*axis.y+delta.z*axis.z,delta.w);
  assert.ok(Math.abs(Math.atan2(Math.sin(twist),Math.cos(twist)))<.35,`${clip}: trigger elbow axial twist ${twist}`);

  assert.ok(r.supportGripMiss<.005,`${clip}: support grip ${r.supportGripMiss}`);
  assert.ok(r.bones.RightHand.getWorldPosition(new THREE.Vector3()).distanceTo(model.localToWorld(RIGHT_GRIP.clone()))<.005,`${clip}: trigger hand stays on gun after saved placement`);
  for(const [i,n]of legs.entries()){
   assert.ok(r.bones[n].quaternion.clone().normalize().angleTo(before[i].q.clone().normalize())<1e-6,`${clip}: ${n} rotation retained`);
   assert.ok(r.bones[n].getWorldPosition(new THREE.Vector3()).distanceTo(before[i].p)<1e-6,`${clip}: ${n} position retained`);
  }
  if(clip!=='idle'){
   const torso=r.bones.Head.getWorldPosition(new THREE.Vector3()).sub(r.bones.Hips.getWorldPosition(new THREE.Vector3()));
   assert.ok(Math.abs(torso.z)<torso.y*.35,`${clip}: torso cannot fold onto knees`);
  }
 }
});
