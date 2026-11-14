import {chromium} from 'playwright';
const b=await chromium.launch({channel:'chrome',headless:true}),p=await b.newPage({viewport:{width:1200,height:950}}),errors=[];p.on('pageerror',e=>errors.push(e.message));
try{
 await p.goto('http://127.0.0.1:5181/?map=villa');await p.waitForFunction(()=>window.__fastSnipe?.thirdPerson.rig&&!document.querySelector('#btn-play').disabled,{timeout:60000});
 await p.keyboard.press('KeyH');await p.waitForFunction(()=>window.__fastSnipe.tripoPlayer.enabled,{timeout:60000});await p.locator('#btn-play').click();
 await p.keyboard.down('KeyW');await p.waitForTimeout(1200);await p.keyboard.up('KeyW');await p.waitForTimeout(500);
 const stats=[];
 for(const [name,keys] of [['idle',[]],['run',['KeyW']],['peek-left',['KeyQ']],['peek-right',['KeyE']]]){
  for(const key of keys)await p.keyboard.down(key);await p.waitForTimeout(700);await p.keyboard.press('KeyP');for(const key of keys)await p.keyboard.up(key);
  stats.push(await p.evaluate(async name=>{const T=await import('/node_modules/three/build/three.module.js'),g=window.__fastSnipe,r=g.thirdPerson.rig,n=g.tripoPlayer,root=r.object.position,c=g.thirdPerson.camera;
   g.poseInspector.controls.target.copy(root).add(new T.Vector3(0,1.1,0));c.position.copy(root).add(new T.Vector3(-1,1.5,-2.3));g.poseInspector.controls.update();
   return {name,newVisible:n.object.visible,oldVisible:r.object.visible,weights:Object.fromEntries(Object.entries(n.actions).map(([k,v])=>[k,v.getEffectiveWeight()])),head:n.head.getWorldPosition(new T.Vector3()).toArray()};},name));
  await p.waitForTimeout(200);await p.screenshot({path:'E:/Cache/Temp/tripo-'+name+'.png'});await p.keyboard.press('KeyP');await p.waitForTimeout(350);
 }
 await p.keyboard.press('KeyH');await p.waitForTimeout(100);stats.push(await p.evaluate(()=>({switchedBack:!window.__fastSnipe.tripoPlayer.enabled,oldVisible:window.__fastSnipe.thirdPerson.rig.object.visible})));
 console.log(JSON.stringify({stats,errors},null,2));
}finally{await b.close();}
