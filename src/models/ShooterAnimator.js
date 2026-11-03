import * as THREE from 'three';
import { smoothLoop, isLoopingMovement } from './AnimationLoops.js';
import { composePistolCrouch, PISTOL_CROUCH_SOURCES } from './PistolCrouch.js';

let packPromise;
let pistolPromise;
export function loadPistolPack() {
    pistolPromise ||= fetch('/assets/animations/pistol-pack.json').then(response => {
        if (!response.ok) throw new Error('Pistol animation pack could not load.');
        return response.json();
    });
    return pistolPromise;
}
export function equipmentClips(pack, equipment) {
    return pack.clips.filter(clip => equipment === 'pistol' ? clip.id.startsWith('pistol')
        : equipment === 'grenade' ? clip.id === 'throw' : !clip.id.startsWith('pistol'));
}
export function pistolLocomotionClip({ speed = 0, forward = 1, lateral = 0, isSprinting = false, isGrounded = true, isCrouching = false } = {}) {
    if (!isGrounded) return speed > 2 ? 'pistolJumpForward' : 'pistolJump';
    if (isCrouching) return 'pistolKneelIdle';
    if (speed < 0.15) return 'pistolIdle';
    const run = isSprinting || speed > 3.5;
    if (Math.abs(lateral) > Math.abs(forward) * 2) return lateral < 0 ? 'pistolStrafeLeft' : 'pistolStrafeRight';
    if (Math.abs(lateral) > Math.abs(forward) * 0.15) return `pistol${run ? 'Run' : 'Walk'}${forward < 0 ? 'Back' : ''}Arc${lateral < 0 ? 'Left' : 'Right'}`;
    return `pistol${run ? 'Run' : 'Walk'}${forward < 0 ? 'Back' : ''}`;
}
export function loadShooterPack() {
    packPromise ||= Promise.all(['shooter-pack','rifle-run-pack','rifle-expansion-pack','foot-contacts'].map(async name => {
        const response = await fetch(`/assets/animations/${name}.json`);
        if (!response.ok) throw new Error('Shooter animation pack could not load.');
        return response.json();
    })).then(([base,run,expansion,contacts]) => ({...base,footContacts:contacts.clips,clips:[...base.clips,...run.clips,...expansion.clips]}));
    return packPromise;
}
export function locomotionClip({ speed = 0, forward = 1, lateral = 0, isSprinting = false, isGrounded = true } = {}) {
    if (!isGrounded) return 'jump';
    if (speed < 0.15) return 'idle';
    if (Math.abs(lateral) > Math.abs(forward)) return lateral < 0 ? (speed > 2.2 ? 'strafeRunLeft' : 'strafeLeft') : (speed > 2.2 ? 'strafeRunRight' : 'strafeRight');
    return forward < 0 ? (isSprinting || speed > 2.2 ? 'runBack' : 'walkBack') : isSprinting || speed > 2.2 ? 'run' : 'walk';
}
export function expandedRifleClip(state, available) {
    const base = locomotionClip(state);
    if (state.isGrounded === false) return base;
    const { speed = 0, forward = 1, lateral = 0, isCrouching, isAiming } = state;
    let candidate = base;
    if (isCrouching && speed <= .15) candidate = 'rifleCrouchIdle';
    else if (isCrouching && speed > .15) candidate = Math.abs(lateral) > Math.abs(forward)
        ? lateral < 0 ? 'rifleCrouchLeft' : 'rifleCrouchRight' : forward < 0 ? 'rifleCrouchBack' : 'rifleCrouchRun';
    else if (speed < .15 && !isAiming) candidate = 'rifleReadyIdle';
    else if (speed > 2.2 && Math.abs(lateral) > Math.abs(forward)*.35 && Math.abs(lateral) < Math.abs(forward)*2.8)
        candidate = `rifleRun${forward < 0 ? 'Backward' : 'Forward'}${lateral < 0 ? 'Left' : 'Right'}`;
    else if (base === 'run' && !isAiming) candidate = 'rifleRunReady';
    if (isCrouching && state.isCrouchRunning && speed > .15 && forward > 0 && Math.abs(lateral)<=Math.abs(forward)*2.8 && available.has('rifleCrouchRunAlt')) candidate='rifleCrouchRunAlt';
    else if (isCrouching && speed > .15 && forward > 0) {
        if (Math.abs(lateral) > Math.abs(forward)*.35 && Math.abs(lateral) < Math.abs(forward)*2.8) {
            const diagonal = lateral < 0 ? 'rifleCrouchWalkForwardLeft' : 'rifleCrouchWalkForwardRight';
            if (available.has(diagonal)) candidate = diagonal;
        } else if (Math.abs(lateral) <= Math.abs(forward)*.35 && available.has('rifleCrouchWalk')) candidate = 'rifleCrouchWalk';
    }
    return available.has(candidate) ? candidate : base;
}
export function expandedPistolClip(state,available) {
    if(state.isCrouching && state.isGrounded!==false){
        const sources=new Set(Object.values(PISTOL_CROUCH_SOURCES));
        const source=expandedRifleClip(state,sources);
        const id=Object.keys(PISTOL_CROUCH_SOURCES).find(id=>PISTOL_CROUCH_SOURCES[id]===source);
        if(id&&available.has(id))return id;
    }
    return pistolLocomotionClip(state);
}

