import {validateHandContact} from './HandContact.js';
import * as T from 'three';

export const GUN_STATES = ['hip','fire','aim'];
export const STATE_LABELS = {hip:'Ready / no firing',fire:'Fire without ADS',aim:'ADS / aiming or firing'};
export const BODY_JOINTS = ['Hips','Spine','Spine1','Spine2','Neck','Head','LeftUpLeg','RightUpLeg','LeftLeg','RightLeg','LeftFoot','RightFoot','LeftToeBase','RightToeBase'];
export const animationKey = (slot,clip,state) => `${slot}|${clip}|${state}`;
export const emptyBody = () => Object.fromEntries(BODY_JOINTS.map(name=>[name,{position:[0,0,0],rotation:[0,0,0]}]));
export function editableFit(fit){
    const out=structuredClone(fit);out.body ||= emptyBody();
    for(const side of ['Left','Right'])for(const field of ['handRotation','thumbRotation','shoulder','elbow','elbowTarget','shoulderRotation','elbowRotation'])out[side][field] ||= [0,0,0];
    return out;
}
export function ensureAnimationEdit(library,slot,clip,state,fallback){
    const key=animationKey(slot,clip,state);library.animationEdits ||= {};
    return library.animationEdits[key] ||= {pose:editableFit(fallback),keyframes:[],supportIK:true,pinTrigger:true,crouchAssist:true};
}
export function mixFits(a,b,t){
    if(t<=0)return a;if(t>=1)return b;
    function mix(x,y,key=''){
        if(Array.isArray(x)){
            if(/rotation/i.test(key)){
                const q=new T.Quaternion().setFromEuler(new T.Euler(...x)).slerp(new T.Quaternion().setFromEuler(new T.Euler(...y)),t);
                const e=new T.Euler().setFromQuaternion(q);return [e.x,e.y,e.z];
            }
            return x.map((n,i)=>n+(y[i]-n)*t);
        }
        if(x===null||y===null)return t<.5?x:y;
        if(typeof x==='boolean')return t<.5?x:y;
        if(typeof x==='number')return x+(y-x)*t;
        return Object.fromEntries(Object.keys(x).map(k=>[k,mix(x[k],y?.[k]??x[k],k)]));
    }
    return mix(editableFit(a),editableFit(b));
}
export function sampleAnimationEdit(edit,time=0){
    if(!edit.keyframes.length)return edit.pose;
    const frames=edit.keyframes[0].time>0?[{time:0,pose:edit.pose},...edit.keyframes]:edit.keyframes;
    if(time<=frames[0].time)return frames[0].pose;
    for(let i=1;i<frames.length;i++)if(time<=frames[i].time)return mixFits(frames[i-1].pose,frames[i].pose,(time-frames[i-1].time)/(frames[i].time-frames[i-1].time));
    return frames.at(-1).pose;
}
export function resolveAnimationFit(library,slot,clip,state,time,fallback){
    const edit=library.animationEdits?.[animationKey(slot,clip,state)]||library.animationEdits?.[animationKey(slot,'*',state)];
    return edit?{...sampleAnimationEdit(edit,time),supportIK:edit.supportIK,pinTrigger:edit.pinTrigger,crouchAssist:edit.crouchAssist}:editableFit(fallback);
}
export function validateAnimationEdits(input,base){
    const out={};if(input==null)return out;
    if(typeof input!=='object'||Array.isArray(input)||Object.keys(input).length>3000)throw Error('Invalid animation library.');
    for(const [key,entry] of Object.entries(input)){
        const [slot,clip,state,...extra]=key.split('|');
        if(extra.length||!['primary','pistol','assault','frag','flash','smoke'].includes(slot)||!/^([\w-]{1,80}|\*)$/.test(clip)||!['hip','fire','aim','hold','pin','high','low'].includes(state))throw Error('Invalid animation selection.');
        const shape=editableFit(base(slot,state,clip));
        function validate(source,template,field=''){
            if(field.endsWith('.contact'))return validateHandContact(source);
            if(Array.isArray(template)){
                const limit=/position|shoulder$|elbow$|elbowTarget/i.test(field)?.6:/fingers/.test(field)?1.6:Math.PI;
                if(!Array.isArray(source)||source.length!==3||source.some(n=>!Number.isFinite(n)||Math.abs(n)>limit))throw Error('Invalid animation coordinate.');
                return [...source];
            }
            if(template===null){
                if(source==null)return null;
                const point=v=>Array.isArray(v)&&v.length===3&&v.every(n=>Number.isFinite(n)&&Math.abs(n)<=20);
                if(!point(source.weaponPoint)||!point(source.palmPoint))throw Error('Invalid palm marker.');
                return {weaponPoint:[...source.weaponPoint],palmPoint:[...source.palmPoint]};
            }
            return Object.fromEntries(Object.entries(template).map(([k,v])=>[k,validate(source&&Object.hasOwn(source,k)?source[k]:v,v,field+'.'+k)]));
        }
        const frames=entry.keyframes||[];
        if(!Array.isArray(frames)||frames.length>240)throw Error('An animation supports up to 240 keyframes.');
        const keyframes=frames.map(frame=>{
            if(!Number.isFinite(frame.time)||frame.time<0||frame.time>300)throw Error('Invalid keyframe time.');
            return {time:frame.time,pose:validate(frame.pose,shape)};
        }).sort((a,b)=>a.time-b.time);
        if(keyframes.some((f,i)=>i&&f.time===keyframes[i-1].time))throw Error('Duplicate keyframe time.');
        for(const flag of ['supportIK','pinTrigger','crouchAssist'])if(entry[flag]!=null&&typeof entry[flag]!=='boolean')throw Error('Invalid animation option.');
        out[key]={pose:validate(entry.pose,shape),keyframes,supportIK:entry.supportIK??true,pinTrigger:entry.pinTrigger??true,crouchAssist:entry.crouchAssist??true};
    }
    return out;
}
