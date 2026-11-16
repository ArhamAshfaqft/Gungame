import * as T from 'three';

const v=()=>new T.Vector3();
const q=()=>new T.Quaternion();
const surfaceCache=new WeakMap();

// Read-only sampling: no skin weights, vertices, bind matrices or source clips
// are edited. The contact follows a real triangle of the skinned glove.
export function measurePalm(rig,side){
    const hand=rig.bones[side+'Hand'];rig.object.updateMatrixWorld(true);
    const knuckle=f=>hand.worldToLocal(rig.bones[side+'Hand'+f+'1'].getWorldPosition(v()));
    const middle=knuckle('Middle'),across=knuckle('Index').sub(knuckle('Pinky')).normalize();
    const along=middle.clone().normalize(),normal=across.clone().cross(along).normalize();
    if(normal.dot(knuckle('Thumb'))<0)normal.negate();
    along.addScaledVector(normal,-along.dot(normal)).normalize();
    const lateral=along.clone().cross(normal).normalize();
    const frame=q().setFromRotationMatrix(new T.Matrix4().makeBasis(lateral,along,normal));
    function surfaceFrame(sample){
        sample.mesh.skeleton.update();
        const points=sample.indices.map(i=>hand.worldToLocal(sample.mesh.localToWorld(sample.mesh.getVertexPosition(i,v()))));
        sample.point=points.reduce((p,n,i)=>p.addScaledVector(n,sample.bary.getComponent(i)),v());
        sample.normal=points[1].clone().sub(points[0]).cross(points[2].clone().sub(points[0])).normalize();
        const tangent=along.clone().addScaledVector(sample.normal,-along.dot(sample.normal)).normalize();
        sample.frame=q().setFromRotationMatrix(new T.Matrix4().makeBasis(tangent.clone().cross(sample.normal).normalize(),tangent,sample.normal));
        return sample;
    }
    let cached=null;
    rig.object.traverse(mesh=>{
        const entry=mesh.isSkinnedMesh&&surfaceCache.get(mesh.geometry)?.[side];
        if(entry)cached={mesh,indices:entry.indices,bary:entry.bary.clone(),normal,frame};
    });
    if(cached)return surfaceFrame(cached);
    const center=middle.clone().multiplyScalar(.55),origin=center.clone().addScaledVector(normal,middle.length());
    const ray=new T.Ray(origin,normal.clone().negate());
    let best=null,distance=Infinity;
    rig.object.traverse(mesh=>{
        if(!mesh.isSkinnedMesh)return;
        const index=mesh.skeleton.bones.indexOf(hand);if(index<0)return;
        mesh.skeleton.update();
        const geometry=mesh.geometry,skin=geometry.attributes.skinIndex,weight=geometry.attributes.skinWeight;
        const positions=new Map(),weights=new Map();
        function influence(i){
            if(weights.has(i))return weights.get(i);
            let amount=0;for(let k=0;k<4;k++)if(skin.getComponent(i,k)===index)amount+=weight.getComponent(i,k);
            weights.set(i,amount);return amount;
        }
        function position(i){
            if(!positions.has(i))positions.set(i,hand.worldToLocal(mesh.localToWorld(mesh.getVertexPosition(i,v()))));
            return positions.get(i);
        }
        const count=geometry.index?.count||geometry.attributes.position.count;
        for(let i=0;i<count;i+=3){
            const ids=[0,1,2].map(k=>geometry.index?geometry.index.getX(i+k):i+k);
            // The real right palm shares weight with the thumb pad. Requiring a
            // nearly rigid hand influence would select the BACK of that glove.
            if(ids.reduce((n,id)=>n+influence(id),0)/3<.3)continue;
            const points=ids.map(position),hit=ray.intersectTriangle(...points,false,v());if(!hit)continue;
            const faceNormal=points[1].clone().sub(points[0]).cross(points[2].clone().sub(points[0])).normalize();
            if(faceNormal.dot(normal)<.35)continue;
            const d=hit.distanceTo(origin);if(d>=distance)continue;
            distance=d;best={mesh,indices:ids,bary:T.Triangle.getBarycoord(hit,...points,v()),point:hit.clone(),normal:normal.clone(),frame:frame.clone()};
        }
    });
    if(!best)throw Error(side+' palm surface could not be measured.');
    const entries=surfaceCache.get(best.mesh.geometry)||{};entries[side]={indices:[...best.indices],bary:best.bary.clone()};surfaceCache.set(best.mesh.geometry,entries);
    return surfaceFrame(best);
}

