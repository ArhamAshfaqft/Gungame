import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {GameWorld} from '../server/GameWorld.js';
import {WorldSync} from '../src/multiplayer/WorldSync.js';
import {PROTOCOL,STEP,validInput,withWorldSeed,readInput} from '../src/multiplayer/Protocol.js';

test('server owns movement, ammo, hit detection, teams, kills and respawning',()=>{
 const events=[],w=new GameWorld('training',(kind,data)=>events.push({kind,data}));
 try{
  const a=w.addPlayer('a','<Host>'),b=w.addPlayer('b','Guest'),c=w.addPlayer('c','Friend');
  assert.equal(a.name,'Host');assert.equal(a.team,c.team);assert.notEqual(a.team,b.team);
  const input={seq:1,keys:{forward:true},yaw:0,pitch:0,slot:'primary'};
  assert.equal(validInput(input),true);assert.equal(validInput({...input,yaw:NaN}),false);
  w.enqueue(a,[input]);for(let i=0;i<6;i++)w.step();assert.ok(a.movement.position.z<32);
  a.movement.position.set(-3,1.65,32);b.movement.position.set(3,1.65,32);c.movement.position.set(-10,1.65,32);a.movement.velocity.set(0,0,0);a.movement.resetInput();a.movement.update(0,w.map.colliders);
  w.action(a,{seq:1,kind:'fire',slot:'pistol',yaw:-Math.PI/2,pitch:-.07});assert.equal(a.ammo.pistol.ammo,14);assert.equal(b.hp,66);
  w.action(a,{seq:2,kind:'fire',slot:'pistol',yaw:-Math.PI/2,pitch:-.07,damage:9999,target:'b'});assert.equal(b.hp,66,'fire-rate and damage are server controlled');
  for(let i=0;i<12;i++)w.step();w.action(a,{seq:3,kind:'fire',slot:'primary',yaw:-Math.PI/2,pitch:0});assert.equal(b.hp,0);assert.equal(a.kills,1);assert.equal(b.deaths,1);assert.equal(w.teamScores[0],1);
  for(let i=0;i<190;i++)w.step();assert.equal(b.hp,100);assert.equal(b.ammo.primary.ammo,5);
  assert.ok(events.some(e=>e.kind==='eliminated'));
  w.action(a,{seq:4,kind:'reload',slot:'pistol'});assert.ok(a.reload);for(let i=0;i<75;i++)w.step();assert.equal(a.ammo.pistol.ammo,15);assert.equal(a.ammo.pistol.reserve,44);
 }finally{w.dispose();}
});

test('private worlds have identical IDs and late join patches preserve actual floor holes and collision',()=>{
 const server=new GameWorld('villa'),client=new GameWorld('villa');
 try{
  assert.equal(server.sync.layout,client.sync.layout);assert.ok(server.sync.layout>1000);
  for(const [id,m] of server.sync.meshes){const other=client.sync.meshes.get(id);assert.equal(other.name,m.name);assert.ok(other.matrixWorld.equals(m.matrixWorld));}
  const floor=server.map.timberFloors[0],panel=floor.boards,cell=panel.pieces[3],point=panel.mesh.localToWorld(new T.Vector3(cell.center.x,cell.center.y,.0175)),direction=new T.Vector3(0,-1,0);
  panel.takeBulletHit({point,instanceId:cell.id},36,direction,{slot:'assault',energy:1700});
  const changes=server.sync.collect();assert.ok(changes.some(e=>e.geometry));client.sync.apply(changes);
  const mirror=client.sync.meshes.get(panel.mesh.userData.netWorldId);
  assert.deepEqual(mirror.geometry.attributes.position.array,panel.mesh.geometry.attributes.position.array);
  panel.removePiece(cell,direction);panel.refreshCollision();server.sync.collect();client.sync.apply(server.sync.snapshot());
  assert.ok(mirror.userData.breakable.broken.has(cell.id));
  const serverBoxes=server.map.colliders.filter(b=>b.supportMesh===panel.mesh),clientBoxes=client.map.colliders.filter(b=>b.supportMesh===mirror);
  assert.equal(serverBoxes.length,clientBoxes.length);assert.deepEqual(clientBoxes.map(b=>[b.min.toArray(),b.max.toArray()]),serverBoxes.map(b=>[b.min.toArray(),b.max.toArray()]));
 }finally{server.dispose();client.dispose();}
});

test('cooked grenades use server inventory, launch position, fuse and damage',()=>{
 const events=[],w=new GameWorld('training',(kind,data)=>events.push({kind,data}));
 try{
  const a=w.addPlayer('a','Host');w.action(a,{seq:1,kind:'pin',type:'frag'});assert.equal(a.counts.frag,1);
  w.action(a,{seq:2,kind:'pin',type:'frag'});assert.equal(a.counts.frag,1);
  for(let i=0;i<25;i++)w.step();w.action(a,{seq:3,kind:'throw',mode:'low',position:[1000,1000,1000]});assert.equal(w.projectiles.length,1);assert.ok(w.projectiles[0].position.distanceTo(a.movement.position)<2);
  for(let i=0;i<380;i++)w.step();assert.equal(w.projectiles.length,0);assert.ok(events.some(e=>e.kind==='detonate'));
 }finally{w.dispose();}
});
