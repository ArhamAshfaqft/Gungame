// Retarget the user's additional animation without including meshes or textures.
import {readFileSync,writeFileSync} from 'node:fs';
import * as THREE from 'three';
import {FBXLoader} from 'three/examples/jsm/loaders/FBXLoader.js';
const sourceFile='Running-new.fbx',bytes=readFileSync(sourceFile);
const source=new FBXLoader().parse(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
const normalize=name=>name.replace(/^mixamorig[:_]?/i,'').replace(/_\d+$/,'');
const glb=readFileSync('public/assets/operators/swat.glb'),json=JSON.parse(glb.subarray(20,20+glb.readUInt32LE(12)).toString());
const targets=new Map(json.skins[0].joints.map(index=>{const node=json.nodes[index],position=new THREE.Vector3(),quaternion=new THREE.Quaternion();if(node.matrix)new THREE.Matrix4().fromArray(node.matrix).decompose(position,quaternion,new THREE.Vector3());else{position.fromArray(node.translation||[0,0,0]);quaternion.fromArray(node.rotation||[0,0,0,1]);}return[normalize(node.name),{position,quaternion}]}));
const bones=new Map();source.traverse(b=>{if(b.isBone)bones.set(normalize(b.name),b)});
const animation=source.animations[0];if(!animation)throw Error('No animation found');
const root=animation.tracks.find(t=>t.name.endsWith('Hips.position'));
const tracks=animation.tracks.flatMap(track=>{
 const [name,property]=track.name.split('.'),bone=normalize(name),target=targets.get(bone),original=bones.get(bone);
 if(!target||!original)throw Error('Unmapped bone '+bone);
 if(property!=='quaternion'&&!(bone==='Hips'&&property==='position'))return[];
 const values=track.values.slice();
 if(property==='quaternion'){const correction=target.quaternion.clone().multiply(original.quaternion.clone().invert());for(let i=0;i<values.length;i+=4)new THREE.Quaternion().fromArray(values,i).premultiply(correction).normalize().toArray(values,i)}
 else for(let i=0;i<values.length;i+=3){values[i]=target.position.x;values[i+2]=target.position.z;values[i+1]+=target.position.y-original.position.y}
 const Type=property==='quaternion'?THREE.QuaternionKeyframeTrack:THREE.VectorKeyframeTrack;
 const converted=new Type(bone+'.'+property,track.times,values);converted.optimize();
 return[{bone,property,times:Array.from(converted.times,n=>+n.toFixed(6)),values:Array.from(converted.values,n=>+n.toFixed(6))}];
});
const oldPack=JSON.parse(readFileSync('public/assets/animations/rifle-run-pack.json'));
const carry=oldPack.clips.find(c=>c.id==='rifleRunReady');
if(!carry)throw Error('Prepare the rifle carry pack first.');
const arms=name=>/^(Left|Right)(Arm|ForeArm|Hand.*)$/.test(name);
const legNames=new Set(['LeftUpLeg','RightUpLeg','LeftLeg','RightLeg']);
const sampleLegs=list=>list.filter(t=>t.property==='quaternion'&&legNames.has(t.bone)).map(t=>({name:t.bone,sample:new THREE.QuaternionKeyframeTrack('phase',t.times,t.values).createInterpolant()}));
const baseLegs=sampleLegs(tracks),carryLegs=sampleLegs(carry.tracks);
let shift=0,best=Infinity;
for(let step=0;step<32;step++){
 let score=0;
 for(let frame=0;frame<16;frame++)for(const leg of baseLegs){
  const other=carryLegs.find(t=>t.name===leg.name);if(!other)continue;
  const a=new THREE.Quaternion().fromArray(leg.sample.evaluate(frame/16*animation.duration)).normalize();
  const b=new THREE.Quaternion().fromArray(other.sample.evaluate(((frame/16+step/32)%1)*carry.duration)).normalize();
  score+=a.angleTo(b)**2;
 }
 if(score<best){best=score;shift=step/32;}
}
// Preserve the new source's hips, spine, neck, shoulders and legs. Only the
// weapon-bearing arms come from the armed run, matched to the footfall phase.
const body=tracks.filter(t=>!arms(t.bone));
const count=Math.ceil(animation.duration*60);
const upper=carry.tracks.filter(t=>arms(t.bone)&&t.property==='quaternion').map(t=>{
 const sample=new THREE.QuaternionKeyframeTrack('arm',t.times,t.values).createInterpolant(),times=[],values=[];
 for(let i=0;i<=count;i++){const phase=i/count;times.push(+(phase*animation.duration).toFixed(7));values.push(...Array.from(sample.evaluate(((phase+shift)%1)*carry.duration),n=>+n.toFixed(6)));}
 return{...t,times,values};
});
const clip={id:'rifleRunFootwork',name:'rifle sprint - natural body + phase-matched grip',sourceFile,duration:animation.duration,carrySource:carry.sourceFile,carryPhaseOffset:shift,sourceRootDelta:root?[0,1,2].map(i=>+(root.values[root.values.length-3+i]-root.values[i]).toFixed(4)):[0,0,0],tracks:[...body,...upper]};
if(!body.some(t=>t.bone==='LeftFoot')||!body.some(t=>t.bone==='RightFoot'))throw Error('Missing footwork tracks.');
const output={...oldPack,clips:[...oldPack.clips.filter(c=>c.id!==clip.id),clip]};
writeFileSync('public/assets/animations/rifle-run-pack.json',JSON.stringify(output));
console.log(JSON.stringify({duration:clip.duration,bodyTracks:body.length,armTracks:upper.length,carryPhaseOffset:shift,rootTravel:clip.sourceRootDelta}));
