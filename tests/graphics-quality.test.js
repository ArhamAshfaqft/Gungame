import test from 'node:test';import assert from 'node:assert/strict';import {AutoQuality} from '../src/ui/AutoQuality.js';
test('auto lowers quality after sustained slow frames, not individual spikes',()=>{const a=new AutoQuality();a.sample(.5);assert.equal(a.level,1);for(let i=0;i<700;i++)a.sample(1/40);assert.equal(a.level,0);});
test('auto can move up on sustained spare capacity and ignores invalid frames',()=>{const a=new AutoQuality();a.sample(NaN);a.sample(10);assert.equal(a.frames,0);for(let i=0;i<2000;i++)a.sample(1/100);assert.equal(a.level,2);});
