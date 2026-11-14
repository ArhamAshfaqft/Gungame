import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';import {trimTripoRun,TRIPO_RUN_RANGE} from '../src/player/TripoRunCycle.js';
test('Tripo running loops only active middle frames, retaining every source pose value',async t=>{
 const b=readFileSync(new URL('../public/assets/comparison/tripo-playable.glb',import.meta.url)),a=await new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),''),source=a.animations.find(c=>c.name==='Tripo_Run'),trim=trimTripoRun(source);
 assert.equal(trim.name,source.name);assert.equal(trim.tracks.length,source.tracks.length);assert.ok(trim.duration>.65&&trim.duration<.8);
 const start=TRIPO_RUN_RANGE.startFrame/TRIPO_RUN_RANGE.fps,end=TRIPO_RUN_RANGE.endFrame/TRIPO_RUN_RANGE.fps;
 for(let i=0;i<source.tracks.length;i++){
  const original=source.tracks[i],result=trim.tracks[i],sampleSource=original.createInterpolant(),sampleTrim=result.createInterpolant();
  assert.equal(result.name,original.name);
  for(let frame=0;frame<=17;frame++){
   const expected=Array.from(sampleSource.evaluate(start+frame/24)),actual=Array.from(sampleTrim.evaluate(frame/24));
   for(let k=0;k<expected.length;k++)assert.ok(Math.abs(expected[k]-actual[k])<.000002,'trimming must preserve each pose');
  }
 }
 t.diagnostic(`Loop uses ${start.toFixed(3)}–${(start+trim.duration).toFixed(3)} seconds of the ${source.duration.toFixed(3)} second source.`);
});
import * as T from 'three';
const readAsset=async path=>{const b=readFileSync(new URL(path,import.meta.url));return new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'');};
test('converted run retains the FBX wrist motion without the former single-frame jump',async t=>{
 const a=await readAsset('../public/assets/comparison/tripo-playable.glb'),clip=a.animations.find(c=>c.name==='Tripo_Run'),mixer=new T.AnimationMixer(a.scene);mixer.clipAction(clip).play();
 const bones=a.scene.getObjectsByProperty('isBone',true),hand=bones.find(b=>b.name.endsWith('RightHand')),chest=bones.find(b=>b.name.endsWith('Spine2')),samples=[];
 for(let frame=63;frame<=80;frame++){mixer.setTime(frame/24);a.scene.updateMatrixWorld(true);samples.push(chest.getWorldQuaternion(new T.Quaternion()).invert().multiply(hand.getWorldQuaternion(new T.Quaternion())).normalize());}
 let range=0,step=0;for(let i=0;i<samples.length;i++){if(i)step=Math.max(step,samples[i-1].angleTo(samples[i]));for(const q of samples)range=Math.max(range,q.angleTo(samples[i]));}
 range=T.MathUtils.radToDeg(range);step=T.MathUtils.radToDeg(step);t.diagnostic(JSON.stringify({range,step}));assert.ok(Math.abs(range-10.6434)<.03);assert.ok(step<4.06);
});
test('approved idle and peek samples remain identical to the pre-conversion reference',async()=>{
 const [a,b]=await Promise.all([readAsset('../public/assets/comparison/tripo-playable.glb'),readAsset('../blender-assets/tripo-approved-poses.glb')]);
 for(const name of ['Tripo_Idle','Tripo_Peek','Tripo_PeekOther']){const actual=a.animations.find(c=>c.name===name),expected=b.animations.find(c=>c.name===name);assert.equal(actual.tracks.length,expected.tracks.length);for(let i=0;i<actual.tracks.length;i++){assert.equal(actual.tracks[i].name,expected.tracks[i].name);assert.deepEqual(actual.tracks[i].values,expected.tracks[i].values);assert.deepEqual(actual.tracks[i].times,expected.tracks[i].times);}}
});
