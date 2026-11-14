import fs from 'node:fs';import * as T from 'three';import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
const b=fs.readFileSync('public/assets/comparison/tripo-playable.glb'),a=await new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),''),clip=a.animations.find(c=>c.name==='Tripo_Run');
const tracks=clip.tracks.filter(t=>t.name.endsWith('.quaternion')&&/Hips|Spine|Arm|Hand\.|UpLeg|Leg\.|Foot/.test(t.name));
const samples=Array.from({length:120},(_,i)=>tracks.map(t=>new T.Quaternion().fromArray(t.createInterpolant().evaluate(i/24))));
for(let f=0;f<110;f+=10){const vel=samples.slice(f,f+10).reduce((sum,s,k)=>sum+(f+k?tracks.reduce((n,t,j)=>n+(/Leg|Foot/.test(t.name)?s[j].angleTo(samples[f+k-1][j]):0),0):0),0)/10;console.log('leg motion',f,vel);}
const choices=[];
for(let i=32;i<80;i++)for(let j=i+14;j<=Math.min(i+30,100);j++){
 let pose=0,velocity=0;
 for(let k=0;k<tracks.length;k++){
  const w=/Leg|Foot/.test(tracks[k].name)?3:1,qa=samples[i][k],qb=samples[j][k];pose+=w*qa.angleTo(qb)**2;
  const va=samples[i+1][k].clone().multiply(qa.clone().invert()),vb=samples[j+1][k].clone().multiply(qb.clone().invert());velocity+=w*va.angleTo(vb)**2;
 }
 choices.push({i,j,pose,velocity,score:pose+velocity*3});
}
choices.sort((a,b)=>a.score-b.score);console.log(choices.slice(0,8));
