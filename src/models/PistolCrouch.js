import * as THREE from 'three';

export const PISTOL_CROUCH_SOURCES = {
    pistolCrouchIdle:'rifleCrouchIdle', pistolCrouchWalk:'rifleCrouchWalk',
    pistolCrouchBack:'rifleCrouchBack', pistolCrouchLeft:'rifleCrouchLeft', pistolCrouchRight:'rifleCrouchRight',
    pistolCrouchForwardLeft:'rifleCrouchWalkForwardLeft', pistolCrouchForwardRight:'rifleCrouchWalkForwardRight',
    pistolCrouchRun:'rifleCrouchRunAlt', pistolStandToCrouch:'rifleStandToCrouch', pistolCrouchToStand:'rifleCrouchToStand',
};
const cache=new WeakMap();
const lowerBody = bone => bone==='Hips' || /^(Left|Right)(UpLeg|Leg|Foot|ToeBase)/.test(bone);

// Keep actual crouch footwork and bone translations. Replace only upper-body
// rotations, compensating the pelvis so the pistol torso stays facing forward.
export function composePistolCrouch(clips) {
    const pistol=clips.find(c=>c.id==='pistolIdle');if(!pistol)return [];
    return Object.entries(PISTOL_CROUCH_SOURCES).flatMap(([id,sourceId])=>{
        if(clips.some(c=>c.id===id))return [];
        const lower=clips.find(c=>c.id===sourceId);if(!lower)return [];
        let variants=cache.get(lower);if(!variants){variants=new WeakMap();cache.set(lower,variants);}
        if(variants.has(pistol))return [variants.get(pistol)];
        const hips=lower.tracks.find(t=>t.bone==='Hips'&&t.property==='quaternion');
        const pistolHips=pistol.tracks.find(t=>t.bone==='Hips'&&t.property==='quaternion');
        if(!hips||!pistolHips)return [];
        const interpolant=t=>new THREE.QuaternionKeyframeTrack('q',t.times,t.values).createInterpolant();
        const pelvis=interpolant(hips),referencePelvis=new THREE.Quaternion().fromArray(interpolant(pistolHips).evaluate(0));
        const tracks=lower.tracks.filter(t=>lowerBody(t.bone));
        for(const track of pistol.tracks.filter(t=>!lowerBody(t.bone)&&t.property==='quaternion')){
            const sample=interpolant(track),times=[],values=[],frames=Math.ceil(lower.duration*60);
            for(let i=0;i<=frames;i++){
                const time=i/frames*lower.duration;
                const q=new THREE.Quaternion().fromArray(sample.evaluate(time/lower.duration*pistol.duration));
                if(track.bone==='Spine')q.premultiply(new THREE.Quaternion().fromArray(pelvis.evaluate(time)).invert().multiply(referencePelvis));
                times.push(time);q.normalize().toArray(values,values.length);
            }
            tracks.push({...track,times,values});
        }
        const clip={...lower,id,name:`pistol crouch — ${id.replace(/^pistol/,'').replace(/([A-Z])/g,' $1').trim().toLowerCase()} (composed)`,
            sourceFile:lower.sourceFile,composedFrom:[sourceId,'pistolIdle'],tracks};
        variants.set(pistol,clip);return [clip];
    });
}
