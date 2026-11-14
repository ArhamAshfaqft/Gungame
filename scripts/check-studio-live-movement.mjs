import {chromium} from 'playwright';import assert from 'node:assert/strict';
const b=await chromium.launch({channel:'chrome',headless:true}),p=await b.newPage({viewport:{width:1700,height:1000}}),errors=[];p.on('pageerror',e=>errors.push(e.message));
try{
await p.goto('http://127.0.0.1:5181/studio.html');await p.waitForFunction(()=>window.__poseStudio?.bodyRig?.animator);await p.click('#studio-play');await p.waitForFunction(()=>document.querySelector('#studio-live-game')?.contentWindow?.fastSnipeStudioBridge);
const f=p.frames().find(f=>f.url().includes('studio=1'));f.on('pageerror',e=>errors.push(e.message));await f.waitForFunction(()=>window.__fastSnipe?.thirdPerson.rig?.captureStudioInput);await f.locator('#btn-play').click();await f.waitForFunction(()=>!!document.pointerLockElement);
const captured=[];
async function freeze(){await p.keyboard.press('KeyP');await f.waitForFunction(()=>window.fastSnipeStudioBridge.frozen);const c=await f.evaluate(()=>window.fastSnipeStudioBridge.context);captured.push(c);await p.waitForTimeout(80);return c;}
async function resume(){await p.click('#studio-live-resume');await f.waitForFunction(()=>!!document.pointerLockElement&&!window.fastSnipeStudioBridge.frozen);}
await p.keyboard.down('KeyW');await p.keyboard.down('ShiftLeft');await p.waitForTimeout(650);const run=await freeze();await p.keyboard.up('KeyW');await p.keyboard.up('ShiftLeft');assert.match(run.clip,/run/i);assert.equal(run.posture,'stand');
await resume();await p.keyboard.press('Space');await p.waitForTimeout(90);const jump=await freeze();assert.equal(jump.grounded,false);assert.match(jump.clip,/jump/i);
await resume();await p.waitForTimeout(800);await p.keyboard.press('Digit6');await p.waitForTimeout(350);await p.mouse.down({button:'left'});await p.waitForTimeout(220);const fire=await freeze();await p.mouse.up({button:'left'});assert.equal(fire.slot,'assault');assert.equal(fire.state,'fire');
await resume();await p.keyboard.press('KeyR');await p.waitForTimeout(200);const reload=await freeze();assert.equal(reload.reloading,true);assert.equal(reload.clip,'reload');
console.log(JSON.stringify({cases:captured.map(c=>({clip:c.clip,state:c.state,grounded:c.grounded})),errors}));assert.deepEqual(errors,[]);
}finally{await b.close();}
