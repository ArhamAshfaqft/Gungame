import {chromium} from 'playwright';
const b=await chromium.launch({channel:'chrome',headless:true});const p=await b.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
try{
await p.goto('http://127.0.0.1:5181/?map=training');await p.waitForFunction(()=>window.__fastSnipe?.thirdPerson.rig&&!document.querySelector('#btn-play').disabled,{timeout:60000});await p.locator('#btn-play').click();await p.keyboard.press('Digit6');await p.keyboard.press('KeyV');await p.waitForTimeout(500);
const result=[];
for(const keys of [[],['KeyW'],['KeyS'],['KeyX','KeyQ']]){for(const k of keys)await p.keyboard.down(k);await p.waitForTimeout(550);result.push(await p.evaluate(()=>{const g=window.__fastSnipe,t=g.thirdPerson,r=t.rig;return {enabled:t.enabled,slot:g.weapon.activeSlot,pose:r.animatedSlot,m4:r.animatedModel===t.models.assault,clip:r.animator.current};}));for(const k of keys)await p.keyboard.up(k);}
console.log(JSON.stringify({result,errors}));if(errors.length||result.some(r=>!r.m4||r.pose!=='primary'))throw Error('M4 sniper route failed');
}finally{await b.close();}
