import test from 'node:test';import assert from 'node:assert/strict';import * as T from 'three';
import {VillaMap} from '../src/world/VillaMap.js';import {TimberFloor} from '../src/world/TimberFloor.js';import {timberCells} from '../src/world/FractureGeometry.js';import {soundEngine} from '../src/audio/SoundEngine.js';
for(const k of ['playWoodHit','playDoorBreak','playImpact'])soundEngine[k]=()=>{};
function fixture(){const material=()=>new T.MeshStandardMaterial({vertexColors:true});const map={scene:new T.Scene(),colliders:[],panels:[],floorSurfaces:[],materials:{floorPanel:material(),woodPanel:material(),softWall:material(),wood:material()},emitPanelDebris(){},debris:{wake(){}}};map.box=VillaMap.prototype.box;return{map,floor:new TimberFloor(map,{x:0,y:3.4,z:3,width:2,depth:2.6,name:'Test timber bay'})};}

test('grain-aligned timber cells tile the floor exactly with staggered end fractures',()=>{
 const pieces=timberCells(4,3);let area=0;for(const p of pieces){assert.ok(p.bounds.max.x-p.bounds.min.x<=.201);assert.ok(Number.isInteger(p.board)&&Number.isInteger(p.row));let sum=0;for(let i=0;i<p.polygon.length;i++){const a=p.polygon[i],b=p.polygon[(i+1)%p.polygon.length];sum+=a.x*b.y-b.x*a.y;}area+=Math.abs(sum)/2;}
 assert.ok(Math.abs(area-12)<1e-8);
});

test('floor has independent boards, subfloor, ceiling and real shootable joists from the start',()=>{
 const {map,floor}=fixture();assert.equal(floor.boards.mesh.userData.thickness,.035);assert.equal(floor.backing.mesh.userData.thickness,.018);assert.equal(floor.ceiling.mesh.userData.thickness,.012);
 assert.ok(floor.joists.length>0);assert.ok(floor.joists.every(b=>b.mesh.userData.isShootable&&map.colliders.includes(b.mesh.userData.collider)));
 const p=floor.boards.pieces[12];floor.boards.removePiece(p,new T.Vector3(0,-1,0));floor.boards.refreshCollision();
 assert.equal(floor.backing.broken.size,0);assert.equal(floor.ceiling.broken.size,0);assert.ok(map.colliders.includes(floor.backing.collisionBoxes[0]));assert.deepEqual(map.floorSurfaces,[floor.boards.mesh]);
});

test('a close blast breaches successive thin layers while joists retain structural support',()=>{
 const {floor}=fixture(),point=floor.boards.mesh.localToWorld(new T.Vector3(1,1,.18));floor.boards.applyBlast(point,330,2.5);
 assert.ok(floor.boards.broken.size>0);assert.ok(floor.backing.broken.size>0);assert.ok(floor.ceiling.broken.size>0);assert.ok(floor.joists.some(b=>b.mesh.visible));
 const count=floor.boards.broken.size;for(let i=0;i<40;i++)floor.update(.5,new T.Vector3(30,5,30));assert.equal(floor.boards.broken.size,count,'supported boards do not globally collapse or repair');
});

test('blast pressure can enter from below and opaque cover prevents transmitted damage',()=>{
 const a=fixture(),point=a.floor.ceiling.mesh.localToWorld(new T.Vector3(1,1,-.15));a.floor.ceiling.applyBlast(point,330,2.5);assert.ok(a.floor.boards.broken.size>0);
 const b=fixture();b.floor.boards.applyBlast(new T.Vector3(1,3.6,2),330,3,()=>false);assert.equal(b.floor.boards.health.size,0);assert.equal(b.floor.backing.broken.size,0);assert.equal(b.floor.ceiling.broken.size,0);assert.ok(b.floor.joists.every(j=>j.health===0),'opaque cover also shields the joists');
});

test('severing both supporting joists collapses the unsupported strip, not the whole bay',()=>{
 const {floor}=fixture(),target=floor.boards.pieces.find(p=>p.row===1&&p.board===3),edge=floor.boards.pieces.find(p=>p.row===0&&p.board===3);
 for(const b of floor.joists.filter(b=>b.row===1||b.row===2))floor.breakJoist(b);
 floor.update(.2,new T.Vector3(30,5,30));assert.ok(floor.boards.broken.has(target.id));assert.ok(!floor.boards.broken.has(edge.id),'perimeter-supported boards survive');assert.ok(floor.boards.broken.size<floor.boards.pieces.length);
});

test('a damaged cantilever fails under crouched player load after a warning delay',()=>{
 const {floor}=fixture(),target=floor.boards.pieces.find(p=>p.row===1&&p.board===3);floor.boards.health.set(target.id,90);
 for(const b of floor.joists.filter(b=>b.row===1))floor.breakJoist(b);
 const eye=floor.boards.mesh.localToWorld(new T.Vector3(target.center.x,target.center.y,0));eye.y=4.45;
 floor.update(.2,eye,{height:1.05,speed:0});assert.ok(!floor.boards.broken.has(target.id));
 for(let i=0;i<4;i++)floor.update(.2,eye,{height:1.05,speed:0});assert.ok(floor.boards.broken.has(target.id));
});
