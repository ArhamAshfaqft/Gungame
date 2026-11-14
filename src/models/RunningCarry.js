import * as T from 'three';

const arms=/^(Left|Right)(Arm|ForeArm|Hand.*)$/;

// A small weight-bearing adjustment. Filtering the correction retains the gait's
// authored torso sway instead of clamping the chest to a fixed orientation.
export function balanceRunningTorso(rig,state={},delta=0) {
    const blocked=rig.animatedKind!=='rifle'||state.isAiming||state.isReloading||state.isCrouching||state.isSliding||state.isGrounded===false||state.actionActive;
    if(blocked){rig.runBalance=0;return;}
    const moving=(state.speed||0)>2.2;
    let target=0;
    const rootRotation=rig.object.getWorldQuaternion(new T.Quaternion());
    const direction=new T.Vector3(state.lateral||0,0,state.forward??1).normalize().applyQuaternion(rootRotation);
    if(moving){
        const trunk=rig.bones.Spine2.getWorldPosition(new T.Vector3()).sub(rig.bones.Hips.getWorldPosition(new T.Vector3()));
        const lean=Math.atan2(trunk.dot(direction),Math.max(.1,trunk.y));
        target=T.MathUtils.clamp((state.isSprinting?.28:.17)-lean,-.17,.22);
    }
    rig.runBalance=delta>0?T.MathUtils.damp(rig.runBalance||0,target,4,delta):target;
    if(Math.abs(rig.runBalance)<.0001)return;
    const spine=rig.bones.Spine,axis=new T.Vector3(direction.z,0,-direction.x).normalize();
    const rotation=spine.getWorldQuaternion(new T.Quaternion()).premultiply(new T.Quaternion().setFromAxisAngle(axis,rig.runBalance));
    const parent=spine.parent.getWorldQuaternion(new T.Quaternion()).invert();spine.quaternion.copy(parent.multiply(rotation));spine.updateMatrixWorld(true);
}

// Fit the armed carry to the active gait's phase. Hips, spine, shoulders and
// head retain their authored motion; there is no independent upper-body clock.
export class RunningCarry {
    constructor(rig,pack) {
        this.rig=rig;this.weight=0;this.time=0;this.phase=0;this.offsets=new Map();
        this.sources=new Map();
        for(const id of ['rifleRunReady','rifleRunFootwork']){
            const clip=pack.clips.find(c=>c.id===id);if(!clip)continue;
            this.sources.set(id,{clip,tracks:clip.tracks.filter(t=>t.property==='quaternion'&&arms.test(t.bone))
                .map(t=>({bone:rig.bones[t.bone],sample:new T.QuaternionKeyframeTrack('carry',t.times,t.values).createInterpolant(),target:new T.Quaternion()}))});
        }
        this.clip=this.sources.get('rifleRunReady')?.clip;
    }
    apply(delta,state={},preview=null) {
        const equipment=state.equipment||this.rig.animatedKind||'rifle';
        const blocked=equipment!=='rifle'||state.isAiming||state.isReloading||state.actionActive||state.isCrouching||state.isSliding||state.isGrounded===false||state.clip;
        if(!this.clip||blocked){this.weight=0;return false;}
        const moving=(state.speed||0)>2.2;
        this.weight=preview?Number(moving):T.MathUtils.damp(this.weight,moving?1:0,14,delta);
        if(this.weight<.0001){this.weight=0;return false;}if(this.weight>.9999)this.weight=1;
        const source=this.sources.get(state.isSprinting?'rifleRunFootwork':'rifleRunReady')||this.sources.get('rifleRunReady');
        this.clip=source.clip;this.time+=delta;
        const animator=this.rig.animator,current=animator?.current,action=animator?.actions.get(current),duration=animator?.clips.get(current)?.duration||source.clip.duration;
        const key=source.clip.id+':'+current;
        if(!this.offsets.has(key))this.offsets.set(key,current&&current!==source.clip.id&&animator?.phaseTracks.has(current)
            ?animator.matchPhase(source.clip.id,current,0)/source.clip.duration:0);
        this.phase=((preview?.phase??((action?.time||0)/duration))+this.offsets.get(key))%1;
        const time=this.phase*source.clip.duration;
        const transition=animator?.transition;
        const fade=transition?T.MathUtils.smoothstep(transition.elapsed/transition.duration,0,1):1;
        for(const track of source.tracks)if(track.bone){
            track.target.fromArray(track.sample.evaluate(time)).normalize();
            track.bone.quaternion.slerp(track.target,this.weight*fade);
        }
        return true;
    }
}
