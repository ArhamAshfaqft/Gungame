import {chromium} from 'playwright';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {writeFile} from 'node:fs/promises';
import {setTimeout as delay} from 'node:timers/promises';

// npm run profile -- --room library --output report.json [--uncapped]
// Hardware/browser-specific smoke benchmark, not a guarantee of displayed FPS.
const root=fileURLToPath(new URL('../',import.meta.url));
const options=process.argv.slice(2),value=name=>options[options.indexOf(name)+1];
const rooms={study:{spot:[-12.75,7.45,-6],view:[-10,8.45,-4]},library:{spot:[7,3.7,6],view:[4,5.05,4]},kitchen:{spot:[6.5,3.7,-4.1],view:[4,5.05,-2]},bathroom:{spot:[6.5,7.12,-8],view:[4,8.45,-5]},dining:{spot:[-8,3.7,-5],view:[-5,5.05,-3]}};
const roomName=options.includes('--room')?value('--room'):'study',room=rooms[roomName];
if(!room)throw new Error(`Unknown room. Choose: ${Object.keys(rooms).join(', ')}`);
const uncapped=options.includes('--uncapped'),url=options.includes('--url')?value('--url'):'http://127.0.0.1:5188/?map=villa';
let server,browser;
try{
 if(!options.includes('--url')){
  server=spawn(process.execPath,[fileURLToPath(new URL('../node_modules/vite/bin/vite.js',import.meta.url)),'--host','127.0.0.1','--port','5188','--strictPort'],{cwd:root,stdio:'pipe',windowsHide:true});
  let failure='';server.stderr.on('data',data=>{failure+=data;});server.on('error',error=>{failure+=error.message;});
  const deadline=Date.now()+15000;
  while(true){
   if(server.exitCode!==null||failure)throw new Error(`Profiling server failed: ${failure||server.exitCode}`);
   try{if((await fetch(url)).ok)break;}catch{}
   if(Date.now()>deadline)throw new Error('Profiling server did not start.');await delay(100);
  }
 }
 browser=await chromium.launch({channel:process.env.PROFILE_CHANNEL||'chrome',headless:true,args:uncapped?['--disable-frame-rate-limit']:[]});
 const page=await browser.newPage({viewport:{width:1920,height:1080}}),errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.addInitScript(()=>{let seed=12345;Math.random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);});
 await page.goto(url);
 await page.waitForFunction(()=>window.__fastSnipe&&!window.__fastSnipe.graphicsWarming&&!document.querySelector('#camera-toggle').disabled,{timeout:120000});
 const gpu=await page.evaluate(()=>{const gl=window.__fastSnipe.renderer.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info');return ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER);});
 await page.click('#btn-play');
 if(!await page.evaluate(()=>!!document.pointerLockElement))throw new Error('Pointer lock failed; gameplay would not be measured.');
 await page.evaluate(()=>{
  const g=window.__fastSnipe;window.__profilePhases={};
  for(const [object,key,label] of [[g.room,'update','mapIncludingPhysics'],[g.arena.environment,'update','environmentIncludingPhysics'],[g.arena.environment,'syncStatic','staticSupports'],[g.arena.environment.world,'step','physics'],[g.surfaceDamage,'update','damageParticlesAndMarks'],[g.botManager,'update','bots']]){
   const original=object[key];object[key]=function(...args){const start=performance.now();try{return original.apply(this,args);}finally{(window.__profilePhases[label]??=[]).push(performance.now()-start);}};
  }
 });
 const sample=(name,duration,blast=false)=>page.evaluate(async({name,duration,blast,spot})=>{
  const g=window.__fastSnipe;window.__profilePhases={};
  // Align to an existing frame; include blast entry work in the first interval.
  await new Promise(resolve=>requestAnimationFrame(resolve));
  const start=performance.now();let last=start;const intervals=[];
  if(blast)g.equipment.detonate('frag',g.movement.position.clone().fromArray(spot));
  do{await new Promise(resolve=>requestAnimationFrame(resolve));const now=performance.now();intervals.push(now-last);last=now;}while(last-start<duration);
  const stats=values=>{const sorted=[...values].sort((a,b)=>a-b),n=sorted.length;return {samples:n,meanMs:+(sorted.reduce((sum,t)=>sum+t,0)/n).toFixed(2),p95Ms:+sorted[Math.min(n-1,Math.floor(n*.95))].toFixed(2),maxMs:+sorted[n-1].toFixed(2)};};
  return {name,frames:stats(intervals),over16_67Ms:intervals.filter(t=>t>1000/60).length,over20Ms:intervals.filter(t=>t>20).length,over33Ms:intervals.filter(t=>t>1000/30).length,phases:Object.fromEntries(Object.entries(window.__profilePhases).map(([label,times])=>[label,stats(times)])),bodies:g.arena.environment.world.bodies.length,awakeBodies:g.arena.environment.records.filter(r=>r.body&&r.body.sleepState!==2).length,destruction:JSON.parse(JSON.stringify(g.arena.destruction.stats))};
 },{name,duration,blast,spot:room.spot});
 const samples=[await sample('arrival',2000)];
 await page.evaluate(({view,spot})=>{const g=window.__fastSnipe;g.movement.position.fromArray(view);g.movement.yaw=Math.atan2(view[0]-spot[0],view[2]-spot[2]);g.movement.pitch=-.2;},room);
 samples.push(await sample(roomName,2000),await sample(`${roomName} explosion`,8000,true),await sample('recovery',4000));
 const report={gpu,browser:browser.version(),viewport:{width:1920,height:1080},room:roomName,uncapped,note:'Automated headless RAF timings. Nested phase timings overlap. Displayed FPS and other rooms require separate verification.',errors,samples};
 const json=JSON.stringify(report,null,2);if(options.includes('--output'))await writeFile(value('--output'),json+'\n');console.log(json);
 if(errors.length||samples.some(s=>s.destruction.errors.length))process.exitCode=1;
}finally{await browser?.close();server?.kill();}
