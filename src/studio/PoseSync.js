const CHANNEL='fast-snipe-pose-sync-v1';
// Explicit request/ack makes an old game bundle distinguishable from a saved
// profile that a current game actually received. Storage remains the source of truth.
export function connectGamePoseSync(weapon){
    if(typeof window.BroadcastChannel!=='function')return null;
    const channel=new window.BroadcastChannel(CHANNEL);
    channel.onmessage=({data})=>{
        if(data?.type!=='peek-saved'||typeof data.requestId!=='string'||typeof data.key!=='string')return;
        weapon.refreshSavedPoses();
        channel.postMessage({type:'peek-applied',requestId:data.requestId,
            matches:JSON.stringify(weapon.poseLibrary.peekPoses?.[data.key])===data.pose,
            thirdPerson:!!weapon.thirdPerson});
    };
    window.addEventListener('pagehide',()=>channel.close(),{once:true});return channel;
}
export function confirmPeekSave(key,pose,timeout=1100){
    if(typeof window.BroadcastChannel!=='function')return Promise.resolve({received:false});
    return new Promise(resolve=>{
        const channel=new window.BroadcastChannel(CHANNEL),requestId=crypto.randomUUID();let finished=false;
        const finish=result=>{if(finished)return;finished=true;clearTimeout(timer);channel.close();resolve(result);};
        const timer=setTimeout(()=>finish({received:false}),timeout);
        channel.onmessage=({data})=>{if(data?.type==='peek-applied'&&data.requestId===requestId)finish({received:true,matches:!!data.matches,thirdPerson:!!data.thirdPerson});};
        channel.postMessage({type:'peek-saved',requestId,key,pose:JSON.stringify(pose)});
    });
}
