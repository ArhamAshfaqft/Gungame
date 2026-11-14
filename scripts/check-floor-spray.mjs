import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const browser=await chromium.launch({channel:'chrome',headless:true}),errors=[];
try{
 const page=await browser.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:5181/?map=villa');
 await page.waitForFunction(()=>window.__fastSnipe?.arena?.timberFloors?.length&&!document.querySelector('#btn-play').disabled,null,{timeout:120000});
 const result=await page.evaluate(async()=>{
  const T=await import('/node_modules/three/build/three.module.js'),g=window.__fastSnipe,map=g.arena,w=g.weapon,m=g.movement;
  w.switchWeapon('assault');w.adsProgress=1;m.isGrounded=true;
  const results=[];
  for(const name of ['Lounge breach floor','Archive breach floor','Suite breach floor']){
   const floor=map.timberFloors.find(f=>f.name===name&&f.y===6.8),point=floor.boards.mesh.localToWorld(new T.Vector3(.8,.9,.0175));
   // Real weapon penetration, damage, marks and fragments; move the aim around
   // the breach as an automatic burst would, without advancing player input.
   for(let i=0;i<90;i++){
    const target=point.clone().add(new T.Vector3(Math.floor(i/15)%3*.16+Math.cos(i*2.4)*.065,0,Math.floor(i/45)*.16+Math.sin(i*2.4)*.065));
    m.position.copy(target).add(new T.Vector3(0,1.65,0));g.camera.position.copy(m.position);g.camera.up.set(0,0,-1);g.camera.lookAt(target);
    w.performRaycast();
    for(let frame=0;frame<6;frame++){map.update(1/60,new T.Vector3(80,1.65,80));g.surfaceDamage.update(1/60);}
    if(i%15===0)await new Promise(requestAnimationFrame);
   }
   await map.destruction?.whenIdle();
   const layers=[floor.boards,floor.backing,floor.ceiling].map(p=>({broken:p.broken.size,punctures:p.punctures||0}));
   results.push({name,layers});
  }
  // A cleared three-layer breach must still permit a fall, with no invisible
  // replacement support introduced by the query optimization.
  const floor=map.timberFloors.find(f=>f.name==='Lounge breach floor'&&f.y===6.8),point=floor.boards.mesh.localToWorld(new T.Vector3(1,1,0));
  for(const panel of [floor.boards,floor.backing,floor.ceiling]){for(const cell of panel.pieces)if(Math.hypot(cell.center.x-1,cell.center.y-1)<.9)panel.removePiece(cell,new T.Vector3(0,-1,0));panel.refreshCollision();}
  for(const beam of [...floor.joists])if(beam.mesh.position.distanceTo(point)<1.5)floor.breakJoist(beam);
  m.resetInput();m.isDisabled=false;m.position.copy(point).add(new T.Vector3(0,1.65,0));m.velocity.set(0,0,0);m.isGrounded=true;m.currentHeight=1.65;
  for(let i=0;i<240;i++)m.update(1/120,map.colliders,[]);
  return{results,fallEye:m.position.y,floorHeight:floor.y,workerErrors:map.destruction?.stats.errors||[]};
 });
 console.log(JSON.stringify({...result,errors},null,2));
 assert.ok(result.results.every(r=>r.layers[0].broken>0),'M4 bursts break real boards in each room');
 assert.ok(result.results.every(r=>r.layers.some(l=>l.punctures>0)),'penetration channels survive');
 assert.ok(result.fallEye<result.floorHeight,'player falls through cleared floor');
 assert.deepEqual(result.workerErrors,[]);assert.deepEqual(errors,[]);
}finally{await browser.close()}
