import {chromium} from 'playwright';import {mkdir,writeFile} from 'node:fs/promises';
const out='E:/Cache/Temp/m4-grip-proof';await mkdir(out,{recursive:true});const b=await chromium.launch({channel:'chrome',headless:true}),p=await b.newPage({viewport:{width:1440,height:1000}}),errors=[];p.on('pageerror',e=>errors.push(e.message));
try{
await p.goto('http://127.0.0.1:5181/?map=villa');await p.waitForFunction(()=>window.__fastSnipe?.thirdPerson.rig?.palmReferences&&!document.querySelector('#btn-play').disabled,{timeout:60000});
await p.locator('#btn-play').click();await p.waitForFunction(()=>!!document.pointerLockElement);await p.keyboard.down('KeyW');await p.waitForTimeout(1800);await p.keyboard.up('KeyW');await p.waitForTimeout(300);await p.keyboard.press('Digit6');await p.waitForTimeout(350);await p.keyboard.press('KeyV');await p.mouse.down({button:'right'});await p.waitForTimeout(650);await p.keyboard.press('KeyP');await p.mouse.up({button:'right'});
const camera=async(crouch,side=false)=>p.evaluate(async({crouch,side})=>{const T=await import('/node_modules/three/build/three.module.js'),g=window.__fastSnipe,root=g.thirdPerson.rig.object.position,c=g.thirdPerson.camera;g.poseInspector.controls.target.copy(root).add(new T.Vector3(0,crouch?.88:1.37,0));c.position.copy(root).add(new T.Vector3(side?1.25:-.9,crouch?1.13:1.62,side?-.8:-1.15));g.poseInspector.controls.update();},{crouch,side});
await camera(false);await p.screenshot({path:out+'/standing-ads-front.png'});const stats=[];
const measure=()=>p.evaluate(async()=>{const {palmWorldPosition}=await import('/src/models/PalmGripFrames.js'),r=window.__fastSnipe.thirdPerson.rig,bind=r.palmGripBindings.get(r.animatedModel);return Object.fromEntries(['Left','Right'].map(s=>[s,palmWorldPosition(bind[s].sample).distanceTo(r.palmGripDiagnostics[s].point)*1000]));});
stats.push({pose:'standing ADS',gapsMm:await measure()});
await camera(false,true);await p.screenshot({path:out+'/standing-ads-side.png'});
await p.keyboard.press('KeyP');await p.waitForFunction(()=>!!document.pointerLockElement);await p.keyboard.press('KeyX');await p.keyboard.down('KeyE');await p.mouse.down({button:'right'});await p.waitForTimeout(850);await p.keyboard.press('KeyP');await p.keyboard.up('KeyE');await p.mouse.up({button:'right'});
await camera(true);await p.screenshot({path:out+'/crouched-peek-ads-front.png'});stats.push({pose:'crouched right peek ADS',gapsMm:await measure()});await camera(true,true);await p.screenshot({path:out+'/crouched-peek-ads-side.png'});
await writeFile(out+'/measurements.json',JSON.stringify({stats,errors},null,2));console.log(JSON.stringify({out,stats,errors}));
}finally{await b.close();}


