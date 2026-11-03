// Retarget the user's additional animation without including meshes or textures.
import {readFileSync,writeFileSync} from 'node:fs';
import * as THREE from 'three';
import {FBXLoader} from 'three/examples/jsm/loaders/FBXLoader.js';
const sourceFile='Rifle Run (1).fbx',bytes=readFileSync(sourceFile);
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
const clip={id:'rifleRunReady',name:'rifle run — ready / non-ADS (new)',sourceFile,duration:animation.duration,sourceRootDelta:root?[0,1,2].map(i=>+(root.values[root.values.length-3+i]-root.values[i]).toFixed(4)):[0,0,0],tracks};
const output=JSON.stringify({version:1,source:'User-provided Mixamo Rifle Run (1).fbx',inPlace:true,clips:[clip]});writeFileSync('public/assets/animations/rifle-run-pack.json',output);console.log(JSON.stringify({bytes:Buffer.byteLength(output),duration:clip.duration,tracks:tracks.length,sourceRootDelta:clip.sourceRootDelta}));
