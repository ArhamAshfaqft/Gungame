import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as T from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {instantiateSwatRig} from '../src/models/SwatRig.js';
import {ShooterAnimator} from '../src/models/ShooterAnimator.js';
import {buildTeamSkin,setRigTeam} from '../src/models/TeamAppearance.js';

async function asset(path){
 const source=readFileSync(new URL('../public/assets/operators/'+path,import.meta.url));
 const size=source.readUInt32LE(12),json=JSON.parse(source.subarray(20,20+size));
 json.materials=json.materials.map(m=>({name:m.name}));
 const text=Buffer.from(JSON.stringify(json)),padded=Buffer.alloc(Math.ceil(text.length/4)*4,32);text.copy(padded);
 const bin=source.subarray(20+size),bytes=Buffer.alloc(20+padded.length+bin.length);
 bytes.writeUInt32LE(0x46546c67,0);bytes.writeUInt32LE(2,4);bytes.writeUInt32LE(bytes.length,8);bytes.writeUInt32LE(padded.length,12);bytes.writeUInt32LE(0x4e4f534a,16);padded.copy(bytes,20);bin.copy(bytes,20+padded.length);
 return (await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'')).scene;
}
const swat=await asset('swat.glb'),red=await asset('red-team.glb');
const pack=JSON.parse(readFileSync(new URL('../public/assets/animations/shooter-pack.json',import.meta.url)));

test('red appearance has one character and follows existing animated bones without changing the rig',()=>{
 const rig=instantiateSwatRig(swat.getObjectByName('SWAT_Body')),bones=Object.values(rig.bones);
 const saved=bones.map(b=>({p:b.position.toArray(),q:b.quaternion.toArray()}));
 const prepared=buildTeamSkin(red,rig);assert.equal(prepared.parts.length,5);
 const skeleton=new T.Skeleton(prepared.boneNames.map(n=>rig.bones[n]),prepared.inverses);
 const group=new T.Group();rig.object.add(group);
 for(const part of prepared.parts){
  const mesh=new T.SkinnedMesh(part.geometry,part.material);mesh.bind(skeleton,new T.Matrix4());group.add(mesh);
  for(const i of part.geometry.attributes.skinIndex.array)assert.ok(i<bones.length);
  assert.ok(part.geometry.attributes.position.array.every(Number.isFinite));
 }
 assert.deepEqual(bones.map(b=>({p:b.position.toArray(),q:b.quaternion.toArray()})),saved);
 rig.animator=new ShooterAnimator(rig,pack);let first;
 for(const [clip,time]of [['idle',.1],['walk',.2],['walk',.6],['runBack',.4],['throw',.3]]){
  rig.animator.sample(clip,time);rig.object.updateMatrixWorld(true);skeleton.update();
  const bounds=new T.Box3().setFromObject(group,true),size=bounds.getSize(new T.Vector3());
  assert.ok(size.toArray().every(Number.isFinite));assert.ok(size.y>.7&&size.y<2.4,clip+' stays human sized');
  const point=group.children[0].getVertexPosition(10,new T.Vector3());
  if(!first)first=point;else if(clip==='walk')assert.ok(point.distanceTo(first)>.005,'red skin moves with the existing animation');
 }
});

test('blue team keeps original mesh visibility and cancels a pending red selection',async()=>{
 const mesh=new T.Mesh(),redGroup=new T.Group();mesh.visible=false;redGroup.visible=true;
 const rig={teamAppearance:{originals:[{mesh,visible:true}],group:redGroup,requested:0}};
 await setRigTeam(rig,1);assert.equal(mesh.visible,true);assert.equal(redGroup.visible,false);assert.equal(rig.teamAppearance.requested,1);
});