export function palmWorldPosition(sample,target=v()){
    const {mesh,indices,bary}=sample;mesh.skeleton.update();target.set(0,0,0);
    for(let i=0;i<3;i++)target.addScaledVector(mesh.getVertexPosition(indices[i],v()),bary.getComponent(i));
    return mesh.localToWorld(target);
}
export function palmWorldNormal(sample,target=v()){
    const {mesh,indices}=sample;mesh.skeleton.update();
    const points=indices.map(i=>mesh.localToWorld(mesh.getVertexPosition(i,v())));
    return target.subVectors(points[1],points[0]).cross(points[2].clone().sub(points[0])).normalize();
}

function gunSurface(model,origin,direction){
    model.updateMatrixWorld(true);const ray=new T.Raycaster(model.localToWorld(origin.clone()),direction.clone().transformDirection(model.matrixWorld));
    const meshes=[];model.traverse(n=>{if(n.isMesh&&n.visible&&!/Holo|muzzle/i.test(n.name))meshes.push(n);});
    const hit=ray.intersectObjects(meshes,false)[0];
    if(!hit)throw Error('M4 grip surface was not found.');
    return model.worldToLocal(hit.point.clone());
}

export function measureM4GripSurfaces(model){
    // Origins are outside the grip/fore-end. The returned points lie on the
    // actual mesh, rather than being wrist coordinates or empty-space markers.
    let support=null;
    // Avoid putting the palm through a vent and onto an inner handguard face.
    // Sample the outer rail and retain its lowest physical contact patch.
    for(const z of [-.28,-.27,-.26,-.25]){
        const point=gunSurface(model,new T.Vector3(0,-.15,z),new T.Vector3(0,1,0));
        if(!support||point.y<support.y-.0001)support=point;
    }
    return {
        Right:{point:gunSurface(model,new T.Vector3(.15,-.025,.018),new T.Vector3(-1,0,0)),normal:new T.Vector3(-1,0,0)},
        Left:{point:support,normal:new T.Vector3(0,1,0)},
    };
}

export function bindPalmGripFrames(rig,model,{shared=false}={}){
    if((rig.animatedSlot!=='assault'&&!shared)||!rig.palmReferences?.rifle)return null;
    if(!model.getObjectByName('anchor_grip')||!model.getObjectByName('anchor_fore'))return null;
    rig.palmGripBindings ||= new WeakMap();if(rig.palmGripBindings.has(model))return rig.palmGripBindings.get(model);
    const surfaces=measureM4GripSurfaces(model),bindings={};
    for(const side of ['Right','Left']){
        const reference=rig.palmReferences.rifle[side],surface=surfaces[side];
        const before=reference.sample.normal.clone().applyQuaternion(reference.handInGun);
        const handInGun=q().setFromUnitVectors(before,surface.normal).multiply(reference.handInGun).normalize();
        const anchor=new T.Object3D();anchor.name=side==='Right'?'grip_contact_trigger':'grip_contact_support';
        anchor.position.copy(surface.point);anchor.quaternion.copy(handInGun).multiply(reference.sample.frame);model.add(anchor);
        bindings[side]={anchor,sample:reference.sample,handInGun,normal:surface.normal,referenceHand:reference.handInGun};
    }
    rig.palmGripBindings.set(model,bindings);return bindings;
}

