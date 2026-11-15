import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import {instantiateSwatRig} from '../src/models/SwatRig.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import {PreviewAnimator,locomotionWeights} from '../src/animation-preview/PreviewAnimator.js';

// Load the actual production skeleton in Node; textures are irrelevant to pose validation.
const source = readFileSync(new URL('../public/assets/operators/swat.glb', import.meta.url));
const jsonLength = source.readUInt32LE(12);
const json = JSON.parse(source.subarray(20, 20 + jsonLength).toString());
json.materials = json.materials.map(material => ({ name: material.name }));
const text = Buffer.from(JSON.stringify(json));
const padded = Buffer.alloc(Math.ceil(text.length / 4) * 4, 32);
text.copy(padded);
const binChunk = source.subarray(20 + jsonLength);
const buffer = Buffer.alloc(20 + padded.length + binChunk.length);
buffer.writeUInt32LE(0x46546c67, 0); buffer.writeUInt32LE(2, 4); buffer.writeUInt32LE(buffer.length, 8);
buffer.writeUInt32LE(padded.length, 12); buffer.writeUInt32LE(0x4e4f534a, 16);
padded.copy(buffer, 20); binChunk.copy(buffer, 20 + padded.length);
const gltf = await new GLTFLoader().parseAsync(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength), '');


const pack={clips:['shooter-pack','rifle-run-pack','rifle-expansion-pack'].flatMap(name=>JSON.parse(readFileSync(new URL(`../public/assets/animations/${name}.json`,import.meta.url))).clips)};
test('continuous preview weights remain normalized across every heading and speed',()=>{
 for(let angle=-Math.PI;angle<=Math.PI;angle+=.03)for(const speed of [0,.1,.5,1.25,2.2,3.7]){
  const weights=locomotionWeights({speed,forward:Math.cos(angle),lateral:Math.sin(angle)});
  assert.ok(Math.abs([...weights.values()].reduce((a,b)=>a+b,0)-1)<1e-9);
  assert.ok([...weights.values()].every(w=>w>=0&&Number.isFinite(w)));
 }
});
test('preview uses bounded phase-synchronized blends, real stop and turn clips, without changing source clips',()=>{
 const source=JSON.stringify(pack),rig=instantiateSwatRig(gltf.scene.getObjectByName('SWAT_Body')),a=new PreviewAnimator(rig,pack);
 for(let frame=0;frame<600;frame++){
  const state=frame<240?{speed:3.7,forward:Math.cos(frame*.01),lateral:Math.sin(frame*.01)}:frame<360?{speed:0}:frame<480?{speed:0,yawRate:.65}:{speed:1.25,forward:1,lateral:0};
  a.update(1/60,state);
  assert.ok([...a.actions.values()].filter(action=>action.isScheduled()).length<=12);
  assert.ok([...a.weights.values()].every(Number.isFinite));
  for(const bone of Object.values(rig.bones))assert.ok([...bone.position.toArray(),...bone.quaternion.toArray()].every(Number.isFinite));
  if(frame===245)assert.equal(a.oneShot?.id,'rifleRunStop');
  if(frame===370)assert.ok(['turnLeft','turnRight'].includes(a.oneShot?.id));
 }
 assert.equal(JSON.stringify(pack),source,'source animation assets stay unchanged');
});
