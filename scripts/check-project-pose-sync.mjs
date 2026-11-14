import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {emptyLibrary,validateLibrary} from '../src/studio/PoseLibrary.js';
const browser=await chromium.launch({channel:'chrome',headless:true}),errors=[];
let shared=null,fail=false,posts=0;
async function profile(local){const c=await browser.newContext();await c.addInitScript(l=>{if(!localStorage.getItem('fast-snipe-poses-v1'))localStorage.setItem('fast-snipe-poses-v1',JSON.stringify(l));},local);
 await c.route('**/assets/poses/studio-library.json',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(shared)}));
 await c.route('**/__studio/project-poses',r=>{posts++;if(fail)return r.fulfill({status:500,contentType:'application/json',body:JSON.stringify({error:'Test write failure'})});shared=validateLibrary(r.request().postDataJSON());shared.projectRevision='browser-proof-'+posts;return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({saved:true,revision:shared.projectRevision})});});
 return c;}
try{
 const correct=emptyLibrary();correct.m4SharedGrips.Left.position=[.035,-.02,.01];correct.m4SharedGrips.Right.handRotation=[.1,.2,0];correct.poses['primary:hip'].Left.rotation=[.1,.2,.3];
 const stale=emptyLibrary();stale.m4SharedGrips.Left.position=[.2,0,0];
 const a=await profile(correct),b=await profile(stale),studio=await a.newPage(),game=await b.newPage();for(const p of [studio,game])p.on('pageerror',e=>errors.push(e.message));
 await studio.goto('http://127.0.0.1:5181/studio.html');await studio.waitForFunction(()=>window.__poseStudio?.bodyRig?.animator,{timeout:60000});
 assert.deepEqual(await studio.evaluate(()=>window.__poseStudio.library.m4SharedGrips),correct.m4SharedGrips);assert.equal(posts,0);
 await game.goto('http://127.0.0.1:5181/?map=training');await game.waitForFunction(()=>window.__fastSnipe?.thirdPerson?.rig?.animator,{timeout:60000});
 assert.equal(await game.evaluate(()=>window.__fastSnipe.weapon.poseLibrary.m4SharedGrips.Left.position[0]),.2);
 await studio.click('#save');await studio.waitForFunction(()=>!document.querySelector('#save').disabled&&!!window.__poseStudio.library.projectRevision);
 assert.deepEqual(shared.m4SharedGrips,correct.m4SharedGrips);assert.deepEqual(shared.poses['primary:hip'].Left,correct.poses['primary:hip'].Left);
 await game.waitForFunction(()=>window.__fastSnipe.weapon.poseLibrary.m4SharedGrips.Left.position[0]===.035,{timeout:15000});
 await game.evaluate(()=>window.__fastSnipe.weapon.refreshSavedPoses());assert.equal(await game.evaluate(()=>window.__fastSnipe.weapon.poseLibrary.m4SharedGrips.Left.position[0]),.035);
 assert.equal(await game.evaluate(()=>JSON.parse(localStorage.getItem('fast-snipe-poses-v1')).m4SharedGrips.Left.position[0]),.2);
 const otherStudio=await b.newPage();otherStudio.on('pageerror',e=>errors.push(e.message));await otherStudio.goto('http://127.0.0.1:5181/studio.html');await otherStudio.waitForFunction(()=>window.__poseStudio?.library?.projectRevision);
 assert.deepEqual(await otherStudio.evaluate(()=>window.__poseStudio.library.m4SharedGrips),correct.m4SharedGrips);
 assert.equal(await studio.evaluate(()=>JSON.parse(localStorage.getItem('fast-snipe-poses-before-project-sync-v1')).m4SharedGrips.Left.position[0]),.035);
 // A failed subsequent write must preserve the user's newly edited local copy.
 fail=true;await studio.selectOption('#weapon','assault');await studio.click('#third-person');await studio.click('[data-part="Left"]');const input=studio.getByLabel('Support-hand position X value',{exact:true});await input.fill('4.5');await input.dispatchEvent('change');await studio.click('#save');await studio.waitForFunction(()=>!document.querySelector('#save').disabled);
 assert.equal(await studio.evaluate(()=>JSON.parse(localStorage.getItem('fast-snipe-poses-v1')).m4SharedGrips.Left.position[0]),.045);assert.equal(shared.m4SharedGrips.Left.position[0],.035);
 assert.deepEqual(errors,[]);console.log(JSON.stringify({originalSettingsPreserved:true,savedAcrossSeparateBrowserProfiles:true,staleLocalCannotOverride:true,otherStudioMatches:true,failedSaveKeepsEdits:true,posts,errors}));
}finally{await browser.close();}
