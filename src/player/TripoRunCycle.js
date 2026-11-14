import {AnimationClip} from 'three';
// Active middle gait cycle only; keep every track, including constant channels.
// No joint offsets, filtering, IK or endpoint pose correction.
export const TRIPO_RUN_RANGE={startFrame:63,endFrame:80,fps:24};
export function trimTripoRun(source){
 const {startFrame,endFrame,fps}=TRIPO_RUN_RANGE,start=startFrame/fps,end=endFrame/fps;
 const tracks=source.tracks.map(track=>{
  const times=[0],values=Array.from(track.createInterpolant().evaluate(start)),width=track.getValueSize();
  for(let i=0;i<track.times.length;i++)if(track.times[i]>start&&track.times[i]<end){times.push(track.times[i]-start);values.push(...track.values.slice(i*width,(i+1)*width));}
  times.push(end-start);values.push(...track.createInterpolant().evaluate(end));
  return new track.constructor(track.name,times,values,track.getInterpolation());
 });
 return new AnimationClip(source.name,end-start,tracks);
}
