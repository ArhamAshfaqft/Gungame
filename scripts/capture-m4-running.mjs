import {chromium} from 'playwright';import {mkdir,writeFile} from 'node:fs/promises';
const out='E:/Cache/Temp/m4-running-proof';await mkdir(out,{recursive:true});const b=await chromium.launch({channel:'chrome',headless:true}),p=await b.newPage({viewport:{width:1440,height:1000}}),errors=[];p.on('pageerror',e=>errors.push(e.message));
try{
await p.goto('http://127.0.0.1:5181/?map=villa');await p.waitForFunction(()=>window.__fastSnipe?.thirdPerson.rig?.palmReferences&&!document.querySelector('#btn-play').disabled,{timeout:60000});
await p.locator('#btn-play').click();await p.waitForFunction(()=>!!document.pointerLockElement);
await p.keyboard.press('Digit6');await p.waitForTimeout(350);await p.keyboard.press('KeyV');
const shots=[];
for(const [name,keys] of [['run',['KeyW']],['sprint',['KeyW','ShiftLeft']],['diagonal',['KeyW','KeyD']]]){
 for(const key of keys)await p.keyboard.down(key);
 await p.waitForTimeout(850);await p.keyboard.press('KeyP');for(const key of keys)await p.keyboard.up(key);
 const diagnostic=await p.evaluate(async()=>{const T=await import('/node_modules/three/build/three.module.js'),g=window.__fastSnipe,r=g.thirdPerson.rig,root=r.object.position,c=g.thirdPerson.camera;g.poseInspector.controls.target.copy(root).add(new T.Vector3(0,1.25,0));c.position.copy(root).add(new T.Vector3(-1,1.65,-1.65));g.poseInspector.controls.update();return {clip:r.animator.current,gaps:Object.fromEntries(Object.entries(r.palmGripDiagnostics).map(([s,d])=>[s,d.error]))};});
 await p.screenshot({path:out+'/'+name+'.png'});shots.push({name,...diagnostic});await p.keyboard.press('KeyP');await p.waitForFunction(()=>!!document.pointerLockElement);
}
console.log(JSON.stringify({shots,errors}));
}finally{await b.close();}
