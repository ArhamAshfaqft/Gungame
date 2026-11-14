import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const browser=await chromium.launch({channel:'chrome',headless:true});const context=await browser.newContext({viewport:{width:1500,height:1000}}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto('http://127.0.0.1:5181/studio.html');await page.waitForFunction(()=>window.__poseStudio?.bodyRig?.animator&&document.querySelector('#loading').style.display==='none',{timeout:60000});
 await page.selectOption('#weapon','assault');await page.click('#third-person');await page.selectOption('#body-clip','runBack');await page.click('[data-part="Left"]');
 const slider=page.getByLabel('Support-hand position X value',{exact:true});await slider.fill('2');await slider.dispatchEvent('change');await page.click('#save');
 const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('fast-snipe-poses-v1')));assert.equal(saved.m4SharedGrips.Left.position[0],.02);
 for(const clip of ['idle','runBack','rifleCrouchIdle'])for(const stance of ['hip','aim','fire']){
  await page.selectOption('#body-clip',clip);await page.selectOption('#stance',stance);await page.waitForTimeout(100);
  assert.equal(Number(await slider.inputValue()),2);
  const data=await page.evaluate(()=>({slot:window.__poseStudio.bodyRig.animatedSlot,offset:window.__poseStudio.bodyRig.thirdPersonGrips.primary.position}));assert.equal(data.slot,'primary');assert.equal(data.offset[0],.02);
 }
 await page.screenshot({path:'E:/Cache/Temp/studio-shared-m4.png'});await page.reload();await page.waitForFunction(()=>window.__poseStudio?.bodyRig?.animator);assert.equal(await page.evaluate(()=>window.__poseStudio.library.m4SharedGrips.Left.position[0]),.02);
 const game=await context.newPage();game.on('pageerror',e=>errors.push(e.message));await game.goto('http://127.0.0.1:5181/?map=training');await game.waitForFunction(()=>window.__fastSnipe?.thirdPerson?.rig?.animator,{timeout:60000});
 const runtime=await game.evaluate(()=>{const g=window.__fastSnipe;g.weapon.activeSlot='assault';g.thirdPerson.enabled=true;g.thirdPerson.update(.016);return {slot:g.thirdPerson.rig.animatedSlot,offset:g.thirdPerson.rig.thirdPersonGrips.primary.position};});assert.equal(runtime.offset[0],.02);assert.deepEqual(errors,[]);console.log(JSON.stringify({savedAcrossStates:true,reloaded:true,runtime,errors}));
}finally{await browser.close();}

