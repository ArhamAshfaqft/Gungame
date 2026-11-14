import {chromium} from 'playwright';
import {execFileSync} from 'node:child_process';
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 const page=await browser.newPage();
 if(process.argv.includes('--baseline'))for(const file of ['FractureGeometry.js','SurfaceDecal.js','VillaPanel.js']){
  const body=execFileSync('git',['show','HEAD:src/world/'+file],{encoding:'utf8'}).replace(/from\s*(['"])three\1/g,"from '/node_modules/three/build/three.module.js'").replace(/from\s*(['"])three\/examples\//g,"from $1/node_modules/three/examples/");
  await page.route('**/src/world/'+file+'*',route=>route.fulfill({contentType:'application/javascript',body}));
 }
 await page.goto('http://127.0.0.1:5181/?map=villa');
 await page.waitForFunction(()=>window.__fastSnipe?.arena?.timberFloors?.length&&!document.querySelector('#btn-play').disabled,null,{timeout:120000});
 const result=await page.evaluate(async verify=>{
  const T=await import('/node_modules/three/build/three.module.js'),g=window.__fastSnipe,map=g.arena;
  const floor=map.timberFloors.find(f=>f.name==='Lounge breach floor'&&f.y===3.4)||map.timberFloors[2];
  if(verify)for(const panel of map.panels){const original=panel.mesh.raycast;panel.mesh.raycast=function(ray,hits){const start=hits.length;original.call(this,ray,hits);const reference=[];T.Mesh.prototype.raycast.call(this,ray,reference);const key=hs=>hs.map(h=>[h.faceIndex,h.distance]).sort((a,b)=>a[0]-b[0]);if(JSON.stringify(key(hits.slice(start)))!==JSON.stringify(key(reference)))throw Error('Ray mismatch: '+panel.name+JSON.stringify({actual:key(hits.slice(start)),expected:key(reference)}));};}
  let seed=1729;Math.random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296};
  const timings={},wrap=(object,key,label)=>{const original=object[key];object[key]=function(...args){const start=performance.now();try{return original.apply(this,args)}finally{(timings[label]??=[]).push(performance.now()-start)}}};
  for(const panel of map.panels){wrap(panel,'takeBulletHit','hit');wrap(panel,'refreshCollision','collision');wrap(panel.mesh,'raycast','panelRay');}
  wrap(g.surfaceDamage,'update','particles');wrap(map,'update','map');
  wrap(g.surfaceDamage,'hit','surfaceHit');
  const shots=[],direction=new T.Vector3(0,-1,0),ray=new T.Raycaster();
  for(let i=0;i<90;i++){
   const point=floor.boards.mesh.localToWorld(new T.Vector3(.4+(i%10)*.16,.5+Math.floor(i/10)*.13,0));
   ray.set(point.clone().add(new T.Vector3(0,.5,0)),direction);ray.layers.enableAll();
   const start=performance.now();
   const hits=ray.intersectObjects([floor.boards.mesh,floor.backing.mesh,floor.ceiling.mesh],false),seen=new Set();
   for(const hit of hits){if(seen.has(hit.object))continue;seen.add(hit.object);g.surfaceDamage.hit(hit,'assault',direction,{panel:true,distance:1,damage:36});hit.object.userData.breakable.takeBulletHit(hit,36,direction,{slot:'assault',distance:1,energy:1700});}
   shots.push(performance.now()-start);
   for(let n=0;n<6;n++){map.update(1/60,new T.Vector3(80,1.65,80));g.surfaceDamage.update(1/60);}
  }
  const summary=values=>({n:values.length,total:values.reduce((a,b)=>a+b,0),max:Math.max(...values),p95:[...values].sort((a,b)=>a-b)[Math.floor(values.length*.95)]});
  return{floor:floor.name,shots:summary(shots),timings:Object.fromEntries(Object.entries(timings).map(([k,v])=>[k,summary(v)])),layers:[floor.boards,floor.backing,floor.ceiling].map(p=>({broken:p.broken.size,punctures:p.punctures,vertices:p.mesh.geometry.attributes.position.count}))};
 },process.argv.includes('--verify-rays'));console.log(JSON.stringify(result,null,2));
}finally{await browser.close()}
