import test from 'node:test';import assert from 'node:assert/strict';import {CombatAudio} from '../src/audio/CombatAudio.js';import {readFileSync} from 'node:fs';
import {woodenDoorBuffer} from '../src/audio/WoodenDoor.js';
function bank(){const created=[];const node=()=>({connect(){},disconnect(){},gain:{value:0},pan:{value:0}});const engine={isMuted:false,masterGain:node(),ctx:{currentTime:2,createGain:node,createStereoPanner:node,createBufferSource(){const n={...node(),playbackRate:{value:1},start(...args){this.started=args},stop(){this.stopped=true;this.onended?.()}};created.push(n);return n}}};const bank=new CombatAudio(engine);bank.buffers.set('test',{duration:.5});return{bank,engine,created}}
test('combat sound scheduling is cancellable and releases stopped voices',()=>{const {bank,created}=bankFixture();bank.play('test',{delay:.4,group:'reload'});bank.play('test',{group:'shots'});assert.deepEqual(created[0].started,[2.4,0,.5]);bank.stop('reload');assert.equal(created[0].stopped,true);assert.equal(created[1].stopped,undefined);assert.equal(bank.active.size,1);created[1].onended();assert.equal(bank.active.size,0)});
const bankFixture=bank;
test('spatial effects attenuate with distance and stereo follows listener facing',()=>{const {bank}=bankFixture();bank.listener={position:{x:0,y:0,z:0},yaw:0};const right=bank.spatial({x:10,y:0,z:0}),far=bank.spatial({x:100,y:0,z:0});assert.ok(right.pan>0);assert.ok(far.volume<right.volume);bank.listener.yaw=Math.PI;assert.ok(bank.spatial({x:10,y:0,z:0}).pan<0)});
test('missing or muted cues retain fallback and simultaneous voices are bounded',()=>{const {bank,engine}=bankFixture();assert.equal(bank.play('missing'),false);engine.isMuted=true;assert.equal(bank.play('test'),false);engine.isMuted=false;for(let i=0;i<80;i++)bank.play('test');assert.ok(bank.active.size<=bank.limit)});

test('door cues diminish across rooms, pan with direction and are silent beyond their range',()=>{
 const {bank,created}=bankFixture();bank.listener={position:{x:0,y:0,z:0},yaw:0};
 const near=bank.spatial({x:2,y:0,z:0},10,35),far=bank.spatial({x:25,y:0,z:0},10,35);
 assert.ok(far.volume<near.volume*.1);assert.ok(near.pan>0);
 bank.listener.yaw=Math.PI;assert.ok(bank.spatial({x:2,y:0,z:0},10,35).pan<0);
 bank.play('test',{position:{x:40,y:0,z:0},range:10,maxDistance:35});assert.equal(created.length,0,'inaudible doors allocate no voices');
});

test('wooden door cue is short, finite and fades out without clipping',()=>{
 let samples;const ctx={sampleRate:48000,createBuffer(channels,length){samples=new Float32Array(length);return{getChannelData:()=>samples};}};
 woodenDoorBuffer(ctx);assert.equal(samples.length,23040);assert.ok(samples.every(Number.isFinite));assert.ok(Math.max(...samples)<1);assert.ok(Math.min(...samples)>-1);
 const rms=(from,to)=>Math.sqrt(samples.slice(from,to).reduce((sum,v)=>sum+v*v,0)/(to-from));
 assert.ok(rms(0,1500)>.01);assert.ok(rms(samples.length-500,samples.length)<rms(0,1500)*.03);
});
test('placeholder audio bank retains provenance and all samples are valid WAVs',()=>{const root='../public/assets/audio/combat/',pack=JSON.parse(readFileSync(new URL(root+'samples.json',import.meta.url))),manifest=JSON.parse(readFileSync(new URL(root+'manifest.json',import.meta.url)));assert.equal(manifest.placeholder,true);assert.equal(manifest.clips.length,29);for(const row of manifest.clips){const sample=Buffer.from(pack.samples[row.key],'base64');assert.equal(sample.subarray(0,4).toString(),'RIFF');assert.equal(sample.subarray(8,12).toString(),'WAVE');assert.ok(row.sourceName&&row.pathId);assert.ok(row.duration>0)}});
