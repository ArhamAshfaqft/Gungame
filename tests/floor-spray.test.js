import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {DecalGeometry} from 'three/examples/jsm/geometries/DecalGeometry.js';
import {VillaPanel} from '../src/world/VillaPanel.js';
import {decalSource} from '../src/world/DecalSource.js';
import {projectSurfaceMark} from '../src/world/SurfaceDecal.js';
import {soundEngine} from '../src/audio/SoundEngine.js';
for(const key of ['playWoodHit','playDoorBreak'])soundEngine[key]=()=>{};
function fixture(){
 const material=new T.MeshStandardMaterial({side:T.DoubleSide,vertexColors:true});
 const map={scene:new T.Scene(),panels:[],colliders:[],materials:{floorPanel:material},emitPanelDebris(){}};
 const panel=new VillaPanel(map,{x:0,y:3.4,z:4,width:4,height:4,kind:'floor',construction:{thickness:.035,strength:150,boardWidth:.2}});
 panel.group.rotation.x=-Math.PI/2;panel.syncCollision();return{map,panel};
}
test('cell ray queries preserve exact ray hits and fracture ids through sprayed and broken timber',()=>{
 const {panel}=fixture(),mesh=panel.mesh,ray=new T.Raycaster(),down=new T.Vector3(0,-1,0);
 for(let i=0;i<24;i++){
  const point=mesh.localToWorld(new T.Vector3(.4+i%8*.17,.5+Math.floor(i/8)*.14,.0175));
  ray.set(point.clone().add(new T.Vector3(0,1,0)),down);
  const hit=ray.intersectObject(mesh,false)[0];if(hit)panel.takeBulletHit(hit,36,down,{slot:'assault',energy:1700});
 }
 panel.removePiece(panel.pieces[10],down);panel.refreshCollision();
 for(const direction of [down,new T.Vector3(.2,-1,.1).normalize(),new T.Vector3(0,1,0)])for(let x=0;x<4;x+=.067)for(let z=0;z<4;z+=.113){
  const point=mesh.localToWorld(new T.Vector3(x,z,0));point.y+=direction.y<0?1:-1;ray.set(point,direction);
  const expected=[];T.Mesh.prototype.raycast.call(mesh,ray,expected);expected.sort((a,b)=>a.distance-b.distance);
  const actual=ray.intersectObject(mesh,false);
  assert.deepEqual(actual.map(h=>[h.faceIndex,h.distance]),expected.map(h=>[h.faceIndex,h.distance]));
  for(const h of actual)assert.equal(h.instanceId,mesh.userData.fractureFacePieces[h.faceIndex]);
 }
 assert.deepEqual(mesh.geometry.drawRange,{start:0,count:Infinity});
 for(const piece of panel.pieces)for(const local of [new T.Vector3(piece.bounds.min.x,piece.center.y,0),new T.Vector3(piece.bounds.max.x,piece.center.y,0)]){
  ray.set(mesh.localToWorld(local).add(new T.Vector3(0,1,0)),down);const expected=[];T.Mesh.prototype.raycast.call(mesh,ray,expected);expected.sort((a,b)=>a.distance-b.distance);
  assert.deepEqual(ray.intersectObject(mesh,false).map(h=>[h.faceIndex,h.distance]),expected.map(h=>[h.faceIndex,h.distance]));
 }
});
test('projector broad phase preserves decal triangles, including rotated projectors and hole edges',()=>{
 const {panel}=fixture(),mesh=panel.mesh,ray=new T.Raycaster(new T.Vector3(1,4,3),new T.Vector3(0,-1,0));
 panel.takeBulletHit(ray.intersectObject(mesh,false)[0],36,ray.ray.direction,{slot:'assault',energy:1700});
 for(const size of [new T.Vector3(.1,.1,.05),new T.Vector3(2,1,.1),new T.Vector3(8,8,.3)])for(const angle of [0,.4,1.2]){
  const point=mesh.localToWorld(new T.Vector3(1,1,.0175)),q=mesh.getWorldQuaternion(new T.Quaternion()).multiply(new T.Quaternion().setFromEuler(new T.Euler(.1,0,angle))),orientation=new T.Euler().setFromQuaternion(q);
  const full=new DecalGeometry(mesh,point,orientation,size),source=decalSource(mesh,point,q,size),filtered=new DecalGeometry(source,point,orientation,size);
  for(const key of ['position','normal','uv'])assert.deepEqual(filtered.attributes[key].array,full.attributes[key].array,key);
  if(size.x===.1)assert.ok(source.geometry.index.count<mesh.geometry.index.count/5);
  full.dispose();filtered.dispose();if(source!==mesh)source.geometry.dispose();
 }
 // Attribute/index edits must invalidate the cached bounds, not retain old scars.
 const entry={mesh,decal:new T.Mesh(new T.BufferGeometry()),local:new T.Vector3(1,1,.0175),rotation:new T.Quaternion(),size:new T.Vector3(.1,.1,.05)};
 mesh.geometry.index.array.fill(0);mesh.geometry.index.needsUpdate=true;
 assert.equal(projectSurfaceMark(entry),false);
});
test('non-fracturing floor hits leave existing collision/support data intact',()=>{
 const {panel,map}=fixture(),boxes=[...map.colliders],revision=map.colliders.supportRevision;
 const piece=panel.pieces[0],hit={instanceId:piece.id,point:panel.mesh.localToWorld(new T.Vector3(piece.center.x,piece.center.y,.0175))};
 panel.takeBulletHit(hit,36);assert.equal(map.colliders.length,boxes.length);for(let i=0;i<boxes.length;i++)assert.equal(map.colliders[i],boxes[i]);assert.equal(map.colliders.supportRevision,revision);
 for(let i=0;i<4;i++)panel.takeBulletHit(hit,36);
 assert.ok(panel.broken.has(piece.id));assert.ok(map.colliders.supportRevision>revision);assert.ok(!map.colliders.some(b=>b.pieceId===piece.id));
});
