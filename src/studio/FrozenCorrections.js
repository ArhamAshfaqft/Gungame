import {animationKey} from './AnimationEdits.js';
import {peekKey} from './PeekPoses.js';

// A whole-pose correction shifts existing keys as well as the base, otherwise an
// exact key at the frozen time would silently mask the edited control. Rebuild
// from the pre-edit snapshot so successive slider input events do not compound.
function deltaPose(pose,before,after,path=''){
    if(JSON.stringify(before)===JSON.stringify(after))return structuredClone(pose);
    if(path.endsWith('.contact'))return structuredClone(after??null);
    if(Array.isArray(pose)){
        const limit=/position|shoulder$|elbow(Target)?$/i.test(path)?.6:/fingers/.test(path)?1.6:Math.PI;
        return pose.map((n,i)=>Math.max(-limit,Math.min(limit,n+(after?.[i]??before?.[i]??0)-(before?.[i]??0))));
    }
    if(typeof pose==='number')return Math.max(0,Math.min(1.5,pose+(after??before??0)-(before??0)));
    if(pose===null)return null;
    return Object.fromEntries(Object.entries(pose).map(([key,value])=>[key,deltaPose(value,before?.[key],after?.[key],path+'.'+key)]));
}
export function propagateFrozenBase(before,after,context){
    const key=context.side?peekKey(context.slot,context.posture,context.side,['hip','fire','aim'].includes(context.state)?context.state:'hip'):animationKey(context.slot,context.clip,context.state);
    const sourceBase=context.side?before.peekPoses?.[key]:before.animationEdits?.[key]?.pose;
    const targetBase=context.side?after.peekPoses?.[key]:after.animationEdits?.[key]?.pose;
    const sourceFrames=context.side?before.peekTimelines?.[key]:before.animationEdits?.[key]?.keyframes;
    const targetFrames=context.side?after.peekTimelines?.[key]:after.animationEdits?.[key]?.keyframes;
    if(!sourceBase||!targetBase||!sourceFrames?.length||!targetFrames?.length||JSON.stringify(sourceBase)===JSON.stringify(targetBase))return;
    for(const frame of targetFrames){
        const original=sourceFrames.find(f=>f.time===frame.time);
        if(original)frame.pose=deltaPose(original.pose,sourceBase,targetBase);
    }
}
