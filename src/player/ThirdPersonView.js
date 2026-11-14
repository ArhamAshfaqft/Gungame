import {attachMuzzleFlash,updateMuzzleFlash,muzzleWorldPosition} from '../models/MuzzleFlash.js';
import * as THREE from 'three';
import { createSwatRig } from '../models/SwatRig.js';
import { loadSniperModel } from '../models/SniperModel.js';
import { loadPistolModel } from '../models/PistolModel.js';
import {loadAssaultRifleModel,applyAssaultMechanics,updateHolographicSight} from '../models/AssaultRifleModel.js';
import { createGrenadeModel } from '../models/GrenadeModel.js';
import { applyPistolMechanics } from '../models/PistolReload.js';
import { sampleReloadSequence, applySequenceMechanics } from '../studio/ReloadTimeline.js';
import { sweepSphere } from '../weapons/CombatQueries.js';
import { FootstepContacts } from './FootstepContacts.js';
import { soundEngine } from '../audio/SoundEngine.js';
import { SkeletalRagdoll } from '../models/SkeletalRagdoll.js';
import {characterEyePosition,setCharacterEyeView} from '../models/SharedEyeView.js';
import {applyFullBodyPose} from '../studio/FullBodyPoses.js';
import {applySniperM4Pose} from '../studio/SharedM4Grips.js';

export function chaseCameraPosition(eye, rotation, colliders, aiming = false, floorHeight = -Infinity) {
    const offset = new THREE.Vector3(.45, .18, aiming ? 1.35 : 2.05).applyQuaternion(rotation);
    const desired = eye.clone().add(offset);
    desired.y = Math.max(desired.y,floorHeight+.22);
    const hit = sweepSphere(eye, desired, .2, colliders);
    return hit ? eye.clone().lerp(desired, Math.max(0, hit.time - .025)) : desired;
}
export function bodyMovement(velocity, bodyYaw) {
    return { forward: velocity.x*Math.sin(bodyYaw)+velocity.z*Math.cos(bodyYaw),
        lateral: velocity.x*Math.cos(bodyYaw)-velocity.z*Math.sin(bodyYaw) };
}

