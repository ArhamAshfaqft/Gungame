import {Server} from '@colyseus/core';
import {WebSocketTransport} from '@colyseus/ws-transport';
import {chromium} from 'playwright';
import * as T from 'three';
import assert from 'node:assert/strict';
import {PrivateRoom} from '../server/PrivateRoom.js';
const transport=new WebSocketTransport(),server=new Server({transport,gracefullyShutdown:false,express:app=>app.get('/__multiplayer/host-info',(_req,res)=>res.json({addresses:[]}))});server.define('private',PrivateRoom);await server.listen(0,'127.0.0.1');
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1280,height:720}}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
 page.on('response',r=>{if(r.status()>=400)console.log('HTTP',r.status(),r.url())});
 await page.goto('http://127.0.0.1:5181/?map=villa&multiplayer=1');await page.waitForFunction(()=>window.__fastSnipe&&!window.__fastSnipe.graphicsWarming,{timeout:120000});
 await page.locator('#mp-address').fill('http://127.0.0.1:'+transport.server.address().port);await page.locator('#mp-create').click();await page.waitForFunction(()=>window.__fastSnipe.multiplayer?.connected);await page.locator('#btn-play').click();
 const world=PrivateRoom.active.world,p=[...world.players.values()][0];p.pin={type:'frag',time:world.time};world.launch(p,'high');const id=world.projectiles[0].id;
 await page.waitForFunction(id=>window.__fastSnipe.multiplayer.grenades.has(id),id);
 const flight=await page.evaluate(async id=>{
  const g=window.__fastSnipe,mesh=g.multiplayer.grenades.get(id),start=performance.now();let previous=mesh.position.clone(),changed=0;const ticks=new Set();
  while(performance.now()-start<700){await new Promise(requestAnimationFrame);ticks.add(g.multiplayer.lastSnapshot.time);if(previous.distanceToSquared(mesh.position)>1e-9)changed++;previous.copy(mesh.position);}
  return {changedFrames:changed,snapshots:ticks.size};
 },id);
 assert.ok(flight.changedFrames>flight.snapshots*1.3,JSON.stringify(flight));
 world.detonate('smoke',new T.Vector3(0,.1,23),p.id);
 await page.waitForFunction(()=>window.__fastSnipe.smokePass.enabled);
 world.detonate('flash',p.camera.position.clone().add(new T.Vector3(0,0,-2)),p.id);
 await page.waitForFunction(()=>window.__fastSnipe.equipment.detonationEffects.until>0);
 assert.deepEqual(errors,[]);console.log(JSON.stringify({flight,networkSmoke:true,flashEffect:true,errors}));
}finally{await browser.close();await server.gracefullyShutdown(false);}


