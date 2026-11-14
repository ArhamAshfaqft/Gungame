import {chromium} from 'playwright';import assert from 'node:assert/strict';
const b=await chromium.launch({channel:'chrome',headless:true});const context=await b.newContext({viewport:{width:1500,height:1000}}),p=await context.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
await p.goto('http://127.0.0.1:5181/studio.html');await p.waitForFunction(()=>window.__poseStudio?.bodyRig?.animator&&document.querySelector('#loading').style.display==='none');
await p.selectOption('#weapon','assault');await p.selectOption('#stance','aim');await p.selectOption('#action','reload');await p.click('[data-part="Right"]');
await p.locator('summary').filter({hasText:'Animate with keyframes'}).click();await p.locator('#animation-time').fill('0.25');await p.locator('#animation-time').dispatchEvent('change');await p.click('#animation-add-frame');
await p.getByLabel('Hand-only rotation X value',{exact:true}).fill('10');await p.getByLabel('Hand-only rotation X value',{exact:true}).dispatchEvent('change');await p.click('#save');
const data=await p.evaluate(()=>JSON.parse(localStorage.getItem('fast-snipe-poses-v1')));assert.ok(data.animationEdits['assault|view_reload|aim']);
assert.ok(Math.abs(data.animationEdits['assault|view_reload|aim'].keyframes[0].pose.Right.handRotation[0]-Math.PI/18)<1e-6);
for(const slot of ['primary','pistol','assault']){await p.selectOption('#weapon',slot);for(const state of ['hip','fire','aim']){await p.selectOption('#stance',state);assert.equal(await p.locator('#stance').isDisabled(),false);}}
await p.selectOption('#weapon','frag');await p.selectOption('#stance','pin');await p.click('[data-part="item"]');await p.getByLabel('Grenade-only position X value',{exact:true}).fill('2');await p.getByLabel('Grenade-only position X value',{exact:true}).dispatchEvent('change');await p.click('#save');
assert.ok(await p.evaluate(()=>!!window.__poseStudio.library.animationEdits['frag|view_pin|pin']));
await p.screenshot({path:'E:/Cache/Temp/studio-upgrade-first-person.png'});
console.log(JSON.stringify({firstPersonKeyframeSaved:true,allGunStatesEnabled:true,throwableItemEditable:true,errors}));await b.close();if(errors.length)process.exitCode=1;