// Full-body presentation is separate from the eye camera used by movement and shooting.
export class ThirdPersonView {
    constructor(scene, eyeCamera, movement, weapon, equipment, colliders) {
        Object.assign(this, { scene, eyeCamera, movement, weapon, equipment, colliders });
        this.camera = eyeCamera.clone(); this.enabled = false;
        this.footPosition = new THREE.Vector3();
        this.footsteps = new FootstepContacts(side=>soundEngine.playFootstep(
            movement.isCrouchRunning?'crouchRun':movement.isCrouching?'crouch':movement.isWalking?'walk':movement.isSprinting?'sprint':'run',side,movement.isWading));
        this.ready = this.load();
    }
    async load() {
        const [rig, rifle, pistol, assault] = await Promise.all([createSwatRig(), loadSniperModel(), loadPistolModel(),loadAssaultRifleModel()]);
        this.rig = rig; rifle.scale.setScalar(.85);
        for(const [model,slot]of [[rifle,'primary'],[pistol,'pistol'],[assault,'assault']])attachMuzzleFlash(model,slot);
        this.models = { primary: rifle, pistol, assault, frag: createGrenadeModel('frag'), flash: createGrenadeModel('flash'), smoke: createGrenadeModel('smoke') };
        for (const model of Object.values(this.models)) { rig.object.add(model); model.visible = false; }
        rig.object.visible = false; this.scene.add(rig.object);
        this.movement.footstepsFromAnimation=!!rig.animator?.pack.footContacts;
    }
    get aimingThroughSights(){return this.allowSightCamera!==false&&!this.inspecting&&this.enabled&&this.weapon.isAiming&&!this.equipment.held&&!this.weapon.isReloading;}
    get usesChaseCamera(){return this.enabled&&!this.aimingThroughSights;}
    muzzlePosition(slot=this.weapon.activeSlot){return muzzleWorldPosition(this.models?.[slot]);}
    toggle() {
        if (!this.rig) return false;
        this.enabled = !this.enabled;
        this.weapon.thirdPerson = this.enabled;
        this.rig.object.visible = this.enabled;
        return true;
    }
    get usesBodyFirstPerson() {
        const slot=this.equipment.held?.type||this.weapon.activeSlot;
        return !!this.rig && !this.enabled && !this.movement.isDisabled && !!this.weapon.poseLibrary.sharedFirstPerson?.[slot];
    }
    update(delta) {
        if (!this.rig) return;
        const { rig, movement: m, weapon: w } = this;
        const eyeView=this.usesBodyFirstPerson;
        setCharacterEyeView(rig,eyeView);
        if(m.isDisabled){
            rig.object.visible=this.enabled;
            this.deathRagdoll ||= new SkeletalRagdoll(rig,this.colliders,this.equipment.lastDamageDirection||new THREE.Vector3(0,0,1),m.position,2);
            this.deathRagdoll.update(delta);this.footsteps.reset();if(this.enabled)this.updateCamera();return;
        }
        if(this.deathRagdoll){this.deathRagdoll=null;rig.reset();if(rig.animator){rig.animator.authoredPose=null;rig.animator.presentedPose=null;rig.animator.current=null;}}
        rig.object.visible = (this.enabled || eyeView) && !m.isDisabled && !this.aimingThroughSights;
        if(this.allowSightCamera!==false)w.thirdPerson=this.usesChaseCamera;
        const displayedPosition=m.renderPosition||m.position;
        rig.object.position.set(displayedPosition.x, displayedPosition.y-m.currentHeight, displayedPosition.z);
        const facing=m.yaw+Math.PI;
        const sprinting=m.isSprinting&&!w.isAiming&&!w.isReloading&&!m.isCrouching&&m.getSpeed()>2.2;
        const targetYaw=sprinting?Math.atan2(m.velocity.x,m.velocity.z):facing;
        this.bodyYaw??=facing;
        this.bodyYaw+=Math.atan2(Math.sin(targetYaw-this.bodyYaw),Math.cos(targetYaw-this.bodyYaw))*(1-Math.exp(-delta*10));
        rig.object.rotation.set(0,this.bodyYaw,0);
        const slot = this.equipment.held?.type || w.activeSlot;
        const kind = slot === 'primary'||slot==='assault' ? 'rifle' : slot === 'pistol' ? 'pistol' : 'grenade';
        // The old M4 uses the proven sniper presentation; weapon mechanics remain M4-specific.
        const poseSlot = this.enabled && slot === 'assault' ? 'primary' : slot;
        if (rig.animatedSlot !== poseSlot || rig.animatedModel !== this.models[slot]) rig.attachAnimatedModel(this.models[slot], kind, poseSlot);
        for (const [id, model] of Object.entries(this.models)) model.visible = id === slot && !(kind === 'grenade' && this.equipment.pending?.released);
        if (kind === 'grenade') this.models[slot].getObjectByName('SafetyPin').visible = !this.equipment.held?.armed;
        const applyPose = this.enabled && slot === 'assault' ? applySniperM4Pose : applyFullBodyPose;
        applyPose(rig,w.poseLibrary,poseSlot,w.adsProgress||0);
        rig.resolveAnimationPose=state=>applyPose(rig,w.poseLibrary,poseSlot,w.adsProgress||0,{clip:rig.animator.current,time:rig.animator.actions.get(rig.animator.current)?.time||0,state:kind==='grenade'?(this.equipment.pending?.mode||(w.pinProgress>0&&w.pinProgress<1?'pin':'hold')):'hip',isFiring:kind!=='grenade'&&w.fireActionRemaining>0&&!w.isReloading});
        rig.peekPoses=w.poseLibrary.peekPoses;rig.peekTimelines=w.poseLibrary.peekTimelines;
        if (w.isReloading && !this.wasReloading && kind === 'rifle') rig.animator?.trigger('reload');
        // Throwable arms use the shared release clock, not a differently timed rifle throw clip.
        this.wasReloading = w.isReloading; this.wasThrowing = w.utilityTimer > 0;
        const { forward, lateral } = bodyMovement(m.velocity,rig.object.rotation.y);
        rig.update(delta, { speed: m.getSpeed(), forward, lateral, equipment: kind, isSprinting: m.isSprinting, isCrouchRunning:m.isCrouchRunning,
            isGrounded: m.isGrounded, isCrouching: m.isCrouching, isSliding: m.isSliding, verticalVelocity: m.velocity.y, aimPitch: m.pitch, isAiming: w.isAiming, isFiring:w.fireActionRemaining>0&&!w.isReloading, legsOnly:!this.enabled&&!eyeView,
            throwProgress:w.throwProgress||0,pinProgress:w.pinProgress||0,throwMode:w.throwMode||'high',
            lean:m.effectiveLean||0,leanDistance:m.leanMaxOffset,adsProgress:w.adsProgress,sharedHolding:!!w.poseLibrary.sharedFirstPerson?.[poseSlot],isReloading:w.isReloading });
        applyPistolMechanics(this.models.pistol,0,kind === 'pistol' && w.fireActionRemaining > 0 && !w.isReloading ? 1-w.fireActionRemaining/.18 : null);
        applyAssaultMechanics(this.models.assault,slot==='assault'&&w.isReloading?w.reloadProgress:0,slot==='assault'&&w.fireActionRemaining>0?1-w.fireActionRemaining/w.profile.fireActionTime:0);
        if ((this.enabled || eyeView) && kind === 'pistol' && w.isReloading) this.reloadPose();
        const floor=displayedPosition.y-m.currentHeight;
        rig.object.updateMatrixWorld(true);
        const heights={Left:rig.bones.LeftFoot.getWorldPosition(this.footPosition).y-floor,Right:rig.bones.RightFoot.getWorldPosition(this.footPosition).y-floor};
        const footClip=rig.animator?.reloadLocomotion.active?rig.animator.reloadLocomotion.clip:rig.animator?.current;
        this.footsteps.update(delta,{heights,range:rig.animator?.pack.footContacts?.[footClip],speed:m.getSpeed(),grounded:m.isGrounded,sliding:m.isSliding,disabled:m.isDisabled});
        if(this.enabled)this.updateCamera();
        if(eyeView){characterEyePosition(rig,this.eyeCamera.position);this.eyeCamera.updateMatrixWorld(true);}
        const shotElapsed=(w.profile?.fireActionTime||(slot==='pistol'?.18:.65))-(w.fireActionRemaining||0);
        for(const id of ['primary','pistol','assault'])updateMuzzleFlash(this.models[id],shotElapsed,id===slot&&!w.isReloading&&w.fireActionRemaining>0);
        updateHolographicSight(this.models.assault,this.enabled?this.camera:this.eyeCamera);
    }
    reloadPose() {
        const { rig, weapon: w } = this, model = this.models.pistol;
        const sequence = w.reloadSequence || w.poseLibrary.reloadSequence;
        const sample = sampleReloadSequence(sequence,w.reloadProgress*sequence.duration);
        model.updateWorldMatrix(true,true);
        const beforeRotation = model.getWorldQuaternion(new THREE.Quaternion());
        const anchors = Object.fromEntries(['Left','Right'].map(side => [side, {
            position: model.worldToLocal(rig.bones[side+'Hand'].getWorldPosition(new THREE.Vector3())),
            rotation: beforeRotation.clone().invert().multiply(rig.bones[side+'Hand'].getWorldQuaternion(new THREE.Quaternion()))
        }]));
        model.position.add(new THREE.Vector3().fromArray(sample.pose.weapon.position).applyQuaternion(model.quaternion));
        model.quaternion.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(...sample.pose.weapon.rotation)));
        model.updateMatrixWorld(true);
        for (const side of ['Right','Left']) {
            const p = sample.pose[side], anchor = anchors[side];
            const target = model.localToWorld(anchor.position.add(new THREE.Vector3().fromArray(p.position).divide(model.scale)));
            const pole = rig.object.localToWorld(new THREE.Vector3(side === 'Left' ? .65 : -.65,1.03,.16).add(new THREE.Vector3().fromArray(p.elbow)));
            rig.solveIK(rig.bones[side+'Arm'],rig.bones[side+'ForeArm'],rig.bones[side+'Hand'],target,pole);
            const q = model.getWorldQuaternion(new THREE.Quaternion()).multiply(anchor.rotation).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(...p.rotation)));
            rig.alignForearmTwist(side,q); rig.setWorldRotation(rig.bones[side+'Hand'],q);
            for (const [joint,field] of [['Arm','shoulderRotation'],['ForeArm','elbowRotation'],['Hand','handRotation']]) rig.bones[side+joint].quaternion.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(...p[field])));
            for (const [finger,angles] of Object.entries(p.fingers)) angles.forEach((angle,i)=>rig.rotate(`${side}Hand${finger}${i+1}`,angle));
            rig.bones[side+'Arm'].updateMatrixWorld(true);
        }
        applySequenceMechanics(model,rig,sample);
    }
    updateCamera() {
        const eye = this.eyeCamera.position, rotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(this.movement.pitch,this.movement.yaw,0,'YXZ'));
        this.camera.position.copy(chaseCameraPosition(eye,rotation,this.colliders,this.weapon.isAiming,this.movement.position.y-this.movement.currentHeight));
        const direction = new THREE.Vector3(0,0,-1).applyQuaternion(rotation);
        const ray = new THREE.Ray(eye,direction); let distance = 80;
        for (const box of this.colliders) { const hit = ray.intersectBox(box,new THREE.Vector3()); if (hit) distance = Math.min(distance,Math.max(.5,hit.distanceTo(eye))); }
        this.camera.lookAt(eye.clone().addScaledVector(direction,distance));
        this.camera.fov = this.weapon.isAiming ? 60 : 70;
        this.camera.aspect = this.eyeCamera.aspect; this.camera.updateProjectionMatrix(); this.camera.updateMatrixWorld(true);
    }
}
