import * as THREE from 'three';
import { pistolReloadState, pistolReloadMotion } from '../models/PistolReload.js';
const clone = value => JSON.parse(JSON.stringify(value));
const vector = () => [0, 0, 0];
export function timelinePose() {
    const hand = () => ({ position: vector(), rotation: vector(), shoulder: vector(), elbow: vector(), handRotation: vector(), shoulderRotation: vector(), elbowRotation: vector(), fingers: Object.fromEntries(['Thumb', 'Index', 'Middle', 'Ring', 'Pinky'].map(f => [f, vector()])) });
    return { weapon: { position: vector(), rotation: vector() }, Left: hand(), Right: hand() };
}
export function defaultReloadSequence() {
    const duration = 1.15;
    return clone({ version: 1, duration, keys: [[0,'Ready'],[.16,'Grab'],[.36,'Remove'],[.47,'Exchange'],[.56,'New magazine'],[.76,'Seat'],[.825,'Slide'],[.92,'Return'],[1,'Ready']].map(([phase,label]) => {
        const state = pistolReloadState(phase), motion = pistolReloadMotion(phase), pose = timelinePose();
        pose.weapon.position = state.groupPosition.toArray(); pose.weapon.rotation = [state.groupRotation.x,state.groupRotation.y,state.groupRotation.z]; pose.Left.position = motion.hands.Left.position.toArray();
        return { time: +(phase*duration).toFixed(4), label, easing: 'smooth', pose,
            magazine: { position: [0,-state.magazineDrop,0], rotation: vector(), visible: state.magazineVisible, attachment: 'weapon', handPosition: vector(), handRotation: vector() }, slide: state.slide*.025 };
    }), events: [{ time: .2, type: 'sound' }, { time: .87, type: 'ammo' }] });
}
function validVector(value, limit) {
    if (!Array.isArray(value)||value.length!==3||value.some(n=>typeof n!=='number'||!Number.isFinite(n)||Math.abs(n)>limit)) throw new Error('Invalid timeline coordinate.');
    return [...value];
}
export function validateReloadSequence(value) {
    if(value?.version!==1||!Number.isFinite(value.duration)||value.duration<.5||value.duration>6||!Array.isArray(value.keys)||value.keys.length<2||value.keys.length>100) throw new Error('Invalid reload timeline.');
    const out={version:1,duration:value.duration,keys:[],events:[]};
    for(const key of value.keys){
        if(!Number.isFinite(key.time)||key.time<0||key.time>value.duration||out.keys.some(k=>Math.abs(k.time-key.time)<.00001)) throw new Error('Keys need unique times within the timeline.');
        const pose=timelinePose();
        for(const part of ['weapon','Left','Right']){
            for(const field of ['position','rotation']) pose[part][field]=validVector(key.pose?.[part]?.[field],field==='rotation'?Math.PI:.6);
            if(part==='weapon')continue;
            for(const field of ['shoulder','elbow','handRotation','shoulderRotation','elbowRotation']) pose[part][field]=validVector(key.pose?.[part]?.[field],field.includes('Rotation')?Math.PI:.6);
            for(const finger of Object.keys(pose[part].fingers))pose[part].fingers[finger]=validVector(key.pose?.[part]?.fingers?.[finger],1.6);
        }
        if(!['weapon','leftHand'].includes(key.magazine?.attachment)||typeof key.magazine.visible!=='boolean'||!Number.isFinite(key.slide)||Math.abs(key.slide)>.1)throw new Error('Invalid magazine/slide key.');
        out.keys.push({time:key.time,label:String(key.label||'Pose').slice(0,50),easing:key.easing==='linear'?'linear':'smooth',pose,slide:key.slide,
            magazine:{position:validVector(key.magazine.position,.6),rotation:validVector(key.magazine.rotation,Math.PI),visible:key.magazine.visible,attachment:key.magazine.attachment,handPosition:validVector(key.magazine.handPosition,.6),handRotation:validVector(key.magazine.handRotation,Math.PI)}});
    }
    out.keys.sort((a,b)=>a.time-b.time);
    if(out.keys[0].time!==0||Math.abs(out.keys.at(-1).time-value.duration)>.00001)throw new Error('Timeline needs start and end keys.');
    if(!Array.isArray(value.events)||value.events.length>24)throw new Error('Invalid timeline events.');
    for(const e of value.events){if(!Number.isFinite(e.time)||e.time<0||e.time>value.duration||!['ammo','sound'].includes(e.type))throw new Error('Invalid event.');out.events.push({time:e.time,type:e.type});}
    if(out.events.filter(e=>e.type==='ammo').length!==1)throw new Error('Keep exactly one ammo refill marker.');
    out.events.sort((a,b)=>a.time-b.time);return out;
}
function mix(a,b,t,field=''){
    if(Array.isArray(a)){
        if(/rotation/i.test(field)){const q=new THREE.Quaternion().setFromEuler(new THREE.Euler(...a)).slerp(new THREE.Quaternion().setFromEuler(new THREE.Euler(...b)),t),e=new THREE.Euler().setFromQuaternion(q);return[e.x,e.y,e.z];}
        return a.map((n,i)=>n+(b[i]-n)*t);
    }
    if(a&&typeof a==='object')return Object.fromEntries(Object.keys(a).map(k=>[k,mix(a[k],b[k],t,k)]));
    return typeof a==='number'?a+(b-a)*t:t<1?a:b;
}
export function sampleReloadSequence(sequence,seconds){
    const time=THREE.MathUtils.clamp(seconds,0,sequence.duration),next=sequence.keys.findIndex(k=>k.time>time);
    if(next<0)return clone(sequence.keys.at(-1));
    const a=sequence.keys[Math.max(0,next-1)],b=sequence.keys[next];let t=(time-a.time)/Math.max(.00001,b.time-a.time);
    if (Math.abs(time-a.time)<1e-9) return clone(a);
    if(a.easing!=='linear')t=t*t*(3-2*t);
    const out=mix(a,b,t);out.time=time;out.magazine.attachment=a.magazine.attachment;out.magazine.visible=a.magazine.visible;
    if(a.magazine.attachment!==b.magazine.attachment){out.magazine.handPosition=[...a.magazine.handPosition];out.magazine.handRotation=[...a.magazine.handRotation];}
    return out;
}
export function addTimelinePose(base,offsets){
    const out=clone(base);
    for(const part of ['weapon','Left','Right'])for(const field of Object.keys(offsets[part])){
        if(field==='fingers')for(const finger of Object.keys(offsets[part].fingers))out[part].fingers[finger]=out[part].fingers[finger].map((n,i)=>n+offsets[part].fingers[finger][i]);
        else out[part][field]=out[part][field].map((n,i)=>n+offsets[part][field][i]);
    }return out;
}
export function applySequenceFraming(position,rotation,sample){
    position.add(new THREE.Vector3().fromArray(sample.pose.weapon.position));rotation.x+=sample.pose.weapon.rotation[0];rotation.y+=sample.pose.weapon.rotation[1];rotation.z+=sample.pose.weapon.rotation[2];
}
export function sequenceMotion(progress) {
    return { id: 'pistolReload', coordinated: true, progress, contact: 0,
        hands: Object.fromEntries(['Left','Right'].map(side => [side, { position: new THREE.Vector3(), rotation: new THREE.Quaternion() }])) };
}
export function wristMatrix(hand) {
    // Imported skeletons use centimetre bone scales. Editor offsets are metres.
    return new THREE.Matrix4().compose(hand.getWorldPosition(new THREE.Vector3()),hand.getWorldQuaternion(new THREE.Quaternion()),new THREE.Vector3(1,1,1));
}
export function applySequenceMechanics(model,rig,sample){
    const parts=model?.userData.reloadParts;if(!parts)return;
    parts.magazine.position.copy(parts.magazineRest).add(new THREE.Vector3().fromArray(sample.magazine.position));
    parts.magazine.quaternion.setFromEuler(new THREE.Euler(...sample.magazine.rotation));parts.magazine.visible=sample.magazine.visible;
    parts.slide.position.copy(parts.slideRest);parts.slide.position.z+=sample.slide;
    if(sample.magazine.attachment==='leftHand'&&rig){
        rig.object.updateMatrixWorld(true);model.updateWorldMatrix(true,true);
        const matrix=new THREE.Matrix4().compose(new THREE.Vector3().fromArray(sample.magazine.handPosition),new THREE.Quaternion().setFromEuler(new THREE.Euler(...sample.magazine.handRotation)),new THREE.Vector3(1,1,1));
        matrix.premultiply(wristMatrix(rig.bones.LeftHand)).premultiply(parts.magazine.parent.matrixWorld.clone().invert());
        matrix.decompose(parts.magazine.position,parts.magazine.quaternion,new THREE.Vector3());
    }parts.magazine.updateMatrixWorld(true);
}
