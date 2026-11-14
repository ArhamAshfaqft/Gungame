import {Server} from '@colyseus/core';
import {WebSocketTransport} from '@colyseus/ws-transport';
import {chromium} from 'playwright';
import * as T from 'three';
import assert from 'node:assert/strict';
import {PrivateRoom} from '../server/PrivateRoom.js';
import {chipBox} from '../src/world/SurfaceGeometry.js';

const transport=new WebSocketTransport(),server=new Server({transport,gracefullyShutdown:false,express:app=>app.get('/__multiplayer/host-info',(_q,r)=>r.json({addresses:[]}))});
server.define('private',PrivateRoom);await server.listen(0,'127.0.0.1');
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 const pages=[],errors=[];let code,body;
 for(let n=0;n<2;n++){
  const page=await browser.newPage({viewport:{width:1600,height:900}});pages.push(page);page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:5181/?map=villa&multiplayer=1');await page.waitForFunction(()=>window.__fastSnipe&&!window.__fastSnipe.graphicsWarming,{timeout:120000});
  await page.locator('#mp-address').fill('http://127.0.0.1:'+transport.server.address().port);
  if(n){await page.locator('#mp-code').fill(code);await page.locator('#mp-join').click();}else await page.locator('#mp-create').click();
  await page.waitForFunction(()=>window.__fastSnipe.multiplayer?.connected);code=await page.evaluate(()=>window.__fastSnipe.multiplayer.code);await page.locator('#btn-play').click();
  if(!n){
   const world=PrivateRoom.active.world;body=world.map.liquids.bodies.find(b=>b.walls.some(w=>w.name==='Bathtub shell'));
   const wall=body.walls[3];wall.updateWorldMatrix(true,false);wall.geometry.computeBoundingBox();
   for(const [x,height] of [[-.8,.1],[0,.22],[.8,.32]]){
    const point=wall.worldToLocal(new T.Vector3(body.x+x,body.bottom+height,wall.position.z));point.z=wall.geometry.boundingBox.max.z;
    assert.ok(chipBox(wall,point,new T.Vector3(0,0,1),.09,.3));
   }
   body.inspectLeaks();assert.equal(body.leaks.length,3);
  }
  await page.waitForFunction(()=>window.__fastSnipe.arena.liquids.bodies.some(b=>b.leaks.length===3&&b.streamMesh?.count===15),null,{timeout:15000});
 }
 const results=[];
 for(const page of pages)results.push(await page.evaluate(()=>{
  const b=window.__fastSnipe.arena.liquids.bodies.find(b=>b.walls.some(w=>w.name==='Bathtub shell'));
  return {outlets:b.streams.map(s=>({point:s.point.toArray(),flow:s.flow,head:s.head})),leaks:b.leaks.length,draws:1,instances:b.streamMesh.count,level:b.level};
 }));
 for(const r of results){assert.equal(r.leaks,3);assert.equal(r.instances,15);assert.ok(r.outlets.every(s=>Math.abs(s.point[0]-body.x)<1.0));assert.ok(r.outlets[0].head>r.outlets[2].head,'lower hole has more pressure');}
 // Put the inspected tub in view; never save or alter the pose library.
 const world=PrivateRoom.active.world,p=[...world.players.values()][0];p.movement.position.set(body.x,body.floor+1.65,body.z+3.1);p.movement.velocity.set(0,0,0);p.movement.yaw=0;p.movement.pitch=-.32;
 await pages[0].bringToFront();
 await pages[0].evaluate(()=>{const g=window.__fastSnipe;g.movement.pitch=-.4;g.weapon.viewmodelScene.visible=false;});
 await pages[0].waitForTimeout(600);
 await pages[0].screenshot({path:'E:/Cache/Temp/multiple-water-leaks-fixed.png'});
 assert.deepEqual(errors,[]);console.log(JSON.stringify({results,errors}));
}finally{await browser.close();await server.gracefullyShutdown(false);}
