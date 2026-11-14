import * as T from 'three';
import {weaponContacts,posedPalmPosition} from './WeaponContacts.js';
import {fitGripFingers} from './GripFingers.js';
import {fitWeaponReach} from './WeaponGripFit.js';
import {torsoEnvelope,selectArmPole} from './ArmClearance.js';

export function usesStableHolding(rig,state={}) {
    return !!rig.weaponHolding?.enabled&&!!rig.animatedModel&&state.handIK!==false&&!state.isReloading&&!/reload|throw|death/i.test(rig.animator?.current||'');
}

function forearmTwist(rig,side,rotation){
    const lower=rig.bones[side+'ForeArm'],hand=rig.bones[side+'Hand'];
    const current=lower.getWorldQuaternion(new T.Quaternion());
    const axis=hand.position.clone().normalize().applyQuaternion(current);
    const desired=rotation.clone().multiply(rig.rest.get(hand).quaternion.clone().invert());
    const project=v=>v.addScaledVector(axis,-v.dot(axis)).normalize();
    const from=project(new T.Vector3(1,0,0).applyQuaternion(current)),to=project(new T.Vector3(1,0,0).applyQuaternion(desired));
    const angle=T.MathUtils.clamp(Math.atan2(axis.dot(from.clone().cross(to)),from.dot(to)),-1.35,1.35);
    rig.setWorldRotation(lower,current.premultiply(new T.Quaternion().setFromAxisAngle(axis,angle)));
    rig.setWorldRotation(hand,rotation);
}

function holdingRoot(rig){
    const root=rig.object.getWorldQuaternion(new T.Quaternion());
    if(/turn/i.test(rig.animator?.current||'')&&rig.holdingHipRotation){
        const hips=root.clone().invert().multiply(rig.bones.Hips.getWorldQuaternion(new T.Quaternion())).multiply(rig.holdingHipRotation.clone().invert());
        const forward=new T.Vector3(0,0,1).applyQuaternion(hips);
        root.multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),Math.atan2(forward.x,forward.z)));
    }
    return root;
}

export function prepareStableTorso(rig,state={}){
    rig.object.updateMatrixWorld(true);
    if(!rig.holdingChestRotation)return;
    const current=new T.Vector3(0,0,1).applyQuaternion(rig.bones.Spine2.getWorldQuaternion(new T.Quaternion()));
    const ads=T.MathUtils.clamp(state.adsProgress??rig.holdingADS??0,0,1);
    const wanted=new T.Vector3(0,0,1).applyQuaternion(holdingRoot(rig).multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),(rig.holdingShoulderYaw||0)*(1-ads))).multiply(rig.holdingChestRotation));
    const angle=Math.atan2(wanted.x,wanted.z)-Math.atan2(current.x,current.z);
    const spine=rig.bones.Spine;
    rig.setWorldRotation(spine,spine.getWorldQuaternion(new T.Quaternion()).premultiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),angle)));
    for(const side of ['Right','Left']){
        const pose=rig.animator.holdingPoses[rig.animatedKind]?.get(side+'Shoulder');if(pose)rig.bones[side+'Shoulder'].quaternion.copy(pose);
    }
    rig.object.updateMatrixWorld(true);
}

