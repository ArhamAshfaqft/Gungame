import {Server} from '@colyseus/core';
import {WebSocketTransport} from '@colyseus/ws-transport';
import {chromium} from 'playwright';
import * as T from 'three';
import assert from 'node:assert/strict';
import {PrivateRoom} from '../server/PrivateRoom.js';

const transport=new WebSocketTransport(),server=new Server({transport,gracefullyShutdown:false});
server.define('private',PrivateRoom);await server.listen(0,'127.0.0.1');
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1280,height:720}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:5181/?map=villa&multiplayer=1');
 await page.waitForFunction(()=>window.__fastSnipe&&!window.__fastSnipe.graphicsWarming,{timeout:120000});
 await page.locator('#mp-address').fill('http://127.0.0.1:'+transport.server.address().port);await page.locator('#mp-create').click();
 await page.waitForFunction(()=>window.__fastSnipe.multiplayer?.connected);await page.locator('#btn-play').click();
 const world=PrivateRoom.active.world,p=[...world.players.values()][0],results=[];
 for(const height of [3.4,6.8]){
  const door=world.map.panels.find(d=>d.isDoor&&!d.partner&&Math.abs(d.group.position.y-height)<.3);assert.ok(door);
  door.open=false;door.openAmount=0;door.group.rotation.y=door.baseRotation;door.syncCollision();
  p.movement.position.copy(door.group.localToWorld(new T.Vector3(door.width/2,p.movement.currentHeight,.75)));p.movement.velocity.set(0,0,0);p.movement.yaw=door.baseRotation;p.movement.pitch=0;p.movement.update(0,world.map.colliders);
  await page.waitForTimeout(350);
  const result=await page.evaluate(async yaw=>{
   const g=window.__fastSnipe,m=g.movement;m.yaw=yaw;m.keys.forward=true;m.keys.sprint=true;
   const start=performance.now(),initial=m.position.y;let next=0,toggles=0,peak=initial,cameraPeak=g.camera.position.y,frames=0;
   while(performance.now()-start<1200){
    if(performance.now()-start>=next){g.room.interact();next+=150;toggles++;}
    await new Promise(requestAnimationFrame);peak=Math.max(peak,m.position.y);cameraPeak=Math.max(cameraPeak,g.camera.position.y);frames++;
   }
   m.keys.forward=m.keys.sprint=false;return {initial,peak,cameraPeak,frames,toggles,final:m.position.toArray()};
  },door.baseRotation);
  assert.ok(result.peak-result.initial<.6,JSON.stringify(result));assert.ok(result.cameraPeak-result.initial<.7,JSON.stringify(result));
  results.push({height,...result});
 }
 assert.deepEqual(errors,[]);console.log(JSON.stringify({results,errors}));
}finally{await browser.close();await server.gracefullyShutdown(false);}