export function keepPalmTargetsReachable(rig,model,bindings,guides,support=true){
    const rotation=model.getWorldQuaternion(q()),limits=[];
    for(const side of support?['Right','Left']:['Right']){
        if(guides[side]?.contact)continue;
        const binding=bindings[side],hand=rig.bones[side+'Hand'],upper=rig.bones[side+'Arm'],lower=rig.bones[side+'ForeArm'];
        const handRotation=binding.anchor.getWorldQuaternion(q()).multiply(binding.sample.frame.clone().invert());
        if(guides[side]?.rotation)handRotation.multiply(q().setFromEuler(new T.Euler(...guides[side].rotation)));
        const target=binding.anchor.getWorldPosition(v()).sub(binding.sample.point.clone().multiply(hand.getWorldScale(v())).applyQuaternion(handRotation));
        if(guides[side]?.position)target.add(new T.Vector3().fromArray(guides[side].position).applyQuaternion(rotation));
        const shoulder=upper.getWorldPosition(v()),elbow=lower.getWorldPosition(v());
        limits.push({shoulder,target,radius:(shoulder.distanceTo(elbow)+elbow.distanceTo(hand.getWorldPosition(v())))*.985});
    }
    const shift=v();
    for(let pass=0;pass<5;pass++)for(const {shoulder,target,radius} of limits){
        const delta=target.clone().add(shift).sub(shoulder),distance=delta.length();
        if(distance>radius)shift.addScaledVector(delta,(radius-distance)/distance);
    }
    // Only a small carry correction is allowed. Do not stretch the skeleton or
    // silently pull a badly authored/explicitly edited weapon across the body.
    shift.clampLength(0,.15);
    if(shift.lengthSq()>1e-12){model.position.copy(model.parent.worldToLocal(model.getWorldPosition(v()).add(shift)));model.updateMatrixWorld(true);}
    return shift;
}

export function isM4StandingIdle(rig,state={}){
    return rig.animatedSlot==='assault'&&['idle','rifleReadyIdle'].includes(rig.animator?.current)&&
        !state.isCrouching&&!state.isReloading&&!state.isFiring&&state.isGrounded!==false&&
        Math.abs(state.lean||0)<.01&&(state.speed||0)<.15;
}
function referenceJoint(rig,side,name,state){
    const poses=rig.animator.holdingPoses,ads=T.MathUtils.clamp(state.adsProgress??(state.isAiming?1:0),0,1);
    const aim=poses.rifle.get(side+name),ready=poses.rifleReady?.get(side+name)||aim;
    return ready.clone().slerp(aim,state.isFiring||isM4StandingIdle(rig,state)?1:ads);
}

// Locomotion clips can contain a different carry pose (including raised wrists
// and axial forearm roll). A wrist constraint cannot repair that upstream pose.
// Start the complete holding chains from our calibrated carry/ADS references;
// retain the clip's torso, hips and legs, then solve the hands to the weapon.
export function prepareM4HoldingArms(rig,state={}){
    if(rig.animatedSlot!=='assault'||!rig.palmReferences?.rifle||!rig.animator?.holdingPoses?.rifle||
        state.isReloading||['reload','throw','hit'].includes(rig.animator.current))return;
    const standingIdle=isM4StandingIdle(rig,state);
    const moving=/run|walk|strafe/i.test(rig.animator.current||'');
    const ads=T.MathUtils.clamp(state.adsProgress??(state.isAiming?1:0),0,1);
    // The ready-idle source is a steep resting carry. Locomotion uses a lowered
    // version of the shoulder-ready chain rather than that vertical rest pose.
    const reference=moving?{...state,adsProgress:1}:state;
    for(const side of ['Left','Right'])for(const name of ['Shoulder','Arm','ForeArm','Hand']){
        rig.bones[side+name].quaternion.copy(referenceJoint(rig,side,name,reference));
    }
    rig.object.updateMatrixWorld(true);
    if(moving||standingIdle){
        const axis=new T.Vector3(1,0,0).applyQuaternion(rig.object.getWorldQuaternion(q()));
        const lower=q().setFromAxisAngle(axis,(standingIdle?.22:.35)*(1-(state.isFiring?1:ads)));
        for(const side of ['Left','Right']){
            const shoulder=rig.bones[side+'Shoulder'];
            rig.setWorldRotation(shoulder,lower.clone().multiply(shoulder.getWorldQuaternion(q())));
        }
        rig.object.updateMatrixWorld(true);
    }
}
export function preferredElbow(rig,side,target,rotation,guide,state){
    const hand=rig.bones[side+'Hand'],lower=rig.bones[side+'ForeArm'],upper=rig.bones[side+'Arm'];
    const length=lower.getWorldPosition(v()).distanceTo(hand.getWorldPosition(v()));
    const forearmFrame=rotation.clone().multiply(referenceJoint(rig,side,'Hand',state).invert());
    const direction=hand.position.clone().normalize().applyQuaternion(forearmFrame);
    const ideal=target.clone().addScaledVector(direction,-length);
    const local=rig.object.worldToLocal(ideal.clone()),shoulder=rig.object.worldToLocal(upper.getWorldPosition(v()));
    local.x=side==='Left'?Math.max(.13,local.x):Math.min(-.13,local.x);
    local.y=T.MathUtils.clamp(local.y,shoulder.y-.38,shoulder.y-.02);local.z=Math.max(.04,local.z);
    const pole=rig.object.localToWorld(local);
    if(guide?.elbowTarget)pole.add(new T.Vector3().fromArray(guide.elbowTarget).applyQuaternion(rig.object.getWorldQuaternion(q())));
    return pole;
}