// Weapon drives hands; the gait never drives the weapon. Grip transforms are
// shared by ready/ADS and attachments can supply a different contact profile.
export function poseStableWeapon(rig,state={}) {
    const model=rig.animatedModel,config=rig.weaponHolding,slot=rig.animatedSlot;
    const contacts=weaponContacts(rig,model,slot);if(!contacts)return false;
    const ads=T.MathUtils.clamp(state.adsProgress??rig.holdingADS??(state.isAiming?1:0),0,1);
    const root=holdingRoot(rig);
    const facing=root.clone().multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(0,0,1),(state.lean||0)*.32)).multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),Math.PI));
    const readyOffset=new T.Vector3().fromArray(config.ready.position).applyQuaternion(facing);
    const aimOffset=new T.Vector3().fromArray(config.aim.position).applyQuaternion(facing);
    const offsetRotation=new T.Quaternion().setFromEuler(new T.Euler(...config.ready.rotation)).slerp(new T.Quaternion().setFromEuler(new T.Euler(...config.aim.rotation)),ads);
    const rotation=facing.clone().multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(1,0,0),state.aimPitch||0)).multiply(offsetRotation);
    const chest=rig.bones.Spine2.getWorldPosition(new T.Vector3());
    const readyPosition=chest.clone().add(readyOffset),aimPosition=chest.clone().add(aimOffset);
    const sight=model.getObjectByName('anchor_sight_holo')||model.getObjectByName('anchor_sight_iron');
    const sightOffset=(sight?.position.clone()||new T.Vector3(0,.10,0)).multiply(model.scale).applyQuaternion(rotation);
    aimPosition.y=rig.bones.Head.getWorldPosition(new T.Vector3()).y+.055-sightOffset.y+aimOffset.y;
    model.position.copy(model.parent.worldToLocal(readyPosition.lerp(aimPosition,ads)));
    model.quaternion.copy(model.parent.getWorldQuaternion(new T.Quaternion()).invert().multiply(rotation));model.updateMatrixWorld(true);
    const wristFor=side=>{
        const guide=config[side],profile=contacts[side],hand=rig.bones[side+'Hand'];
        const palm=new T.Vector3().fromArray(guide.contact?.palmPoint||profile.palmPoint.toArray());
        const contact=new T.Vector3().fromArray(guide.contact?.weaponPoint||profile.weaponPoint.toArray());
        const localRotation=profile.rotation.clone().multiply(new T.Quaternion().setFromEuler(new T.Euler(...guide.rotation)));
        return contact.sub(palm.multiply(hand.getWorldScale(new T.Vector3())).applyQuaternion(localRotation).divide(model.getWorldScale(new T.Vector3()))).add(new T.Vector3().fromArray(guide.position));
    };
    fitWeaponReach(rig,model,wristFor('Right'),wristFor('Left'),null,null,.995);
    const authoredOffset=new T.Vector3().fromArray(config.ready.position).lerp(new T.Vector3().fromArray(config.aim.position),ads).applyQuaternion(facing);
    rig.thirdPersonBase={position:model.parent.worldToLocal(model.getWorldPosition(new T.Vector3()).sub(authoredOffset)),quaternion:model.parent.getWorldQuaternion(new T.Quaternion()).invert().multiply(facing)};
    rig.stableGripMiss={};rig.stableWristFrames={};rig.stableArmClearance={};
    const base=rig.animator.holdingPoses[rig.animatedKind];
    const body=torsoEnvelope(rig,root);
    const initial=model.getWorldPosition(new T.Vector3());
    const evaluate=position=>{
        model.position.copy(model.parent.worldToLocal(position.clone()));model.updateMatrixWorld(true);
        const plans={};let score=position.distanceToSquared(initial)*4;
        for(const side of ['Right','Left']){
            const guide=config[side],profile=contacts[side],hand=rig.bones[side+'Hand'];
            const target=model.localToWorld(wristFor(side)),q=rotation.clone().multiply(profile.rotation).multiply(new T.Quaternion().setFromEuler(new T.Euler(...guide.rotation)));
            const shoulder=rig.bones[side+'Arm'].getWorldPosition(new T.Vector3());
            const natural=shoulder.add(new T.Vector3(side==='Right'?-.23:.23,-.28,.10).applyQuaternion(root));
            const length=rig.bones[side+'ForeArm'].getWorldPosition(new T.Vector3()).distanceTo(hand.getWorldPosition(new T.Vector3()));
            const frame=q.clone().multiply(rig.rest.get(hand).quaternion.clone().invert());
            const pole=target.clone().addScaledVector(hand.position.clone().normalize().applyQuaternion(frame),-length).lerp(natural,.10).add(new T.Vector3().fromArray(guide.elbowTarget).applyQuaternion(rotation));
            plans[side]=selectArmPole(rig,side,target,q,pole,body);score+=plans[side].score;
        }
        return {position:position.clone(),plans,score};
    };
    let fitted=evaluate(initial);
    const safe=fit=>Object.values(fit.plans).every(p=>p.clearance>=-.001&&p.reachMiss<.001&&p.bend<1.05);
    if(!safe(fitted)){
        const directions=[new T.Vector3(0,0,1).applyQuaternion(root),new T.Vector3(1,0,0).applyQuaternion(root),new T.Vector3(-1,0,0).applyQuaternion(root),new T.Vector3(0,1,0),new T.Vector3(0,-1,0)];
        for(const step of [.055,.03,.015]){
            for(let repeat=0;repeat<4&&!safe(fitted);repeat++){
                let next=fitted;
                for(const dir of directions){
                    const candidate=fitted.position.clone().addScaledVector(dir,step);
                    if(candidate.distanceTo(initial)>.19||Math.abs(candidate.y-initial.y)>(ads>.9?.045:.14))continue;
                    const fit=evaluate(candidate);if(fit.score<next.score)next=fit;
                }
                if(next===fitted)break;fitted=next;
            }
        }
    }
    model.position.copy(model.parent.worldToLocal(fitted.position.clone()));model.updateMatrixWorld(true);
    rig.stablePoseAdjustment=fitted.position.clone().sub(initial);
    for(const side of ['Right','Left']){
        for(const name of ['Arm','ForeArm','Hand']){
            const bone=rig.bones[side+name];bone.quaternion.copy(base?.get(side+name)||rig.rest.get(bone).quaternion);
        }
        rig.bones[side+'Arm'].updateMatrixWorld(true);
        const guide=config[side],profile=contacts[side],hand=rig.bones[side+'Hand'];
        const localRotation=profile.rotation.clone().multiply(new T.Quaternion().setFromEuler(new T.Euler(...guide.rotation)));
        const wristLocal=wristFor(side);
        const target=model.localToWorld(wristLocal.clone()),handRotation=rotation.clone().multiply(localRotation);
        const shoulder=rig.bones[side+'Arm'].getWorldPosition(new T.Vector3());
        const natural=shoulder.add(new T.Vector3(side==='Right'?-.23:.23,-.28,.10).applyQuaternion(root));
        const lower=rig.bones[side+'ForeArm'];
        const length=lower.getWorldPosition(new T.Vector3()).distanceTo(hand.getWorldPosition(new T.Vector3()));
        const forearmFrame=handRotation.clone().multiply(rig.rest.get(hand).quaternion.clone().invert());
        const pole=target.clone().addScaledVector(hand.position.clone().normalize().applyQuaternion(forearmFrame),-length).lerp(natural,.10);
        pole.add(new T.Vector3().fromArray(guide.elbowTarget).applyQuaternion(rotation));
        const safeArm=fitted.plans[side];
        rig.solveIK(rig.bones[side+'Arm'],rig.bones[side+'ForeArm'],hand,target,safeArm.pole);
        rig.stableArmClearance[side]=safeArm.clearance;
        forearmTwist(rig,side,handRotation);
        fitGripFingers(rig,side,guide.fingers,side==='Right');
        if(guide.thumbRotation)rig.rotate(side+'HandThumb1',...guide.thumbRotation);
        rig.stableGripMiss[side]=hand.getWorldPosition(new T.Vector3()).distanceTo(target);
        rig.stableWristFrames[side]={position:wristLocal,rotation:localRotation};
        const info={position:target,quaternion:handRotation};
        const baseRotation=rotation.clone().multiply(profile.rotation);
        if(side==='Right'){rig.rightGripBase={position:target.clone().sub(new T.Vector3().fromArray(guide.position).applyQuaternion(rotation)),quaternion:baseRotation};rig.rightGripTarget=info;rig.rightGripMiss=rig.stableGripMiss[side];}
        else{rig.supportGripBasePosition=target.clone();rig.supportGripBaseQuaternion=baseRotation;rig.supportGripTarget=info;rig.supportGripMiss=rig.stableGripMiss[side];}
    }
    rig.supportUsesWeaponTarget=true;rig.palmContactMiss={};
    for(const side of ['Right','Left']){
        const guide=config[side],profile=contacts[side];
        const target=model.localToWorld(new T.Vector3().fromArray(guide.contact?.weaponPoint||profile.weaponPoint.toArray()).add(new T.Vector3().fromArray(guide.position)));
        rig.palmContactMiss[side]=posedPalmPosition(rig,side).distanceTo(target);
    }
    rig.object.updateMatrixWorld(true);return true;
}
