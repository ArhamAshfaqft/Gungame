import {chromium} from 'playwright';
const b=await chromium.launch({channel:'chrome',headless:true}),p=await b.newPage({viewport:{width:1600,height:1000}}),errors=[];p.on('pageerror',e=>errors.push(e.message));
try{
await p.goto('http://127.0.0.1:5181/?map=villa');await p.waitForFunction(()=>window.__fastSnipe?.thirdPerson.rig&&!document.querySelector('#btn-play').disabled,{timeout:60000});
await p.keyboard.press('KeyB');await p.waitForFunction(()=>window.__fastSnipe.idleComparison.root.visible,{timeout:60000});
await p.locator('#btn-play').click();await p.waitForTimeout(1000);await p.keyboard.press('KeyP');
console.log(await p.evaluate(async()=>{const T=await import('/node_modules/three/build/three.module.js');const g=window.__fastSnipe,c=g.idleComparison,center=c.root.position.clone().add(new T.Vector3(0,1.08,0));g.poseInspector.controls.target.copy(center);g.thirdPerson.camera.position.copy(center).add(new T.Vector3(0,.45,5).applyQuaternion(c.root.quaternion));g.poseInspector.controls.update();return {clip:c.clip,old:!!g.thirdPerson.rig,comparison:c.root.children.map(o=>o.children.length),newBones:c.imported.getObjectsByProperty('isBone',true).length};}));
await p.waitForTimeout(300);console.log(await p.evaluate(()=>({camera:window.__fastSnipe.thirdPerson.camera.position.toArray(),root:window.__fastSnipe.idleComparison.root.position.toArray(),scale:window.__fastSnipe.idleComparison.imported.scale.toArray()})));await p.screenshot({path:'E:/Cache/Temp/m4-idle-comparison.png'});console.log({errors});
}finally{await b.close();}
