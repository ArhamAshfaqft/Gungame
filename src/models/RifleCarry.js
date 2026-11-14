import * as T from 'three';
import {isLoopingMovement} from './AnimationLoops.js';

// Imported clips have different wrist/torso relationships. Keep their gait and
// arm motion, but bound the carry elevation before applying artist grip offsets.
// Work at the shoulders so hands, sleeves and weapon turn together.
export function fitRifleCarry(rig,state={}) {
    if(rig.animatedKind==='rifle')fitCarry(rig,state,'rifle');
}

export function fitPistolCrouchCarry(rig,state={}) {
    if(rig.animatedKind==='pistol'&&state.isCrouching)fitCarry(rig,state,'pistol');
}

function fitCarry(rig,state,kind) {
    const id=rig.animator?.current;
    const stanceAction=/Crouch|Kneel|Turn|Stop/i.test(id||'')&&!/reload|throw|hit/i.test(id);
    if((!isLoopingMovement(id||'')&&!stanceAction)||state.isReloading||(state.actionActive&&!stanceAction)||state.isSliding||state.isGrounded===false)return;
    rig.object.updateMatrixWorld(true);
    const rotation=rig.bones.RightHand.getWorldQuaternion(new T.Quaternion()).multiply(rig.animationGrips[kind]);
    const direction=new T.Vector3(0,0,-1).applyQuaternion(rotation);
    const horizontal=Math.hypot(direction.x,direction.z);
    if(horizontal<.001)return;
    const elevation=Math.atan2(direction.y,horizontal);
    const aim=T.MathUtils.clamp(state.aimPitch||0,-.8,.8);
    const ads=T.MathUtils.clamp(state.adsProgress??(state.isAiming?1:0),0,1);
    const low=T.MathUtils.lerp(kind==='pistol'?aim-.35:aim-.5,aim-.06,ads);
    const high=aim+T.MathUtils.lerp(kind==='pistol'?.08:state.isCrouching?.14:.21,.06,ads);
    const correction=T.MathUtils.clamp(elevation,low,high)-elevation;
    if(Math.abs(correction)<1e-6)return;
    const axis=new T.Vector3(direction.z,0,-direction.x).normalize();
    const delta=new T.Quaternion().setFromAxisAngle(axis,-correction);
    for(const side of ['Right','Left']){
        const arm=rig.bones[side+'Arm'];
        rig.setWorldRotation(arm,arm.getWorldQuaternion(new T.Quaternion()).premultiply(delta));
    }
    rig.object.updateMatrixWorld(true);
}
