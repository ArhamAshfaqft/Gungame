import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {GameWorld} from '../server/GameWorld.js';
import {WorldSync} from '../src/multiplayer/WorldSync.js';
import {LiquidSystem} from '../src/environment/LiquidSystem.js';
import {liquidState,applyLiquidState} from '../src/multiplayer/LiquidSync.js';
import {waterImpact,playMaterialEffect} from '../src/multiplayer/MaterialEffects.js';
import {VillaPanel} from '../src/world/VillaPanel.js';

test('replicated enemy door cues retain their door position and do not replay on late join',()=>{
 const map={scene:new T.Scene(),materials:{woodPanel:new T.MeshStandardMaterial(),metal:new T.MeshStandardMaterial()},colliders:[],panels:[],emitPanelDebris(){}};
 const door=new VillaPanel(map,{x:18,y:3.4,z:-8,width:1.2,height:2.3,door:true}),sync=new WorldSync(map.scene,map);
 door.open=true;const entry=sync.collect().find(e=>e.effect?.kind==='doorOpen');assert.ok(entry);
 const sounds=[];playMaterialEffect(entry.effect,{playDoorOpen:position=>sounds.push(position.toArray())});
 assert.deepEqual(sounds,[entry.effect.position]);assert.ok(sounds[0][0]>17);assert.equal(sync.collect().length,0);assert.ok(sync.snapshot().every(e=>!e.effect));
});
import {chipBox} from '../src/world/SurfaceGeometry.js';

function fixture(){
 const scene=new T.Scene(),map={scene,colliders:[],rubbleFloor:()=>0};
 const wall=new T.Mesh(new T.BoxGeometry(1.2,.8,.1),new T.MeshStandardMaterial());wall.position.set(0,.4,.55);wall.userData={isShootable:true,physicalMaterial:'ceramic'};scene.add(wall);
 const water=new T.Mesh(new T.PlaneGeometry(1,1),new T.MeshPhysicalMaterial());water.rotation.x=-Math.PI/2;water.position.y=.6;scene.add(water);
 const liquids=new LiquidSystem(map),body=liquids.add(water,{bottom:.2,floor:0,walls:[wall]});map.liquids=liquids;
 const sync=new WorldSync(scene,map);return {scene,map,wall,water,liquids,body,sync};
}

test('glass/cup break cues are sent once, spatially, and never replayed for late joiners',()=>{
 for(const material of ['glass','ceramic']){
  const a=fixture(),b=fixture();a.wall.userData.physicalMaterial=material;a.wall.visible=false;
  const entries=a.sync.collect(),entry=entries.find(e=>e.id===a.wall.userData.netWorldId);assert.equal(entry.effect.kind,'glassBreak');
  const played=[];b.sync.apply(entries,{onEffect:effect=>playMaterialEffect(effect,{playSample(key,options){played.push({key,options});return true}})});
  assert.equal(played.length,1);assert.equal(played[0].key,'glassBreak');assert.deepEqual(played[0].options.position.toArray(),[0,.4,.55]);
  assert.equal(a.sync.collect().length,0);assert.ok(a.sync.snapshot().every(e=>!e.effect));
 }
});

test('replicated tub punctures discover leaks and late joins retain water volume and puddles',()=>{
 const a=fixture(),b=fixture();
 assert.ok(chipBox(a.wall,new T.Vector3(0,.05,.05),new T.Vector3(0,0,1),.18,.2));
 const changes=a.sync.collect();assert.equal(changes.find(e=>e.id===a.wall.userData.netWorldId).fractured,true);
 b.sync.apply(changes);assert.equal(b.wall.userData.fractureSolids,undefined,'no duplicate CSG solids need transmitting');
 a.body.inspectLeaks();b.body.inspectLeaks();assert.ok(a.body.leaks.length);assert.equal(b.body.leaks.length,a.body.leaks.length);
 assert.ok(Math.abs(b.body.leaks[0].area-a.body.leaks[0].area)<1e-8);
 for(let i=0;i<45;i++)a.liquids.update(1/60);
 assert.ok(a.body.volume<a.body.initialVolume);assert.ok(a.liquids.spilled>0);
 const state=liquidState(a.liquids);applyLiquidState(b.liquids,state);
 assert.equal(b.body.volume,a.body.volume);assert.equal(b.body.level,a.body.level);assert.deepEqual([...b.liquids.cells.values()],[...a.liquids.cells.values()].filter(c=>c.volume>.000001));
});

test('water impacts create bounded water effects instead of dry-surface effects',()=>{
 const a=fixture();assert.equal(waterImpact(a.water,{surface:'water',point:[.2,.6,.1],strength:125}),true);
 assert.equal(a.liquids.ripples.length,1);assert.ok(a.liquids.drops.pieces.length);assert.equal(a.liquids.ripples[0].body,a.body);
 assert.equal(waterImpact(a.wall,{surface:'ceramic',point:[0,.4,.55]}),false);
});

test('authoritative villa bullet identifies water and still penetrates to the tub below',()=>{
 const events=[],world=new GameWorld('villa',(kind,data)=>{if(kind==='shot')events.push(data)});
 try{
  const p=world.addPlayer('host','Host'),body=world.map.liquids.bodies.find(b=>b.walls.some(w=>w.name==='Bathtub shell'));
  p.camera.position.set(body.x-body.width*.25,body.level+.12,body.z+body.depth*.3);p.movement.pitch=-Math.PI/2;p.movement.yaw=0;p.movement.isAiming=true;
  const random=Math.random;Math.random=()=>.5;try{world.fire(p)}finally{Math.random=random}
  const impacts=events[0].impacts;assert.equal(impacts[0].surface,'water');assert.equal(impacts[0].id,body.mesh.userData.netWorldId);
  assert.ok(impacts.length>1,'water is penetrated, not a hard stop');assert.ok(impacts.slice(1).some(i=>i.submerged));
 }finally{world.dispose();}
});
