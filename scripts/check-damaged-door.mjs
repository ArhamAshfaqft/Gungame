import {Server} from '@colyseus/core';
import {WebSocketTransport} from '@colyseus/ws-transport';
import {chromium} from 'playwright';
import * as T from 'three';
import assert from 'node:assert/strict';
import {PrivateRoom} from '../server/PrivateRoom.js';

const transport=new WebSocketTransport(),server=new Server({transport,gracefullyShutdown:false,express:app=>app.get('/__multiplayer/host-info',(_q,r)=>r.json({addresses:[]}))});
server.define('private',PrivateRoom);await server.listen(0,'127.0.0.1');
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1280,height:720}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:5181/?map=villa&multiplayer=1');
 await page.waitForFunction(()=>window.__fastSnipe&&!window.__fastSnipe.graphicsWarming,{timeout:120000});
 await page.locator('#mp-address').fill('http://127.0.0.1:'+transport.server.address().port);
 await page.locator('#mp-create').click();await page.waitForFunction(()=>window.__fastSnipe.multiplayer?.connected);await page.locator('#btn-play').click();
 const world=PrivateRoom.active.world,p=[...world.players.values()][0],door=world.map.panels.find(d=>d.name==='Wellness courtyard door');assert.ok(door);
 // Leave a jagged latch edge and several low cells, as in the reported case.
 for(const piece of door.pieces.filter(c=>c.center.x>door.width*.7))door.removePiece(piece,new T.Vector3(0,0,1));door.refreshCollision();
 assert.equal(door.detachedEnvironment,undefined);
 p.movement.position.copy(door.group.localToWorld(new T.Vector3(door.width/2,p.movement.currentHeight,.5)));p.movement.velocity.set(0,0,0);p.movement.yaw=door.baseRotation;p.movement.update(0,world.map.colliders);
 await page.waitForTimeout(400);
 const flight=await page.evaluate(async yaw=>{
  const g=window.__fastSnipe,m=g.movement;m.yaw=yaw;m.keys.forward=m.keys.sprint=true;
  const start=performance.now(),initial=m.position.y;let peak=initial,next=0;
  while(performance.now()-start<1800){if(performance.now()-start>next){g.room.interact();next+=100;}await new Promise(requestAnimationFrame);peak=Math.max(peak,m.position.y);}
  m.keys.forward=m.keys.sprint=false;return {initial,peak};
 },door.baseRotation);
 assert.ok(flight.peak-flight.initial<.3,JSON.stringify(flight));
 for(const piece of door.pieces.filter(c=>c.bounds.min.x<.03))door.removePiece(piece,new T.Vector3(0,0,1));door.refreshCollision();
 assert.equal(door.detachedEnvironment,true);const id=door.mesh.userData.netWorldId;
 await page.waitForFunction(id=>window.__fastSnipe.networkWorld.meshes.get(id)?.userData.breakable?.detachedEnvironment,id);
 await page.waitForTimeout(5000);
 const record=world.map.environment.byObject.get(door.group);assert.ok(record.body&&!record.joint);
 const up=new T.Vector3(0,1,0).applyQuaternion(door.group.quaternion);assert.ok(Math.abs(up.y)<.6,'released leaf should have toppled');
 const replica=await page.evaluate(id=>{const g=window.__fastSnipe,d=g.networkWorld.meshes.get(id).userData.breakable;return {detached:d.detachedEnvironment,position:d.group.position.toArray(),up:[d.group.matrixWorld.elements[4],d.group.matrixWorld.elements[5],d.group.matrixWorld.elements[6]]}},id);
 assert.ok(Math.abs(replica.up[1])<.6,'client sees toppled leaf');assert.deepEqual(errors,[]);
 console.log(JSON.stringify({flight,fallingDoor:true,replica,errors}));
}finally{await browser.close();await server.gracefullyShutdown(false);}
