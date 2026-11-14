import * as T from 'three';

// Mixamo finger joints do not all use local X as their bend axis. Derive each
// axis in its bind frame so every phalanx closes towards the palm surface.
export function fitGripFingers(rig,side,overrides,trigger=false) {
    rig.gripFingerAxes??={};
    for(const finger of ['Thumb','Index','Middle','Ring','Pinky']){
        const frame=new T.Quaternion();
        for(let joint=1;joint<=3;joint++){
            const name=`${side}Hand${finger}${joint}`,bone=rig.bones[name],rest=rig.rest.get(bone);
            frame.multiply(rest.quaternion);
            let axis=rig.gripFingerAxes[name];
            if(!axis){
                const child=bone.children.find(n=>n.isBone);
                const forward=child?child.position.clone():rest.position.clone().applyQuaternion(rest.quaternion.clone().invert());
                const normal=new T.Vector3(0,0,1).applyQuaternion(frame.clone().invert());
                axis=forward.normalize().cross(normal).normalize();
                if(axis.lengthSq()<.1)axis.set(1,0,0);
                rig.gripFingerAxes[name]=axis;
            }
            const authored=rig.animator?.holdingPoses?.[rig.animatedKind]?.get(name);
            const amount=authored?0:finger==='Thumb'?[.3,.6,.45][joint-1]:trigger&&finger==='Index'?[.15,.35,.25][joint-1]:[.9,1.15,.8][joint-1];
            bone.quaternion.copy(authored||rest.quaternion).multiply(new T.Quaternion().setFromAxisAngle(axis,amount+(overrides?.[finger]?.[joint-1]||0)));
        }
    }
    rig.bones[side+'Hand'].updateMatrixWorld(true);
}
