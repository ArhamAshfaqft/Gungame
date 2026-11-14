import{readFileSync,writeFileSync}from'node:fs';import*as T from'three';import{GLTFLoader}from'three/examples/jsm/loaders/GLTFLoader.js';
const source=readFileSync('militia_grenade_throw.glb'),length=source.readUInt32LE(12),json=JSON.parse(source.subarray(20,20+length));json.materials=json.materials?.map(m=>({name:m.name}));
const text=Buffer.from(JSON.stringify(json)),padded=Buffer.alloc(Math.ceil(text.length/4)*4,32);text.copy(padded);const bin=source.subarray(20+length),buffer=Buffer.alloc(20+padded.length+bin.length);buffer.writeUInt32LE(0x46546c67,0);buffer.writeUInt32LE(2,4);buffer.writeUInt32LE(buffer.length,8);buffer.writeUInt32LE(padded.length,12);buffer.writeUInt32LE(0x4e4f534a,16);padded.copy(buffer,20);bin.copy(buffer,20+padded.length);
const asset=await new GLTFLoader().parseAsync(buffer.buffer,''),mixer=new T.AnimationMixer(asset.scene),clip=asset.animations[0];mixer.clipAction(clip).play();const bone=n=>asset.scene.getObjectByName(n),pos=n=>bone(n).getWorldPosition(new T.Vector3());const samples=[],first={},count=49;
for(let i=0;i<count;i++){
 mixer.setTime(i*clip.duration/(count-1));asset.scene.updateMatrixWorld(true);
 const up=pos('Collar_022').sub(pos('Spine_1_020')).normalize(),left=pos('L_collar_023').sub(pos('R_collar_044')).normalize(),forward=left.clone().cross(up).normalize();left.copy(up).cross(forward).normalize();
 const basis=new T.Quaternion().setFromRotationMatrix(new T.Matrix4().makeBasis(left,up,forward)),inverse=basis.clone().invert(),frame={};
 for(const[side,prefix]of[['Right','R'],['Left','L']]){
  const s=pos(prefix+'_shoulder_'+(side==='Right'?'045':'024')),e=pos(prefix+'_elbow_'+(side==='Right'?'046':'025')),w=pos(prefix+'_wrist_'+(side==='Right'?'047':'026'));
  const upper=e.clone().sub(s).normalize().applyQuaternion(inverse),lower=w.clone().sub(e).normalize().applyQuaternion(inverse),q=inverse.clone().multiply(bone(prefix+'_wrist_'+(side==='Right'?'047':'026')).getWorldQuaternion(new T.Quaternion()));
  first[side]??=q.clone();const delta=q.multiply(first[side].clone().invert()).normalize();
  frame[side]={upper:upper.toArray(),lower:lower.toArray(),rotation:delta.toArray(),wrist:w.clone().sub(s).applyQuaternion(inverse).divideScalar(e.distanceTo(s)+w.distanceTo(e)).toArray()};
 }
 samples.push(frame);
}
const summary=samples.map((s,i)=>({t:+(i*clip.duration/(count-1)).toFixed(3),w:s.Right.wrist.map(n=>+n.toFixed(3))}));console.log(JSON.stringify(summary.filter((s,i)=>i%4===0),null,2));
writeFileSync('artifacts/militia-arm-samples.json',JSON.stringify({duration:clip.duration,source:json.asset.extras,samples},null,2));
const packed=samples.map(f=>Object.fromEntries(['Right','Left'].map(side=>[side,Object.fromEntries(Object.entries(f[side]).map(([k,v])=>[k,v.map(n=>+n.toFixed(5))]))])));
const runtime={duration:clip.duration,start:.56,release:1.18,end:1.72,samples:packed};
writeFileSync('src/models/MilitiaGrenadeData.js','// Arm motion derived from Militia (Grenade Throw), jameslucino117, CC BY 4.0. See docs/MILITIA_GRENADE_NOTICE.md.\nexport default '+JSON.stringify(runtime)+';\n');
console.log(`Baked ${count} arm samples, ${JSON.stringify(runtime).length} bytes; no source meshes or textures.`);
