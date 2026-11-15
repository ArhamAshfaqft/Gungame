import * as T from 'three';
import {sampleMilitiaThrow} from './MilitiaGrenadeThrow.js';

// One clock for the grip, item and projectile release in both camera views.
export const THROW_DURATION = .7;
export const THROW_RELEASE = .46;
export const PIN_DURATION = .35;
const smooth = t => { t=T.MathUtils.clamp(t,0,1); return t*t*(3-2*t); };
function path(t,keys) {
    const i=Math.max(1,keys.findIndex(k=>t<=k[0]));
    const a=keys[i-1],b=keys[i];
    return new T.Vector3(...a[1]).lerp(new T.Vector3(...b[1]),smooth((t-a[0])/(b[0]-a[0])));
}
export function throwableMotion(progress=0,mode='high') {
    const t=T.MathUtils.clamp(progress,0,1),low=mode==='low';
    const offset=path(t,[[0,[0,0,0]],[.25,low?[.015,-.09,.07]:[.025,.12,.10]],
        [THROW_RELEASE,low?[-.035,-.07,-.19]:[-.06,.20,-.23]],
        [.68,low?[-.04,-.01,-.23]:[-.09,.12,-.28]],[1,[0,0,0]]]);
    return {offset,open:smooth((t-THROW_RELEASE)/.08)*(1-smooth((t-.80)/.20))};
}
export function throwableHandTargets(progress=0,pin=0,mode='high') {
    const motion=throwableMotion(progress,mode);
    const Right=new T.Vector3(.035,-.12,.025).add(motion.offset);
    const Left=new T.Vector3(-.18,-.23,.12);
    if(!progress){
        // Approach the ring, pull it sideways, then return the spare hand.
        const reach=smooth(pin/.25)*(1-smooth((pin-.65)/.35));
        Left.lerp(new T.Vector3(.035-.12*smooth((pin-.25)/.4),.06,.035),reach);
    }
    return {Left,Right};
}

// Replace only the upper-body rifle pose. Legs keep their existing locomotion.
export function poseThrowableBody(rig,state) {
    const p=state.throwProgress||0,pin=state.pinProgress||0;
    const {open}=throwableMotion(p,state.throwMode);
    const root=rig.object,bodyRotation=root.getWorldQuaternion(new T.Quaternion());
    const chest=root.worldToLocal(rig.bones.Spine2.getWorldPosition(new T.Vector3()));
    const center=chest.clone().add(new T.Vector3(-.20,-.08,.32));
    const low=state.throwMode==='low';
    const imported=['frag','flash','smoke'].includes(rig.animatedSlot)&&!low&&p>0;
    const motion=imported?sampleMilitiaThrow(p):null;
    const armLength=side=>rig.bones[side+'Arm'].getWorldPosition(new T.Vector3()).distanceTo(rig.bones[side+'ForeArm'].getWorldPosition(new T.Vector3()))+rig.bones[side+'ForeArm'].getWorldPosition(new T.Vector3()).distanceTo(rig.bones[side+'Hand'].getWorldPosition(new T.Vector3()));
    if(motion)center.addScaledVector(motion.offset,armLength('Right'));
    else center.add(path(p,[[0,[0,0,0]],[.25,low?[0,-.12,-.08]:[-.10,.40,-.22]],
        [THROW_RELEASE,low?[.04,-.05,.22]:[.06,.32,.24]],[.68,low?[.05,.01,.25]:[.10,.18,.27]],[1,[0,0,0]]]));
    const modelRotation=bodyRotation.clone().multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),Math.PI));
    const attachment=rig.animationGrips?.grenade||rig.animationGrip;
    const wristRotation=attachment?modelRotation.clone().multiply(attachment.clone().invert()):rig.bones.RightHand.getWorldQuaternion(new T.Quaternion());
    if(motion)wristRotation.premultiply(bodyRotation.clone().multiply(motion.rotation).multiply(bodyRotation.clone().invert()));
    const grip=new T.Vector3(.035,-.1,.025).applyQuaternion(modelRotation);
    const target=root.localToWorld(center.clone()).add(grip);
    const rightPole=motion?rig.bones.RightArm.getWorldPosition(new T.Vector3()).addScaledVector(motion.pole.clone().applyQuaternion(bodyRotation),armLength('Right')):root.localToWorld(chest.clone().add(new T.Vector3(-.48,-.38,.12)));
    rig.solveIK(rig.bones.RightArm,rig.bones.RightForeArm,rig.bones.RightHand,target,rightPole);
    rig.setWorldRotation(rig.bones.RightHand,wristRotation);
    const reach=p?0:smooth(pin/.25)*(1-smooth((pin-.65)/.35));
    const left=chest.clone().add(new T.Vector3(.23,-.25,.23));
    const spareMotion=imported?sampleMilitiaThrow(p,'Left'):null;
    if(spareMotion)left.addScaledVector(spareMotion.offset,armLength('Left')*.6);
    left.lerp(center.clone().add(new T.Vector3(.04+.12*smooth((pin-.25)/.4),.08,.025)),reach);
    rig.solveIK(rig.bones.LeftArm,rig.bones.LeftForeArm,rig.bones.LeftHand,root.localToWorld(left),root.localToWorld(chest.clone().add(new T.Vector3(.48,-.4,.12))));
    for(const side of ['Right','Left']){
        // Start from the bind finger pose, not the source clip's rifle grip.
        for(const finger of ['Thumb','Index','Middle','Ring','Pinky'])for(let j=1;j<=3;j++){
            const bone=rig.bones[`${side}Hand${finger}${j}`],rest=rig.rest.get(bone);
            if(rest)bone.quaternion.copy(rest.quaternion||rest.rotation);
        }
        rig.curlFingers(side,side==='Right'?1*(1-open):.42+reach*.4,false);
    }
    root.updateMatrixWorld(true);
}


export function updateThrowableGrip(held,hand,reference,throwing) {
    if(!held?.model||!hand)return;
    hand.updateWorldMatrix(true,false);held.model.updateWorldMatrix(true,false);
    if(!throwing||!held.gripAnchor){
        held.gripAnchor??=new T.Matrix4();held.gripAnchor.copy(hand.matrixWorld).invert().multiply(held.model.matrixWorld);
    }
    else{
        const matrix=reference.matrixWorld.clone().invert().multiply(hand.matrixWorld).multiply(held.gripAnchor);
        matrix.decompose(held.model.position,held.model.quaternion,held.model.scale);
        held.model.updateMatrixWorld(true);
    }
}
