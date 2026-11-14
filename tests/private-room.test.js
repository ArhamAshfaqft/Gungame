import test from 'node:test';
import assert from 'node:assert/strict';
import {Server} from '@colyseus/core';
import {WebSocketTransport} from '@colyseus/ws-transport';
import {Client} from '@colyseus/sdk';
import {gunzipSync} from 'node:zlib';
import * as T from 'three';
import {PrivateRoom} from '../server/PrivateRoom.js';
import {PROTOCOL} from '../src/multiplayer/Protocol.js';
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(predicate,timeout=5000){const start=Date.now();while(!predicate()){if(Date.now()-start>timeout)throw Error('Network check timed out');await wait(20);}}

test('real sockets enforce room access/capacity, real-time ticks, shared geometry and late joins',async()=>{
 const transport=new WebSocketTransport({maxPayload:32*1024}),server=new Server({transport,gracefullyShutdown:false}),rooms=[];
 server.define('private',PrivateRoom);await server.listen(0,'127.0.0.1');const client=new Client('http://127.0.0.1:'+transport.server.address().port),options={map:'villa',name:'Host',password:'friends',protocol:PROTOCOL};
 try{
  const host=await client.create('private',options);rooms.push(host);host.onMessage('*',()=>{});
  await assert.rejects(client.joinById(host.roomId,{...options,password:'wrong'}),/password/i);
  await assert.rejects(client.joinById(host.roomId,{...options,map:'training'}),/villa/i);
  await assert.rejects(client.create('private',options),/already has a match/i);
  const active=PrivateRoom.active,world=active.world;let snapshot=null,patch=[];
  host.onMessage('snapshot',data=>snapshot=data);host.onMessage('world',packet=>{const bytes=packet.bytes instanceof Uint8Array?packet.bytes:new Uint8Array(packet.bytes.data||packet.bytes);patch.push(...JSON.parse(gunzipSync(bytes).toString()));});
  host.send('ready',{layout:world.sync.layout});await until(()=>snapshot!==null);
  const started=snapshot.time,wall=Date.now();await wait(1200);assert.ok(snapshot.time-started>.9,'shared framework timers must not slow simulation to half speed');assert.ok(snapshot.time-started<(Date.now()-wall)/1000+.2);
  const floor=world.map.timberFloors[0],panel=floor.boards,piece=panel.pieces[4],point=panel.mesh.localToWorld(new T.Vector3(piece.center.x,piece.center.y,.0175));
  panel.takeBulletHit({point,instanceId:piece.id},36,new T.Vector3(0,-1,0),{slot:'assault',energy:1700});
  await until(()=>patch.some(p=>p.id===panel.mesh.userData.netWorldId&&p.geometry));assert.ok(patch.find(p=>p.geometry).geometry.attributes.position.array.length>0);
  panel.removePiece(piece,new T.Vector3(0,-1,0));panel.refreshCollision();await wait(180);
  const guest=await client.joinById(host.roomId,{...options,name:'Guest'});rooms.push(guest);guest.onMessage('*',()=>{});let initial=null;
  guest.onMessage('world',packet=>{if(packet.initial)initial=JSON.parse(gunzipSync(packet.bytes).toString());});guest.send('ready',{layout:world.sync.layout});await until(()=>initial!==null);
  assert.ok(initial.find(p=>p.id===panel.mesh.userData.netWorldId).panel.broken.includes(piece.id),'late joiner receives previously broken boards');
  for(const name of ['Third','Fourth']){const room=await client.joinById(host.roomId,{...options,name});room.onMessage('*',()=>{});rooms.push(room);}
  await assert.rejects(client.joinById(host.roomId,{...options,name:'Fifth'}),/full|locked|seat|available/i);
  // Malformed and teleport payloads cannot directly move an authoritative player.
  const before=world.players.get(host.sessionId).movement.position.clone();host.send('input',[{seq:1,keys:{},yaw:NaN,pitch:0,slot:'assault',position:[999,999,999]}]);await wait(100);assert.ok(world.players.get(host.sessionId).movement.position.distanceTo(before)<.1);
 }finally{
  await Promise.all(rooms.map(room=>room.leave().catch(()=>{})));await wait(100);await server.gracefullyShutdown(false);
 }
});
