import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {LiquidSystem} from '../src/environment/LiquidSystem.js';
import {leakFlow} from '../src/environment/WaterLeaks.js';
import {chipBox} from '../src/world/SurfaceGeometry.js';
import {WorldSync} from '../src/multiplayer/WorldSync.js';
import {liquidState,applyLiquidState} from '../src/multiplayer/LiquidSync.js';

function fixture(){
 const scene=new T.Scene(),map={scene,colliders:[],rubbleFloor:()=>0};
 const wall=new T.Mesh(new T.BoxGeometry(1.4,.8,.1),new T.MeshStandardMaterial());wall.position.set(0,.4,.55);wall.userData.isShootable=true;scene.add(wall);
 const mesh=new T.Mesh(new T.PlaneGeometry(1.2,1),new T.MeshPhysicalMaterial());mesh.rotation.x=-Math.PI/2;mesh.position.y=.6;scene.add(mesh);
 const system=new LiquidSystem(map),body=system.add(mesh,{bottom:.2,floor:0,walls:[wall]}),sync=new WorldSync(scene,map);
 return {map,wall,system,body,sync};
}
function hole(wall,x,y,r=.1){assert.ok(chipBox(wall,new T.Vector3(x,y-.4,.05),new T.Vector3(0,0,1),r,.25));}

test('separate punctures keep separate outlets on actual outer wall openings, including replication',()=>{
 const a=fixture(),b=fixture();hole(a.wall,-.35,.34);hole(a.wall,.32,.51,.08);
 b.sync.apply(a.sync.collect());a.body.inspectLeaks();b.body.inspectLeaks();
 assert.equal(a.body.leaks.length,2);assert.equal(b.body.leaks.length,2);
 for(let i=0;i<2;i++){
  const leak=a.body.leaks[i],other=b.body.leaks[i];assert.ok(leak.point.distanceTo(other.point)<1e-8);assert.ok(Math.abs(leak.area-other.area)<1e-8);
  assert.ok(Math.abs(leak.point.x)>.2,'never average into the solid middle of the wall');assert.ok(Math.abs(leak.point.z-.6)<1e-6,'outlet is on outer surface, not the shell centre plane');
  const ray=new T.Raycaster(leak.point.clone().addScaledVector(leak.normal,-.12),leak.normal,0,.14);assert.equal(ray.intersectObject(a.wall).length,0,'jet starts in a through-hole');
 }
 const initial=a.body.volume;a.body.update(1/60);assert.equal(a.body.streams.length,2);assert.equal(a.body.streamMesh.count,10);
 assert.ok(Math.abs(a.body.volume+a.system.spilled-initial)<1e-10,'all discharged water is accounted for');
 applyLiquidState(b.system,liquidState(a.system));assert.equal(a.body.level,b.body.level);
 const geometry=a.body.streamMesh.geometry;for(let i=0;i<20;i++)a.body.update(1/60);assert.equal(a.body.streamMesh.geometry,geometry,'stream geometry is reused');
});

test('deeper and larger openings discharge more; partial submergence reduces area and dry holes stop',()=>{
 const opening=(y,area)=>({point:new T.Vector3(),cells:[{point:new T.Vector3(0,y,0),bottom:y-.01,top:y+.01,area}]});
 const low=opening(.3,.002),high=opening(.5,.002);
 assert.ok(leakFlow(low,.6).flow>leakFlow(high,.6).flow);
 assert.ok(Math.abs(leakFlow(opening(.3,.004),.6).flow/leakFlow(low,.6).flow-2)<1e-10);
 assert.equal(leakFlow(high,.48).flow,0);
 assert.ok(leakFlow(high,.5).flow<leakFlow(high,.52).flow);
 assert.ok(Math.abs(leakFlow(low,.6).flow-.62*.002*Math.sqrt(2*9.81*.3))<1e-10);
});

test('combined outlets drain faster without ordering bias and stop at the lowest breach',()=>{
 const a=fixture(),b=fixture();hole(a.wall,-.35,.34);hole(b.wall,-.35,.34);hole(b.wall,.32,.51,.08);
 a.body.inspectLeaks();b.body.inspectLeaks();const before=b.body.volume,rates=b.body.leaks.map(l=>leakFlow(l,b.body.level).flow);
 a.body.update(.05);b.body.update(.05);
 assert.ok(b.body.volume<a.body.volume,'extra submerged opening increases drainage');
 assert.ok(Math.abs(before-b.body.volume-rates.reduce((sum,r)=>sum+r,0)*.05)<1e-9);
 const sill=Math.min(...b.body.leaks.map(l=>l.sill));for(let i=0;i<10000;i++)b.body.update(.1);
 assert.ok(b.body.level>=sill-1e-8&&b.body.level<sill+.002);
 assert.ok(Math.abs(b.body.volume+b.system.spilled-b.body.initialVolume)<1e-8);
});

