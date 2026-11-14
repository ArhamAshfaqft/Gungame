import {chromium} from 'playwright';
import {writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows']});
try{
 const pages=[];
 for(let i=0;i<2;i++){
  const page=await browser.newPage({viewport:{width:1280,height:720}});pages.push(page);
  await page.goto('http://127.0.0.1:5181/?map=villa&multiplayer=1');
  await page.waitForFunction(()=>window.__fastSnipe&&!window.__fastSnipe.graphicsWarming,{timeout:120000});
  await page.locator('#mp-address').fill('http://127.0.0.1:2568');
 }
 await pages[0].locator('#mp-create').click();
 await pages[0].waitForFunction(()=>window.__fastSnipe.multiplayer?.connected);
 const code=await pages[0].evaluate(()=>window.__fastSnipe.multiplayer.code);
 await pages[1].locator('#mp-code').fill(code);await pages[1].locator('#mp-join').click();
 await pages[1].waitForFunction(()=>window.__fastSnipe.multiplayer?.connected);
 await pages[0].waitForFunction(()=>[...window.__fastSnipe.multiplayer.remotes.values()][0]?.view.rig);
 await pages[0].locator('#btn-play').click();
 await pages[0].evaluate(()=>{
  const g=window.__fastSnipe;window.times={};
  for(const [obj,key,label] of [[g.multiplayer,'reconcile','reconcile'],[g.multiplayer,'update','networkFrame'],[g.movement,'update','movement'],[g.thirdPerson,'update','localRig'],[g.renderer,'render','render'],[g.room,'update','map'],[g.networkWorld,'apply','worldApply']]){
   const fn=obj[key];obj[key]=function(...args){const start=performance.now();try{return fn.apply(this,args)}finally{(window.times[label]??=[]).push(performance.now()-start);}};
  }
 });
 const cdp=await pages[0].context().newCDPSession(pages[0]);await cdp.send('Profiler.enable');await cdp.send('Profiler.start');
 const result=await pages[0].evaluate(async()=>{
  const intervals=[];let last=performance.now(),start=last;
  while(performance.now()-start<6000){await new Promise(requestAnimationFrame);const now=performance.now();intervals.push(now-last);last=now;}
  const stats=a=>{a.sort((a,b)=>a-b);return {n:a.length,mean:a.reduce((s,v)=>s+v,0)/a.length,p95:a[Math.floor(a.length*.95)]}};
  const g=window.__fastSnipe;return {frames:stats(intervals),phases:Object.fromEntries(Object.entries(window.times).map(([k,a])=>[k,stats(a)])),calls:g.renderer.info.render.calls,triangles:g.renderer.info.render.triangles};
 });
 const {profile}=await cdp.send('Profiler.stop');
 const before=await pages[0].evaluate(()=>window.__fastSnipe.multiplayer.own.movement.position[2]);
 await pages[0].keyboard.down('KeyW');await pages[0].waitForTimeout(700);await pages[0].keyboard.up('KeyW');
 await pages[0].waitForTimeout(150);
 result.movement=await pages[0].evaluate(()=>({z:window.__fastSnipe.multiplayer.own.movement.position[2],camera:window.__fastSnipe.camera.position.toArray()}));
 assert.ok(result.movement.z<before-.5,'authoritative movement still advances');
 await pages[0].evaluate(()=>{window.times.render=[];window.hiddenSnapshotTime=window.__fastSnipe.multiplayer.lastSnapshot.time;Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});
 await pages[0].waitForTimeout(700);
 result.hidden=await pages[0].evaluate(()=>({renders:window.times.render.length,snapshotsAdvanced:window.__fastSnipe.multiplayer.lastSnapshot.time>window.hiddenSnapshotTime}));
 assert.equal(result.hidden.renders,0);assert.equal(result.hidden.snapshotsAdvanced,true);
 const counts=new Map();for(const id of profile.samples||[])counts.set(id,(counts.get(id)||0)+1);
 result.hot=profile.nodes.map(n=>({name:n.callFrame.functionName,url:n.callFrame.url,line:n.callFrame.lineNumber,samples:counts.get(n.id)||0})).sort((a,b)=>b.samples-a.samples).slice(0,24);
 const output=process.argv[2]||'E:/Cache/Temp/multiplayer-profile.json';await writeFile(output,JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{await browser.close();}
