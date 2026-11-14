import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const b=await chromium.launch({channel:'chrome',headless:true}),p=await b.newPage();try{
await p.goto('http://127.0.0.1:5181/?map=training');await p.waitForFunction(()=>window.__fastSnipe?.weapon.armsRig&&!document.querySelector('#btn-play').disabled);await p.locator('#btn-play').click();await p.waitForTimeout(500);
const read=()=>p.evaluate(()=>{const w=window.__fastSnipe.weapon,r=w.armsRig;return {revision:w.poseRevision,lastRevision:r.lastRevision,customApplied:r.lastCustomPose===w.poseOverrides,pose:w.poseOverrides?.Left?.rotation,actual:r.bones.LeftHand.quaternion.toArray(),library:w.poseLibrary.projectRevision};});
const first=await read();await p.keyboard.press('Digit2');await p.waitForTimeout(450);await p.keyboard.press('Digit1');await p.waitForTimeout(700);const after=await read();assert.equal(first.customApplied,true);assert.deepEqual(first.actual,after.actual);assert.deepEqual(first.pose,after.pose);console.log(JSON.stringify({first,after,immediatePoseMatchesSwitchBack:true}));
}finally{await b.close();}
