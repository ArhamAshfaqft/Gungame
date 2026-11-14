import * as T from 'three';

export function weaponElbowPole(rig,side,guide,model,target,handRotation) {
    if(guide?.elbowTarget?.some(n=>n!==0))return rig.guidedElbowPole(side,guide,model);
    const shoulder=rig.bones[side+'Arm'].getWorldPosition(new T.Vector3());
    const down=new T.Vector3(side==='Left'?.23:-.23,-.32,.03).applyQuaternion(rig.object.getWorldQuaternion(new T.Quaternion()));
    const natural=rig.bones[side+'ForeArm'].getWorldPosition(new T.Vector3()).lerp(shoulder.add(down),.75);
    if(!target||!handRotation)return natural;
    const hand=rig.bones[side+'Hand'],forearm=rig.bones[side+'ForeArm'];
    const length=forearm.getWorldPosition(new T.Vector3()).distanceTo(hand.getWorldPosition(new T.Vector3()));
    const frame=handRotation.clone().multiply(rig.rest.get(hand).quaternion.clone().invert());
    const ideal=target.clone().addScaledVector(hand.position.clone().normalize().applyQuaternion(frame),-length);
    // Choose the elbow bend plane from the intended wrist frame. A fixed low
    // pole can otherwise produce a ninety-degree wrist bend on a canted gun.
    return ideal.lerp(natural,.15);
}

// Translate the held weapon as a unit into the intersection of the arms' reach
// volumes. Never stretch a limb or slide a hand along the gun to fake contact.
export function fitWeaponReach(rig,model,trigger,support,right,left,reachFactor=.94) {
    model.updateWorldMatrix(true,false);
    const rotation=model.getWorldQuaternion(new T.Quaternion());
    const targets={Right:model.localToWorld(trigger.clone()).add(new T.Vector3().fromArray(right?.position||[0,0,0]).applyQuaternion(rotation)),
        Left:model.localToWorld(support.clone().add(new T.Vector3().fromArray(left?.position||[0,0,0])))};
    const shift=new T.Vector3();
    const limits=['Right','Left'].map(side=>{
        const a=rig.bones[side+'Arm'].getWorldPosition(new T.Vector3()),b=rig.bones[side+'ForeArm'].getWorldPosition(new T.Vector3()),c=rig.bones[side+'Hand'].getWorldPosition(new T.Vector3());
        return {side,origin:a,radius:(a.distanceTo(b)+b.distanceTo(c))*reachFactor};
    });
    for(let pass=0;pass<8;pass++)for(const {side,origin,radius} of limits){
        const delta=targets[side].clone().add(shift).sub(origin),distance=delta.length();
        if(distance>radius)shift.addScaledVector(delta,(radius-distance)/distance);
    }
    if(shift.lengthSq()>1e-12){
        const position=model.getWorldPosition(new T.Vector3()).add(shift);
        model.position.copy(model.parent.worldToLocal(position));model.updateMatrixWorld(true);
    }
}
