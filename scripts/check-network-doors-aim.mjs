import {Server} from '@colyseus/core';
import {WebSocketTransport} from '@colyseus/ws-transport';
import {Client} from '@colyseus/sdk';
import {chromium} from 'playwright';
import * as T from 'three';
import assert from 'node:assert/strict';
import {PrivateRoom} from '../server/PrivateRoom.js';
import {PROTOCOL} from '../src/multiplayer/Protocol.js';

const transport=new WebSocketTransport(),server=new Server({transport,gracefullyShutdown:false});
server.define('private',PrivateRoom);await server.listen(0,'127.0.0.1');
const address='http://127.0.0.1:'+transport.server.address().port;
const browser=await chromium.launch({channel:'chrome',headless:true});let guest;
try{
 const page=await browser.newPage({viewport:{width:1280,height:720}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:5181/?map=training&multiplayer=1');
 await page.waitForFunction(()=>window.__fastSnipe&&!window.__fastSnipe.graphicsWarming,{timeout:120000});
 await page.locator('#mp-address').fill(address);await page.locator('#mp-create').click();
 await page.waitForFunction(()=>window.__fastSnipe.multiplayer?.connected);
 const room=PrivateRoom.active,world=room.world,p=[...world.players.values()][0];
 await page.locator('#btn-play').click();
 const near=world.room.doorMesh.getWorldPosition(new T.Vector3()).add(new T.Vector3(.5,.5,2));
 p.movement.position.copy(near);p.movement.velocity.set(0,0,0);p.movement.update(0,world.map.colliders);
 await page.waitForTimeout(250);
 const door=await page.evaluate(async()=>{
  const g=window.__fastSnipe,hinge=g.room.doorHinge;let packets=0;const original=g.networkWorld.apply;
  g.networkWorld.apply=function(entries,...args){packets+=entries.filter(e=>e.trainingDoor).length;return original.call(this,entries,...args)};
  const angles=[];g.room.interact();const start=performance.now();
  while(performance.now()-start<800){await new Promise(requestAnimationFrame);angles.push(hinge.rotation.y);}
  g.networkWorld.apply=original;
  return {packets,changedFrames:angles.filter((v,i)=>i&&Math.abs(v-angles[i-1])>1e-5).length,angle:angles.at(-1)};
 });
 assert.ok(door.packets>=3);assert.ok(door.changedFrames>door.packets*1.5,'door advances between network packets');
 guest=await new Client(address).joinById(room.roomId,{map:'training',protocol:PROTOCOL,name:'Target'});guest.onMessage('*',()=>{});guest.send('ready',{layout:world.sync.layout});
 const target=world.players.get(guest.sessionId);
 for(const [player,x] of [[p,-3],[target,3]]){player.movement.position.set(x,5.4,32);player.movement.velocity.set(0,0,0);player.movement.update(0,world.map.colliders);}
 await page.waitForTimeout(350);
 let shot;const emit=world.emit;world.emit=(kind,data)=>{if(kind==='shot')shot=data;emit(kind,data)};
 const aim=await page.evaluate(async target=>{
  const g=window.__fastSnipe,w=g.weapon,m=g.movement,from=g.camera.position,dx=target[0]-from.x,dy=target[1]-from.y,dz=target[2]-from.z;
  m.yaw=Math.atan2(-dx,-dz);m.pitch=Math.atan2(dy,Math.hypot(dx,dz));w.isAiming=true;w.adsProgress=1;
  await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);
  const displayed=m.pitch;w.shoot();return {displayed,afterRecoil:m.pitch};
 },target.camera.position.toArray());
 await page.waitForFunction(()=>window.__fastSnipe.multiplayer.own.kills===1);
 assert.ok(shot.hit?.head,'scope centre hits the authoritative head');assert.ok(aim.afterRecoil>aim.displayed);
 await page.screenshot({path:'E:/Cache/Temp/network-door-aim-proof.png'});
 assert.deepEqual(errors,[]);console.log(JSON.stringify({door,aim,hit:shot.hit,errors}));
}finally{await browser.close();await guest?.leave();await server.gracefullyShutdown(false);}
