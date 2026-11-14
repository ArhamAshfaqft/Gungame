import * as T from 'three';

// A torso/vest envelope follows the actual pelvis, chest and shoulder line.
// It is used to select the elbow bend plane, never to detach or rotate a palm.
export function torsoEnvelope(rig,root){
    const hips=rig.bones.Hips.getWorldPosition(new T.Vector3()),chest=rig.bones.Spine2.getWorldPosition(new T.Vector3());
    const left=rig.bones.LeftArm.getWorldPosition(new T.Vector3()),right=rig.bones.RightArm.getWorldPosition(new T.Vector3());
    const up=chest.clone().sub(hips).normalize(),across=right.clone().sub(left);
    const width=across.length();across.addScaledVector(up,-across.dot(up)).normalize();
    const front=across.clone().cross(up).normalize();if(front.dot(new T.Vector3(0,0,1).applyQuaternion(root))<0)front.negate();
    return {center:hips.clone().lerp(chest,.58).addScaledVector(front,.025),up,across,front,
        x:Math.max(.16,width*.5-.025),y:hips.distanceTo(chest)*.5+.14,z:.17};
}

export function torsoClearance(point,body,radius=.045){
    const dx=point.x-body.center.x,dy=point.y-body.center.y,dz=point.z-body.center.z;
    const x=dx*body.across.x+dy*body.across.y+dz*body.across.z;
    const y=dx*body.up.x+dy*body.up.y+dz*body.up.z;
    const z=dx*body.front.x+dy*body.front.y+dz*body.front.z;
    return (Math.sqrt((x/(body.x+radius))**2+(y/(body.y+radius))**2+(z/(body.z+radius))**2)-1)*(body.z+radius);
}

export function selectArmPole(rig,side,target,handRotation,preferred,body){
    const a=rig.bones[side+'Arm'].getWorldPosition(new T.Vector3()),b=rig.bones[side+'ForeArm'].getWorldPosition(new T.Vector3()),hand=rig.bones[side+'Hand'];
    const c=hand.getWorldPosition(new T.Vector3()),l1=a.distanceTo(b),l2=b.distanceTo(c);
    const dir=target.clone().sub(a),distance=T.MathUtils.clamp(dir.length(),Math.abs(l1-l2)+.0001,l1+l2-.0001);dir.normalize();
    const along=(l1*l1-l2*l2+distance*distance)/(2*distance),height=Math.sqrt(Math.max(0,l1*l1-along*along));
    const center=a.clone().addScaledVector(dir,along),u=preferred.clone().sub(center);u.addScaledVector(dir,-u.dot(dir));
    if(u.lengthSq()<1e-8)u.crossVectors(dir,new T.Vector3(0,1,0));u.normalize();const v=dir.clone().cross(u).normalize();
    const frame=handRotation.clone().multiply(rig.rest.get(hand).quaternion.clone().invert());
    const wanted=hand.position.clone().normalize().applyQuaternion(frame),elbow=new T.Vector3(),p=new T.Vector3();
    let best=null;
    for(let step=0;step<24;step++){
        const angle=step*Math.PI*2/24;elbow.copy(center).addScaledVector(u,height*Math.cos(angle)).addScaledVector(v,height*Math.sin(angle));
        let clearance=Infinity,penalty=0;
        for(const [start,end,radius,ts] of [[a,elbow,.055,[.4,.6,.8,1]],[elbow,target,.045,[0,.25,.5,.75,1]]])for(const t of ts){
            p.lerpVectors(start,end,t);const gap=torsoClearance(p,body,radius);clearance=Math.min(clearance,gap);if(gap<0)penalty+=gap*gap;
        }
        const fore=target.clone().sub(elbow).normalize(),bend=Math.acos(T.MathUtils.clamp(fore.dot(wanted),-1,1));
        const reachMiss=Math.abs(target.distanceTo(a)-distance);
        const score=penalty*100000+reachMiss*reachMiss*100000+bend*bend*2+elbow.distanceToSquared(preferred)*3+Math.max(0,elbow.y-a.y-.05)**2*4;
        if(!best||score<best.score)best={pole:elbow.clone(),score,clearance,bend,reachMiss};
    }
    return best;
}
