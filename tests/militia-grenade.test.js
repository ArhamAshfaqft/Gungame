import test from 'node:test';import assert from 'node:assert/strict';import*as T from'three';
import{sampleMilitiaThrow}from'../src/models/MilitiaGrenadeThrow.js';
import data from'../src/models/MilitiaGrenadeData.js';
import{firstPersonThrowSample}from'../src/models/ThrowableMotion.js';
test('baked Militia arms pull back before swinging forward and blend into the holding pose',()=>{
 assert.equal(data.samples.length,49);assert.ok(data.release>data.start);
 for(const side of ['Right','Left'])for(let i=0;i<=100;i++){
  const p=i/100,s=sampleMilitiaThrow(p,side);
  assert.ok([...s.offset.toArray(),...s.rotation.toArray(),...s.pole.toArray()].every(Number.isFinite));
  assert.ok(Math.abs(s.rotation.length()-1)<1e-5);assert.ok(s.rotation.angleTo(new T.Quaternion())<=1.1001);
 }
 assert.ok(sampleMilitiaThrow(.3).offset.z<-.2,'wind-up travels behind the shoulder');
 assert.ok(sampleMilitiaThrow(.46).offset.z>0,'release follows the forward swing');
 for(const p of [0,1])assert.ok(sampleMilitiaThrow(p).offset.length()<1e-8);
 const center=sampleMilitiaThrow(.46),a=sampleMilitiaThrow(.46-1e-5),b=sampleMilitiaThrow(.46+1e-5);
 assert.ok(Math.abs((center.sourceTime-a.sourceTime)/1e-5-(b.sourceTime-center.sourceTime)/1e-5)<.001,'release preserves swing speed');assert.ok(a.offset.distanceTo(b.offset)<.001,'no snap at release');
});

test('first-person throwing reuses the body clip clock and keeps the wrist rotation normalized',()=>{
 for(const side of ['Right','Left'])for(const p of [0,.12,.25,.35,.46,.6,.9,1]){
  const body=sampleMilitiaThrow(p,side),view=firstPersonThrowSample(p,side);
  assert.equal(view.sourceTime,body.sourceTime);assert.ok(Math.abs(view.rotation.length()-1)<1e-12);
  assert.ok(Math.abs(view.offset.length()-body.offset.length())<1e-10,'retargeting preserves the source motion before rig-specific reach scaling');
 }
 assert.ok(firstPersonThrowSample(.25).offset.z>0,'camera-space wind-up comes back toward the shoulder');
 assert.ok(firstPersonThrowSample(.6).offset.z<0,'camera-space follow-through moves forward');
});