export class ShooterAnimator {
    constructor(rig, pack) {
        // A symmetric stationary crouch keeps the moving crouch clips from snapping
        // upright at rest. Average opposing gait phases, leaving source files intact.
        const crouch = pack.clips.find(clip=>clip.id==='rifleCrouchBack');
        if (crouch && !pack.clips.some(clip=>clip.id==='rifleCrouchIdle')) {
            const tracks = crouch.tracks.map(track=>{
                const Type = track.property === 'quaternion' ? THREE.QuaternionKeyframeTrack : THREE.VectorKeyframeTrack;
                const sample = new Type('crouch',track.times,track.values).createInterpolant();
                const a = Array.from(sample.evaluate(0)),b = Array.from(sample.evaluate(crouch.duration*.5));
                const pose = track.property === 'quaternion' ? new THREE.Quaternion().fromArray(a).slerp(new THREE.Quaternion().fromArray(b),.5).normalize().toArray() : a.map((n,i)=>(n+b[i])*.5);
                return {...track,times:[0,1],values:[...pose,...pose]};
            });
            pack = {...pack,clips:[...pack.clips,{id:'rifleCrouchIdle',name:'rifle crouch — stationary (derived)',duration:1,sourceRootDelta:[0,0,0],tracks}]};
        }
        const standToCrouch = pack.clips.find(clip=>clip.id==='rifleStandToCrouch');
        if (standToCrouch && !pack.clips.some(clip=>clip.id==='rifleCrouchToStand')) {
            const tracks = standToCrouch.tracks.map(track=>{
                const size=track.property==='quaternion'?4:3,values=[];
                for(let i=track.values.length-size;i>=0;i-=size)values.push(...track.values.slice(i,i+size));
                return {...track,times:track.times.map(t=>standToCrouch.duration-t).reverse(),values};
            });
            pack={...pack,clips:[...pack.clips,{...standToCrouch,id:'rifleCrouchToStand',name:'rifle crouch to stand (reversed)',tracks,sourceRootDelta:standToCrouch.sourceRootDelta.map(n=>-n)}]};
        }
        pack = { ...pack, clips: pack.clips.map(smoothLoop) };
        pack = {...pack,clips:[...pack.clips,...composePistolCrouch(pack.clips)]};
        this.rig = rig; this.pack = pack; this.mixer = new THREE.AnimationMixer(rig.object);
        this.phaseTracks = new Map(); this.sinceSwitch = 1;
        this.clips = new Map(); this.actions = new Map(); this.current = null; this.elapsed = 0; this.actionRemaining = 0;
        for (const data of pack.clips) {
            const tracks = data.tracks.flatMap(track => {
                const bone = rig.bones[track.bone]; if (!bone) return [];
                const Type = track.property === 'quaternion' ? THREE.QuaternionKeyframeTrack : THREE.VectorKeyframeTrack;
                return [new Type(`${bone.uuid}.${track.property}`, track.times, track.values)];
            });
            const clip = new THREE.AnimationClip(data.id, data.duration, tracks);
            this.clips.set(data.id, clip);
            this.actions.set(data.id, this.mixer.clipAction(clip));
            this.phaseTracks.set(data.id, data.tracks.filter(track => /^(Left|Right)(UpLeg|Leg|Foot)$/.test(track.bone) && track.property === 'quaternion')
                .map(track => ({ bone: track.bone, sample: new THREE.QuaternionKeyframeTrack('phase', track.times, track.values).createInterpolant() })));
        }
        // Imported hand axes differ from the procedural first-person grip basis.
        // Calibrate once against the rifle idle, then retain the clip's hand motion.
        this.calibrateGrip('idle', 'rifle');
        if (this.clips.has('pistolIdle')) this.calibrateGrip('pistolIdle', 'pistol');
        this.holdingPoses = {};
        for (const [kind,id] of [['rifle','idle'],['rifleReady',this.clips.has('rifleReadyIdle') ? 'rifleReadyIdle' : 'rifleRunReady'],['pistol','pistolIdle']]) {
            if (!this.clips.has(id)) continue;
            this.sample(id,0);
            this.holdingPoses[kind] = new Map(Object.entries(rig.bones)
                .filter(([name]) => /^(Spine\d*|Neck|Head|LeftShoulder|RightShoulder|LeftArm|RightArm|LeftForeArm|RightForeArm|LeftHand.*|RightHand.*)$/.test(name))
                .map(([name,bone]) => [name,bone.quaternion.clone()]));
        }
        this.holdingBlend = 0;
        for (const action of this.actions.values()) action.stop();
        this.current = null; rig.reset();
        this.presentedPose = null; this.transition = null;
    }
    calibrateGrip(id, kind) {
        const rig = this.rig;
        this.sample(id, 0);
        rig.object.updateMatrixWorld(true);
        const desired = rig.object.getWorldQuaternion(new THREE.Quaternion()).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI));
        rig.animationGrips ||= {};
        rig.animationGrips[kind] = rig.bones.RightHand.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(desired);
        if (kind === 'rifle') rig.animationGrip = rig.animationGrips.rifle;
    }
    play(id, { fade = 0.2, once = false, speed = 1 } = {}) {
        const action = this.actions.get(id); if (!action) return false;
        if (id === this.current && !once) { action.timeScale = THREE.MathUtils.damp(action.timeScale, speed, 8, this.lastDelta || 1 / 60); return true; }
        const previous = this.actions.get(this.current);
        const phase = previous && !once && isLoopingMovement(id) && isLoopingMovement(this.current) ? this.matchPhase(id, this.current, previous.time) : 0;
        // Retire old fades so paused/retargeted characters keep a bounded active action count.
        for (const candidate of this.actions.values()) if (candidate !== previous && candidate !== action) candidate.stop();
        action.reset().setEffectiveWeight(1).setEffectiveTimeScale(speed).setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, once ? 1 : Infinity);
        action.clampWhenFinished = once; action.play();
        action.time = phase;
        // Blend from the pose actually shown, including interrupted transitions.
        // Dropping an old crossfade otherwise changes several bone weights at once.
        this.transition = fade > 0 && this.presentedPose ? { elapsed:0,duration:fade,
            from:new Map([...this.presentedPose].map(([bone,pose])=>[bone,{rotation:pose.rotation.clone(),position:pose.position.clone()}])) } : null;
        if (previous && previous !== action) previous.stop();
        this.current = id; this.actionRemaining = once ? this.clips.get(id).duration / speed : 0;
        this.sinceSwitch = 0;
        return true;
    }
    matchPhase(next, previous, time) {
        const reference = new Map(this.phaseTracks.get(previous).map(track => [track.bone, new THREE.Quaternion().fromArray(track.sample.evaluate(time))]));
        let best = 0, bestError = Infinity;
        for (let step = 0; step < 32; step++) {
            const candidate = step / 32 * this.clips.get(next).duration;
            let error = 0;
            for (const track of this.phaseTracks.get(next)) {
                const before = reference.get(track.bone); if (!before) continue;
                const angle = before.angleTo(new THREE.Quaternion().fromArray(track.sample.evaluate(candidate)).normalize());
                error += angle * angle;
            }
            if (error < bestError) { bestError = error; best = candidate; }
        }
        return best;
    }
    trigger(id) { return this.play(id, { once: true, fade: 0.08 }); }
    restoreAuthoredPose() {
        for (const [bone,pose] of this.authoredPose || []) { bone.quaternion.copy(pose.rotation); bone.position.copy(pose.position); }
    }
    captureAuthoredPose() {
        this.authoredPose ||= new Map(Object.values(this.rig.bones).map(bone=>[bone,{rotation:new THREE.Quaternion(),position:new THREE.Vector3()}]));
        for (const [bone,pose] of this.authoredPose) { pose.rotation.copy(bone.quaternion); pose.position.copy(bone.position); }
    }
    blendTransition(delta) {
        const transition=this.transition;if(!transition)return;
        const t=Math.min(1,transition.elapsed/transition.duration),weight=t*t*(3-2*t);
        this.transitionTarget ||= new THREE.Quaternion();
        for(const [bone,pose] of transition.from){
            this.transitionTarget.copy(bone.quaternion);
            bone.quaternion.copy(pose.rotation).slerp(this.transitionTarget,weight);
            bone.position.lerpVectors(pose.position,bone.position,weight);
        }
        transition.elapsed+=delta;if(t>=1)this.transition=null;
    }
    capturePresentedPose() {
        this.presentedPose ||= new Map(Object.values(this.rig.bones).map(bone=>[bone,{rotation:new THREE.Quaternion(),position:new THREE.Vector3()}]));
        for(const [bone,pose] of this.presentedPose){pose.rotation.copy(bone.quaternion);pose.position.copy(bone.position);}
    }
    update(delta, state = {}) {
        this.lastDelta = delta; this.sinceSwitch += delta;
        const pistol = (state.equipment || this.rig.animatedKind) === 'pistol' && this.clips.has('pistolIdle');
        const crouched = !!state.isCrouching;
        const postureAction=/^(rifle|pistol)(StandToCrouch|CrouchToStand)$/.test(this.current || '');
        if(postureAction && ((state.speed || 0)>.4 || state.isGrounded===false))this.actionRemaining=0;
        if (pistol && this.wasCrouching !== undefined && crouched !== this.wasCrouching) {
            const transition=crouched?'pistolStandToCrouch':'pistolCrouchToStand';
            if(this.clips.has(transition)){
                if((state.speed||0)<.4&&state.isGrounded!==false)this.play(transition,{once:true,fade:.2,speed:this.clips.get(transition).duration/.6});
            }else this.trigger(crouched ? 'pistolStandToKneel' : 'pistolKneelToStand');
        }
        if(!pistol && this.wasCrouching!==undefined && crouched!==this.wasCrouching && (state.speed || 0)<.4 && state.isGrounded!==false){
            const id=crouched?'rifleStandToCrouch':'rifleCrouchToStand';
            if(this.clips.has(id))this.play(id,{once:true,fade:.2,speed:this.clips.get(id).duration/.6});
        }
        this.wasCrouching = crouched;
        this.actionRemaining = Math.max(0, this.actionRemaining - delta);
        if (!this.actionRemaining) {
            let id = state.clip || (pistol ? expandedPistolClip(state,this.clips) : expandedRifleClip(state,this.clips));
            // Require a stable direction briefly and let the prior fade complete. This
            // prevents alternating strafe/back choices at their diagonal boundary.
            if (!state.clip && id !== this.current && this.current && isLoopingMovement(id) && isLoopingMovement(this.current)) {
                if (this.candidate !== id) { this.candidate = id; this.candidateAge = 0; }
                this.candidateAge += delta;
                if (this.candidateAge < 0.1 || this.sinceSwitch < 0.22) id = this.current;
            } else { this.candidate = null; this.candidateAge = 0; }
            const data = this.pack.clips.find(clip => clip.id === id);
            const travel = data?.sourceRootDelta;
            const measured = travel ? Math.hypot(travel[0], travel[2]) * 0.01 / data.duration : 0;
            const baseSpeed = measured > 0.2 ? measured : id.startsWith('run') || id.startsWith('strafeRun') ? 3.1 : 1.05;
            const speed = state.clip || /idle|jump/i.test(id) ? 1 : THREE.MathUtils.clamp((state.speed || 1) / baseSpeed, 0.35, 2.6);
            this.play(id, { speed, fade: /crouch|kneel/i.test(id+this.current) ? .38 : .22 });
        }
        // Three's mixer skips writing unchanged tracks. Restore the last authored
        // pose first so aim/IK offsets never accumulate on stationary bones.
        this.restoreAuthoredPose();
        this.mixer.update(delta); this.captureAuthoredPose(); this.elapsed += delta;
        this.blendTransition(delta);
        this.stabilizeHoldingPose(delta,state,pistol);
        this.capturePresentedPose();
    }
    stabilizeHoldingPose(delta,state,pistol) {
        // Keep authored leg/hip motion, with a quiet equipment-specific upper body.
        // Actions and sprinting retain their complete authored arm movement.
        const enabled = isLoopingMovement(this.current || '') && !state.isSprinting && !state.isCrouching &&
            !state.clip && !this.actionRemaining && (state.equipment || this.rig.animatedKind || 'rifle') !== 'grenade';
        this.holdingBlend = THREE.MathUtils.damp(this.holdingBlend,enabled ? .85 : 0,12,delta);
        if (this.holdingBlend < .001 || this.actionRemaining) return;
        const ready = !pistol && !state.isAiming && this.holdingPoses.rifleReady;
        this.aimBlend = THREE.MathUtils.damp(this.aimBlend ?? 1,ready ? 0 : 1,10,delta);
        const pose = this.holdingPoses[pistol ? 'pistol' : 'rifle']; if (!pose) return;
        for (const [name,rotation] of pose) {
            const weight = /^Spine|Neck|Head/.test(name) ? this.holdingBlend*.55 : this.holdingBlend;
            const target = !pistol && (ready || this.aimBlend < .999) ? (this.holdingPoses.rifleReady?.get(name)?.clone().slerp(rotation,this.aimBlend) || rotation) : rotation;
            this.rig.bones[name].quaternion.slerp(target,weight);
        }
    }
    sample(id, seconds) {
        this.transition=null;
        this.restoreAuthoredPose();
        for (const action of this.actions.values()) action.stop();
        const action = this.actions.get(id); if (!action) return false;
        action.reset().setEffectiveWeight(1).setEffectiveTimeScale(1).setLoop(THREE.LoopOnce, 1);
        action.clampWhenFinished = true; action.play();
        action.time = THREE.MathUtils.clamp(seconds, 0, this.clips.get(id).duration);
        this.mixer.update(0); this.captureAuthoredPose(); this.capturePresentedPose(); this.current = id;
        return true;
    }
}
