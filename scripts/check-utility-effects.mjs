import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1920,height:1080}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
 await page.goto('http://127.0.0.1:5181/?map=villa&multiplayer=1');await page.waitForFunction(()=>window.__fastSnipe&&!window.__fastSnipe.graphicsWarming,{timeout:120000});
 await page.evaluate(async()=>{
  const T=await import('/node_modules/three/build/three.module.js'),g=window.__fastSnipe;
  g.startScreen.classList.add('hidden');g.movement.isLocked=true;g.movement.position.set(0,1.65,29);g.movement.yaw=g.movement.pitch=0;
  const target=new T.Mesh(new T.BoxGeometry(.7,1.7,.3),new T.MeshBasicMaterial({color:0xff0000}));target.position.set(0,1.05,19);g.scene.add(target);window.target=target;window.T=T;
  g.equipment.detonate('smoke',new T.Vector3(0,.1,23));g.equipment.clouds[0].age=2;
 });
 await page.waitForTimeout(250);await page.screenshot({path:'E:/Cache/Temp/smoke-volume-red.png'});
 await page.evaluate(()=>window.target.material.color.setHex(0x000000));await page.waitForTimeout(60);await page.screenshot({path:'E:/Cache/Temp/smoke-volume-black.png'});
 await page.evaluate(()=>{const g=window.__fastSnipe;for(const x of [-2,2]){g.equipment.detonate('smoke',new window.T.Vector3(x,.1,23));g.equipment.clouds.at(-1).age=2;}g.equipment.detonate('frag',new window.T.Vector3(1,.5,26));g.equipment.detonate('flash',new window.T.Vector3(-1,.5,26));});
 const sample=()=>page.evaluate(async()=>{
  const frames=[];let last=performance.now(),start=last;
  while(performance.now()-start<2000){await new Promise(requestAnimationFrame);const now=performance.now();frames.push(now-last);last=now;}
  frames.sort((a,b)=>a-b);return {mean:frames.reduce((a,b)=>a+b)/frames.length,p95:frames[Math.floor(frames.length*.95)],frames:frames.length};
 });
 const volume=await sample();
 await page.evaluate(()=>{const g=window.__fastSnipe;g.smokePass.update=()=>{g.smokePass.enabled=false;for(const c of g.equipment.clouds){c.volumeOnly=false;c.mesh.visible=true;}}});
 const billboards=await sample();
 await page.evaluate(()=>{const g=window.__fastSnipe;g.movement.position.set(-16.5,5.05,-4);g.movement.yaw=-Math.PI/2;g.movement.pitch=-.65;});await page.waitForTimeout(150);
 await page.screenshot({path:'E:/Cache/Temp/wellness-floor-fixed.png'});
 assert.deepEqual(errors,[]);console.log(JSON.stringify({volume,billboards,errors}));
}finally{await browser.close();}
