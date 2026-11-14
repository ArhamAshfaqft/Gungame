import * as T from 'three';
import data from './MilitiaGrenadeData.js';

const ease=t=>{t=T.MathUtils.clamp(t,0,1);return t*t*(3-2*t);};
function at(seconds,side){
    const frame=T.MathUtils.clamp(seconds/data.duration,0,1)*(data.samples.length-1);
    const i=Math.min(data.samples.length-2,Math.floor(frame)),t=frame-i;
    const a=data.samples[i][side],b=data.samples[i+1][side];
    return {wrist:new T.Vector3().fromArray(a.wrist).lerp(new T.Vector3().fromArray(b.wrist),t),
        upper:new T.Vector3().fromArray(a.upper).lerp(new T.Vector3().fromArray(b.upper),t).normalize(),
        rotation:new T.Quaternion().fromArray(a.rotation).slerp(new T.Quaternion().fromArray(b.rotation),t)};
}
const starts={Right:at(data.start,'Right'),Left:at(data.start,'Left')};

// Chest-relative motion only. Preserve the target skeleton's limb lengths and
// gait, and map the source's forward swing just after peak hand speed onto the game's release point.
export function sampleMilitiaThrow(progress,side='Right',release=.46){
    const p=T.MathUtils.clamp(progress,0,1);
    const span=p<=release?release:1-release,t=p<=release?p/span:(p-release)/span;
    const a=p<=release?data.start:data.release,b=p<=release?data.release:data.end;
    const middle=data.end-data.start;
    const m0=p<=release?(data.release-data.start)/release:middle;
    const m1=p<=release?middle:(data.end-data.release)/(1-release);
    // A shared slope at release avoids a sudden speed change in the swing.
    const seconds=(2*t*t*t-3*t*t+1)*a+(t*t*t-2*t*t+t)*span*m0
        +(-2*t*t*t+3*t*t)*b+(t*t*t-t*t)*span*m1;
    const sample=at(seconds,side),start=starts[side];
    const weight=ease(p/.12)*(1-ease((p-.72)/.28));
    const offset=sample.wrist.sub(start.wrist).multiply(new T.Vector3(.65,.72,1)).multiplyScalar(weight);
    const rotation=sample.rotation.multiply(start.rotation.clone().invert());
    // The source's wrist axes and proportions differ. Limit the retargeted roll
    // rather than forcing the SWAT glove through a full creature-wrist turn.
    const angle=rotation.angleTo(new T.Quaternion());
    rotation.slerp(new T.Quaternion(),1-Math.min(1,1.1/Math.max(angle,1e-6))*weight);
    return {offset,pole:sample.upper,rotation,weight,sourceTime:seconds};
}