function boundedRoll(current,desired,axis,limit){
    const delta=desired.clone().multiply(current.clone().invert()).normalize();
    let angle=2*Math.atan2(delta.x*axis.x+delta.y*axis.y+delta.z*axis.z,delta.w);
    angle=T.MathUtils.euclideanModulo(angle+Math.PI,Math.PI*2)-Math.PI;
    angle=T.MathUtils.clamp(angle,-limit,limit);
    return {rotation:q().setFromAxisAngle(axis,angle).multiply(current),angle};
}
export function referenceArmFrames(rig,side,rotation,state){
    const reference=name=>referenceJoint(rig,side,name,state);
    const upper=rig.bones[side+'Arm'],lower=rig.bones[side+'ForeArm'],hand=rig.bones[side+'Hand'];
    const lowerAxis=hand.getWorldPosition(v()).sub(lower.getWorldPosition(v())).normalize();
    const forearm=boundedRoll(lower.getWorldQuaternion(q()),rotation.clone().multiply(reference('Hand').invert()),lowerAxis,T.MathUtils.degToRad(65));
    // Compare against the bent, authored elbow frame, not the straight bind pose.
    // Rolling either segment about its own length leaves both joint positions fixed.
    const upperAxis=lower.getWorldPosition(v()).sub(upper.getWorldPosition(v())).normalize();
    const shoulder=boundedRoll(upper.getWorldQuaternion(q()),forearm.rotation.clone().multiply(reference('ForeArm').invert()),upperAxis,T.MathUtils.degToRad(55));
    rig.setWorldRotation(upper,shoulder.rotation);rig.setWorldRotation(lower,forearm.rotation);rig.setWorldRotation(hand,rotation);
    return {forearm:forearm.angle,upper:shoulder.angle};
}

export function fitPalmGrip(rig,model,side,binding,guide,state={}){
    const hand=rig.bones[side+'Hand'],upper=rig.bones[side+'Arm'],lower=rig.bones[side+'ForeArm'];
    const modelRotation=model.getWorldQuaternion(q());
    const rotation=binding.anchor.getWorldQuaternion(q()).multiply(binding.sample.frame.clone().invert());
    if(guide?.rotation)rotation.multiply(q().setFromEuler(new T.Euler(...guide.rotation)));
    const point=binding.anchor.getWorldPosition(v());
    if(guide?.position)point.add(new T.Vector3().fromArray(guide.position).applyQuaternion(modelRotation));
    const scale=hand.getWorldScale(v());
    const wrist=point.clone().sub(binding.sample.point.clone().multiply(scale).applyQuaternion(rotation));
    const pole=preferredElbow(rig,side,wrist,rotation,guide,state);
    let error=Infinity,iterations=0,roll;
    for(;iterations<4;iterations++){
        rig.solveIK(upper,lower,hand,wrist,pole);rig.setWorldRotation(hand,rotation);
        if(iterations===0)roll=referenceArmFrames(rig,side,rotation,state);
        rig.object.updateMatrixWorld(true);
        const residual=point.clone().sub(palmWorldPosition(binding.sample));error=residual.length();
        if(error<.0005)break;
        wrist.add(residual);
    }
    return {point,rotation,pole,error,roll,iterations:Math.min(4,iterations+1),actual:palmWorldPosition(binding.sample),wrist:hand.getWorldPosition(v())};
}
