import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {soundEngine} from '../src/audio/SoundEngine.js';

function fixture(){
 const automation=()=>({value:0,setValueAtTime(){},exponentialRampToValueAtTime(){}});
 const node=()=>({connect(){},disconnect(){},start(){},stop(){},gain:automation(),frequency:automation(),pan:automation(),playbackRate:automation()});
 const engine=new soundEngine.constructor(),calls=[];
 engine.initialized=true;engine.masterGain=node();
 engine.ctx={currentTime:1,sampleRate:22050,createBuffer:(_channels,length)=>({getChannelData:()=>new Float32Array(length)}),createBufferSource:node,createGain:node,createBiquadFilter:node,createOscillator:node,createStereoPanner:node};
 engine.playSample=(key,options)=>{calls.push({key,options});return true;};
 engine.waterStepKeys=Array.from({length:6},(_,i)=>`waterStep${i}`);
 return {engine,calls};
}

test('user recordings are separate entry and short foot-contact assets with valid normalized PCM',()=>{
 const manifest=JSON.parse(readFileSync(new URL('../public/assets/audio/water/manifest.json',import.meta.url)));
 const bank=JSON.parse(readFileSync(new URL('../public/assets/audio/water/samples.json',import.meta.url)));
 assert.equal(manifest.clips.length,7);assert.equal(manifest.clips[0].key,'waterEntry');
 for(const clip of manifest.clips){
  const bytes=readFileSync(new URL('../public/assets/audio/water/'+clip.file,import.meta.url));
  assert.deepEqual(Buffer.from(bank.samples[clip.key],'base64'),bytes);
  assert.equal(bytes.subarray(0,4).toString(),'RIFF');assert.equal(bytes.subarray(8,12).toString(),'WAVE');assert.equal(bytes.readUInt16LE(22),1);assert.equal(bytes.readUInt32LE(24),22050);
  let peak=0;for(let i=44;i<bytes.length;i+=2)peak=Math.max(peak,Math.abs(bytes.readInt16LE(i)));assert.ok(peak>1000&&peak<30000);
  if(clip.key.startsWith('waterStep')){assert.match(clip.source,/walking-in-water/);assert.ok(clip.duration<=.7);}else assert.match(clip.source,/splash-by-blaukreuz/);
 }
});

test('entry recording is reserved for players and cannot replace shooting, grenade or blast sounds',()=>{
 const previous=globalThis.window;globalThis.window={};
 try{
  const {engine,calls}=fixture();engine.playWaterImpact(100,'player',{x:1,y:2,z:3});assert.equal(calls[0].key,'waterEntry');
  engine.playWaterImpact(100,'player');assert.equal(calls.length,1,'one entry does not retrigger twice in a frame');
  for(const kind of ['bullet','grenade','blast','wade']){engine.ctx.currentTime+=1;engine.playWaterImpact(125,kind);}
  assert.equal(calls.length,1,'non-player effects retain their procedural water sound');
 }finally{globalThis.window=previous;}
});

test('water footsteps follow individual contacts, vary without immediate repeats and preserve dry footsteps',()=>{
 const {engine,calls}=fixture();engine.footstepSamples=[{buffer:{},offset:0}];
 engine.playFootstep('run','Left',false);assert.equal(calls.length,0,'dry ground uses the original boot samples');
 for(let i=0;i<12;i++)engine.playFootstep(i%2?'walk':'run',i%2?'Right':'Left',true);
 assert.equal(calls.length,12);assert.ok(calls.every(c=>c.key.startsWith('waterStep')&&c.options.group==='waterSteps'));
 for(let i=1;i<calls.length;i++)assert.notEqual(calls[i].key,calls[i-1].key);
 assert.ok(calls[1].options.volume<calls[0].options.volume);assert.equal(calls[0].options.stereo,-.08);assert.equal(calls[1].options.stereo,.08);
 engine.lastWaterEntry=engine.ctx.currentTime;engine.playFootstep('run','Left',true);assert.equal(calls.length,12,'entry splash suppresses a simultaneous footfall');
 engine.ctx.currentTime+=.2;engine.playFootstep('run','Left',true);assert.equal(calls.length,13);
});
