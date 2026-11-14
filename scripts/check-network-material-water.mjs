import {Server} from '@colyseus/core';
import {WebSocketTransport} from '@colyseus/ws-transport';
import {chromium} from 'playwright';
import * as T from 'three';
import assert from 'node:assert/strict';
import {PrivateRoom} from '../server/PrivateRoom.js';
import {removeProp} from '../src/world/MaterialProps.js';
import {chipBox} from '../src/world/SurfaceGeometry.js';
const transport=new WebSocketTransport(),server=new Server({transport,gracefullyShutdown:false});server.define('private',PrivateRoom);await server.listen(0,'127.0.0.1');
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 const pages=[],errors=[];let code;
 for(let i=0;i<2;i++){
  const page=await browser.newPage({viewport:{width:1100,height:720}});pages.push(page);page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:5181/?map=villa&multiplayer=1');await page.waitForFunction(()=>window.__fastSnipe&&!window.__fastSnipe.graphicsWarming,{timeout:120000});
  await page.locator('#mp-address').fill('http://127.0.0.1:'+transport.server.address().port);
  if(i){await page.locator('#mp-code').fill(code);await page.locator('#mp-join').click();}else await page.locator('#mp-create').click();
  await page.waitForFunction(()=>window.__fastSnipe.multiplayer?.connected);code=await page.evaluate(()=>window.__fastSnipe.multiplayer.code);await page.locator('#btn-play').click();
  await page.evaluate(async()=>{
   const {soundEngine}=await import('/src/audio/SoundEngine.js');window.effectCues=[];
   const play=soundEngine.playSample.bind(soundEngine);soundEngine.playSample=(key,options)=>{window.effectCues.push(key);return play(key,options)};
  });
 }
 const world=PrivateRoom.active.world,parts=[...world.sync.meshes.values()];
 for(const surface of ['glass','ceramic']){
  const part=parts.find(m=>m.visible&&m.userData.physicalMaterial===surface&&m.userData.damageablePart&&m.geometry.type==='CylinderGeometry');assert.ok(part,`${surface} fixture`);removeProp(part.userData.damageRoot||part,world.map.colliders);
 }
 for(const page of pages)await page.waitForFunction(()=>window.effectCues.filter(k=>k==='glassBreak').length>=2);
 const body=world.map.liquids.bodies.find(b=>b.walls.some(w=>w.name==='Bathtub shell')),p=[...world.players.values()][0];
 p.camera.position.set(body.x-body.width*.25,body.level+.12,body.z+body.depth*.3);p.movement.pitch=-Math.PI/2;p.movement.yaw=0;p.movement.isAiming=true;
 const random=Math.random;Math.random=()=>.5;try{world.fire(p)}finally{Math.random=random}
 for(const page of pages)await page.waitForFunction(()=>window.__fastSnipe.arena.liquids.ripples.some(r=>r.kind==='bullet'));
 const wall=body.walls[0];wall.geometry.computeBoundingBox();const size=wall.geometry.boundingBox.getSize(new T.Vector3()),local=wall.worldToLocal(new T.Vector3().setFromMatrixPosition(wall.matrixWorld));local.y+=body.bottom+.1-wall.getWorldPosition(new T.Vector3()).y;
 const axis=size.x<size.z?'x':'z',normal=new T.Vector3();normal[axis]=1;local[axis]=wall.geometry.boundingBox.max[axis];assert.ok(chipBox(wall,local,normal,.22,.4));
 for(const page of pages)await page.waitForFunction(()=>window.__fastSnipe.arena.liquids.bodies.some(b=>b.leaks.length>0),null,{timeout:10000});
 const results=[];for(const page of pages)results.push(await page.evaluate(()=>{const g=window.__fastSnipe,b=g.arena.liquids.bodies.find(b=>b.walls.some(w=>w.name==='Bathtub shell'));return {breakCues:window.effectCues.filter(k=>k==='glassBreak').length,leaks:b.leaks.length,volume:b.volume,initial:b.initialVolume,waterRipples:g.arena.liquids.ripples.filter(r=>r.kind==='bullet').length}}));
 assert.deepEqual(errors,[]);console.log(JSON.stringify({results,errors}));
}finally{await browser.close();await server.gracefullyShutdown(false);}
