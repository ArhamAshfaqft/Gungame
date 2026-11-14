import * as THREE from 'three';

// Signed, cover-resolved lean (-1 left, +1 right). A remote character can
// supply this same scalar after network interpolation; no camera is required.
export function bodyLeanAmount(state={}) {
    const lean=Number.isFinite(state.lean)?THREE.MathUtils.clamp(state.lean,-1,1):0;
    return state.isGrounded===false || state.isSliding ? 0 : lean;
}
export function applyBodyLean(rig,state={}) {
    const amount=bodyLeanAmount(state);rig.bodyLean=amount;
    if(!amount)return;
    const root=rig.object;
    root.updateMatrixWorld(true);
    const headBefore=rig.bones.Head.getWorldPosition(new THREE.Vector3());
    // Bend above the pelvis: feet, knees and movement collision remain planted.
    // Body local -X is the player's right, so positive Z rotation leans right.
    const right=new THREE.Vector3(-1,0,0).applyQuaternion(root.getWorldQuaternion(new THREE.Quaternion()));
    const joints=[['Spine',.5],['Spine1',.3],['Spine2',.2]].map(([name,weight])=>({bone:rig.bones[name],weight,base:rig.bones[name].quaternion.clone()}));
    const axis=new THREE.Vector3(0,0,1),q=new THREE.Quaternion();

    const crouched=!!state.isCrouching;
    const worldAxis=axis.clone().applyQuaternion(root.getWorldQuaternion(new THREE.Quaternion()));
    const pose=angle=>{
        // Preserve the artist-calibrated standing peek basis. Crouch clips
        // need character-space roll because their local spine axes are turned.
        if(!crouched){
            for(const joint of joints)joint.bone.quaternion.copy(joint.base).multiply(q.setFromAxisAngle(axis,angle*joint.weight));
            root.updateMatrixWorld(true);
            return rig.bones.Head.getWorldPosition(new THREE.Vector3()).sub(headBefore).dot(right)*Math.sign(amount);
        }
        for(const joint of joints)joint.bone.quaternion.copy(joint.base);
        root.updateMatrixWorld(true);
        for(const joint of joints){
            const rotation=joint.bone.getWorldQuaternion(new THREE.Quaternion());
            rig.setWorldRotation(joint.bone,q.setFromAxisAngle(worldAxis,angle*joint.weight).multiply(rotation));
            joint.bone.updateMatrixWorld(true);
        }
        root.updateMatrixWorld(true);
        return rig.bones.Head.getWorldPosition(new THREE.Vector3()).sub(headBefore).dot(right)*Math.sign(amount);
    };
    // Fit the desired exposure using bounded rotations only. Never pull the spine
    // away from the pelvis to force a camera offset onto a shorter crouched torso.
    const distance=Number.isFinite(state.leanDistance)?THREE.MathUtils.clamp(state.leanDistance,0,.4):.32;
    const target=Math.abs(amount)*distance,maxAngle=Math.abs(amount)*.55;
    let low=0,high=maxAngle;
    for(let i=0;i<9;i++){
        const middle=(low+high)*.5;
        if(pose(middle*Math.sign(amount))<target)low=middle;else high=middle;
    }
    pose((low+high)*.5*Math.sign(amount));
    if(crouched)for(const name of ['Neck','Head']){const bone=rig.bones[name];rig.setWorldRotation(bone,q.setFromAxisAngle(worldAxis,-amount*.055).multiply(bone.getWorldQuaternion(new THREE.Quaternion())));}
    else {rig.rotate('Neck',0,0,-amount*.055);rig.rotate('Head',0,0,-amount*.055);}
    root.updateMatrixWorld(true);
}
