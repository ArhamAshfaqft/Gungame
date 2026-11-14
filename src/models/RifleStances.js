import * as T from 'three';

// Two arm poses over the same gait. Keep the authored pelvis, legs, torso sway
// and head; release the layer for sprinting and weapon actions.
export function applyRifleStance(rig,state={}) {
    const animator=rig.animator,id=animator?.current;
    if(rig.animatedKind!=='rifle'||!id||state.isReloading||state.isSliding||state.isSprinting||/reload|throw|hit|fire|jump/i.test(id)||state.isGrounded===false)return;
    const ready=animator.holdingPoses?.rifleReady,aim=animator.holdingPoses?.rifle;if(!ready||!aim)return;
    const ads=T.MathUtils.clamp(state.adsProgress??(state.isAiming?1:0),0,1);
    const moving=(state.speed||0)>.15;
    const weight=T.MathUtils.lerp(moving?.35:.55,.92,ads);
    for(const [name,rotation]of ready){
        if(!/^(Left|Right)(Arm|ForeArm|Hand)/.test(name)||!aim.has(name))continue;
        const target=rotation.clone().slerp(aim.get(name),ads);
        rig.bones[name].quaternion.slerp(target,weight);
    }
    rig.object.updateMatrixWorld(true);
}
