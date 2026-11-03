import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {VillaMap,VILLA_LEVELS,VILLA_ROOMS} from '../src/world/VillaMap.js';
import {batchVillaPanels,batchVillaProps} from '../src/world/VillaPanelBatch.js';
import {hasLineOfSight} from '../src/weapons/CombatQueries.js';
import {VillaPanel} from '../src/world/VillaPanel.js';
import {soundEngine} from '../src/audio/SoundEngine.js';
for(const key of ['playWoodHit','playDoorBreak','playDoorOpen','playGlassBreak','playImpact'])soundEngine[key]=()=>{};

test('villa has three furnished levels, two internal stairs per transition, and bounded initial collision',()=>{
 const scene=new THREE.Scene(),map=new VillaMap(scene);
 assert.deepEqual(VILLA_LEVELS,[0,3.4,6.8]);assert.equal(VILLA_ROOMS.length,20);
 assert.equal(map.colliders.filter(b=>b.stairName==='Main staircase').length,2);
 assert.equal(map.colliders.filter(b=>b.stairName==='Service staircase').length,2);
 assert.ok(map.colliders.length<1400,'hollow furniture and timber finish layers remain within the authored collision budget');assert.ok(map.panels.length>60);
 assert.equal(map.panels.filter(p=>p.name.includes('floor hatch')).length,2);
 assert.ok(map.panels.some(p=>p.kind==='plaster'));assert.ok(map.panels.some(p=>p.kind==='glass'));
 assert.match(map.location(new THREE.Vector3(-8,5.05,5)),/Hearth salon/);
 assert.match(map.location(new THREE.Vector3(7,8.45,5)),/Guest suite/);
 assert.match(map.location(new THREE.Vector3(-8,1.65,5)),/Garage/);
 const between=(x,y,z)=>map.colliders.filter(b=>!b.ramp&&b.containsPoint(new THREE.Vector3(x,y,z)));
 assert.equal(between(0,3.4,-4.5).length,0,'main stairwell must not be capped by a solid floor');
 assert.equal(between(11.75,6.8,-4.5).length,0,'service stairwell remains open');
});
function panelFixture(kind='plaster',door=false){const scene=new THREE.Scene(),map={scene,colliders:[],panels:[],materials:{floorPanel:new THREE.MeshStandardMaterial({vertexColors:true}),softWall:new THREE.MeshStandardMaterial({vertexColors:true}),woodPanel:new THREE.MeshStandardMaterial({vertexColors:true}),glass:new THREE.MeshStandardMaterial({vertexColors:true}),metal:new THREE.MeshStandardMaterial()},emitPanelDebris(){}};const panel=new VillaPanel(map,{x:0,y:0,z:0,width:2,height:2.8,kind,door});panel.baseRotation=0;return{map,panel};}

test('villa plaster accumulates pistol damage and leaves real openings with matching collision',()=>{
 const {map,panel}=panelFixture();const piece=panel.pieces[Math.floor(panel.pieces.length/2)],point=new THREE.Vector3(piece.center.x,piece.center.y,0),hit={point,instanceId:piece.id};
 assert.equal(map.colliders.length,1);panel.takeBulletHit(hit,34);assert.equal(panel.broken.size,0);
 for(let i=0;i<5;i++)panel.takeBulletHit(hit,34);assert.ok(panel.broken.has(piece.id));assert.ok(!map.colliders.includes(panel.boxes.get(piece.id)));
 assert.ok(panel.mesh.geometry.index.array.slice(piece.start,piece.start+piece.count).every(i=>i===0));
 const sniper=panelFixture();sniper.panel.takeBulletHit({point,instanceId:piece.id},125);sniper.panel.takeBulletHit({point,instanceId:piece.id},125);assert.ok(sniper.panel.broken.has(piece.id));
});

test('villa glass transmits shots after shattering and removes its blocking collision permanently',()=>{
 const {map,panel}=panelFixture('glass');const result=panel.takeBulletHit({point:new THREE.Vector3(1,1,0)},34);
 assert.equal(result.penetrates,true);assert.equal(result.damageMultiplier,.8);assert.equal(panel.mesh.visible,false);assert.equal(map.colliders.length,0);
 panel.update(60);assert.equal(panel.mesh.visible,false,'flagship destruction does not reset on the training timer');
});

test('villa hinged doors move collision with the leaf rather than leaving a closed invisible barrier',()=>{
 const {map,panel}=panelFixture('wood',true);const before=map.colliders[0].clone();panel.toggle();panel.update(1);assert.ok(panel.group.rotation.y<-1.5);
 assert.ok(map.colliders[0].max.x<before.max.x-.5);assert.ok(map.colliders[0].max.z>before.max.z+1);
 panel.toggle();panel.update(2);assert.ok(Math.abs(panel.group.rotation.y)<.001);
});

test('expanded villa has different floor plans, an accessible east wing and broad destructible floor areas',()=>{
 const scene=new THREE.Scene(),map=new VillaMap(scene);
 assert.ok(VILLA_ROOMS.some(r=>r[5]==='Winter garden'));assert.ok(VILLA_ROOMS.some(r=>r[5]==='Communications'));
 const partitions=map.panels.filter(p=>p.kind==='plaster');assert.ok(partitions.length>200);
 const floorPanels=map.panels.filter(p=>p.kind==='floor');assert.ok(floorPanels.length>=8);
 assert.ok(floorPanels.reduce((sum,p)=>sum+p.width*p.height,0)>70,'floor destruction extends beyond small hatches');
 assert.match(map.location(new THREE.Vector3(19,5.05,-6)),/Winter garden/);
 const exits=map.panels.filter(p=>p.name==='Gallery connection'&&p.group.position.x>13);assert.ok(exits.length>=2);
 for(const p of exits)assert.ok(p.group.position.z<-8,'annex doorway meets the stair landing, not the middle of a flight');
 map.prepareRender(new THREE.Vector3(0,5,4));assert.equal(map.roomLights.filter(l=>l.visible).length,9);
});

test('close blast breaks a local part of wall or floor with matching collision',()=>{
 for(const kind of ['plaster','floor']){
  const {map,panel}=panelFixture(kind);if(kind==='floor'){panel.group.position.y=3.3;panel.group.rotation.x=-Math.PI/2;panel.syncCollision();}
  const before=map.colliders.length;panel.applyBlast(panel.mesh.localToWorld(new THREE.Vector3(1,1.4,.2)),330,3.5);
  assert.ok(panel.broken.size>0,`${kind} should sustain close blast damage`);assert.ok(panel.broken.size<panel.pieces.length*.35,`${kind} must retain most of its area`);
  for(const p of panel.pieces)if(panel.broken.has(p.id))assert.ok(!map.colliders.includes(panel.boxes.get(p.id)));
  assert.ok(before===1);
 }
});

test('batched wall hits identify the original fracture cell and only change that panel render indices',()=>{
 const {map,panel}=panelFixture();const neighbour=new VillaPanel(map,{x:3,y:0,z:0,width:2,height:2.8,kind:'plaster'});batchVillaPanels(map);map.scene.updateMatrixWorld(true);
 const batch=map.fractureBatches[0],ray=new THREE.Raycaster(new THREE.Vector3(1,1.4,2),new THREE.Vector3(0,0,-1),0,3),hit=ray.intersectObject(batch.mesh,false)[0];
 assert.equal(hit.object,panel.mesh);assert.ok(Number.isInteger(hit.instanceId));
 const before=batch.mesh.geometry.index.array.slice();panel.takeBulletHit(hit,125,new THREE.Vector3(0,0,-1));panel.takeBulletHit(hit,125,new THREE.Vector3(0,0,-1));
 const after=batch.mesh.geometry.index.array;assert.ok(before.some((v,i)=>v!==after[i]));
 const firstCount=panel.mesh.geometry.index.count;for(let i=firstCount;i<after.length;i++)assert.equal(after[i],before[i],'neighbour panel retains every triangle');
 assert.ok(neighbour.broken.size===0);
});

test('blast visibility exclusions work through render batches, including a target panel itself',()=>{
 const {map,panel}=panelFixture();batchVillaPanels(map);map.scene.updateMatrixWorld(true);
 const from=new THREE.Vector3(1,1.4,2),to=new THREE.Vector3(1,1.4,0);
 assert.equal(hasLineOfSight(map.scene,from,to),false);
 assert.equal(hasLineOfSight(map.scene,from,to,new Set([panel.mesh])),true);
});

test('furniture leaves its render batch before damage without moving its collision or losing child detail',()=>{
 const scene=new THREE.Scene(),map={scene};const material=new THREE.MeshStandardMaterial();const sources=[];
 for(let i=0;i<3;i++){const mesh=new THREE.Mesh(new THREE.BoxGeometry(1,1,1),material);mesh.position.x=i*2;mesh.userData={isShootable:true,collider:new THREE.Box3().setFromObject(mesh)};scene.add(mesh);sources.push(mesh);}
 const detail=new THREE.Object3D();sources[0].add(detail);const collider=sources[0].userData.collider.clone();batchVillaProps(map);scene.updateMatrixWorld(true);
 const ray=new THREE.Raycaster(new THREE.Vector3(0,0,2),new THREE.Vector3(0,0,-1),0,4),hit=ray.intersectObject(map.propBatches[0].mesh,false)[0];assert.equal(hit.object,sources[0]);
 sources[0].userData.renderBatch.detach(sources[0]);assert.equal(sources[0].layers.mask,1);assert.ok(sources[0].userData.collider.equals(collider));assert.equal(detail.parent,sources[0]);assert.equal(ray.intersectObject(map.propBatches[0].mesh,false).length,0);assert.ok(ray.intersectObject(sources[0],false).length>0);
});

// Regression coverage for the reported villa circulation/destruction failures.
test('wooden doors and floors accept live weapon hits without throwing and accumulate damage',()=>{
 for(const kind of ['wood','floor']){
  const {panel}=panelFixture(kind,kind==='wood');const p=panel.pieces[10],hit={point:new THREE.Vector3(p.center.x,p.center.y,0),instanceId:p.id};
  panel.takeBulletHit(hit,34);if(kind==='floor')assert.equal(panel.broken.size,0);
  for(let i=0;i<7;i++)panel.takeBulletHit(hit,34);assert.ok(panel.broken.has(p.id));
 }
});

test('artwork mounts on solid wall spans with clearance from every opening',()=>{
 const map=new VillaMap(new THREE.Scene());assert.ok(map.artMounts.length>6);
 for(const a of map.artMounts){
  assert.ok(a.x-a.w/2>a.wall.from&&a.x+a.w/2<a.wall.to);
  for(const o of a.wall.openings){
   const overlapsX=a.x+a.w/2>o.at-o.width/2-.15&&a.x-a.w/2<o.at+o.width/2+.15;
   const overlapsY=a.y+a.h/2>a.wall.base+(o.sill||0)&&a.y-a.h/2<a.wall.base+(o.sill||0)+(o.height||2.3);
   assert.ok(!(overlapsX&&overlapsY),'picture must not cover a door or glazing');
  }
 }
});

test('rear hall doors meet supported landings and dressing lounge has a clear through route',()=>{
 const map=new VillaMap(new THREE.Scene());
 for(const y of [0,3.4,6.8])for(const x of [-2.7,2.7]){
  const spec=map.wallSpecs.find(w=>w.axis==='x'&&w.coord===x&&w.base===y);
  assert.ok(spec.openings.some(o=>o.at===-9.4));assert.ok(!spec.openings.some(o=>o.at===-6));
  const feet=new THREE.Vector3(x,y-.1,-9.4);
  assert.ok(map.colliders.some(b=>!b.villaPanel&&!b.ramp&&b.containsPoint(feet)),'landing supports rear threshold');
 }
 for(let z=-1.5;z<3.7;z+=.2){
  const body=new THREE.Box3(new THREE.Vector3(6.1,6.85,z-.25),new THREE.Vector3(6.7,8.5,z+.25));
  assert.ok(!map.colliders.some(b=>!b.villaPanel&&!b.ramp&&body.intersectsBox(b)),'central dressing route remains walkable');
 }
});

test('every authored doorway has a clear player-width approach on both sides',()=>{
 const map=new VillaMap(new THREE.Scene()),blocked=[];
 for(const wall of map.wallSpecs)for(const o of wall.openings){
  if(!['door','open'].includes(o.kind))continue;
  const x=wall.axis==='x'?wall.coord:o.at,z=wall.axis==='z'?wall.coord:o.at;
  const body=new THREE.Box3(new THREE.Vector3(x-(wall.axis==='x'?.85:.33),wall.base+.08,z-(wall.axis==='z'?.85:.33)),new THREE.Vector3(x+(wall.axis==='x'?.85:.33),wall.base+1.8,z+(wall.axis==='z'?.85:.33)));
  const hits=map.colliders.filter(b=>!b.ramp&&!b.villaPanel?.isDoor&&b.intersectsBox(body));
  if(hits.length)blocked.push({x,z,level:wall.base,name:o.name,hits:hits.map(b=>({min:b.min.toArray(),max:b.max.toArray()}))});
 }
 assert.deepEqual(blocked,[]);
});

test('material toughness requires grouped hits and scattered impacts do not share damage',()=>{
 for(const [kind,door,hits] of [['wood',true,5],['wood',false,7],['floor',false,8],['plaster',false,6]]){
  const {panel}=panelFixture(kind,door),piece=panel.pieces[12],hit={point:new THREE.Vector3(piece.center.x,piece.center.y,0),instanceId:piece.id};
  for(let i=0;i<hits-1;i++)panel.takeBulletHit(hit,34);
  assert.equal(panel.broken.size,0,`${kind} remains intact before enough grouped hits`);
  panel.takeBulletHit(hit,34);assert.ok(panel.broken.has(piece.id));assert.ok(panel.broken.size<=2,'damage is confined to the shot location');
 }
 const {panel}=panelFixture('wood');for(const piece of panel.pieces.slice(0,8))panel.takeBulletHit({point:new THREE.Vector3(piece.center.x,piece.center.y,0),instanceId:piece.id},34);
 assert.equal(panel.broken.size,0,'spread shots do not pool into global wall damage');
});

test('a hallway-centre frag preserves both walls; close blast leaves a local hole and physical framing',()=>{
 const map=new VillaMap(new THREE.Scene());
 map.damageExplosion(new THREE.Vector3(0,3.55,3.5),7);
 assert.equal(map.panels.filter(p=>p.kind==='plaster').reduce((n,p)=>n+p.broken.size,0),0);
 map.damageExplosion(new THREE.Vector3(2.12,4.6,3.5),7);
 const damaged=map.panels.filter(p=>p.kind==='plaster'&&p.broken.size);
 assert.ok(damaged.length>0);assert.ok(damaged.every(p=>p.broken.size<p.pieces.length*.3));
 assert.ok(damaged.some(p=>p.frame?.some(mesh=>mesh.userData.isShootable&&map.colliders.includes(mesh.userData.collider))));
 assert.ok(map.blastScars.entries.length>0);
});

test('blast exposure is evaluated before holes form, protecting a second partition',()=>{
 const {map,panel}=panelFixture('plaster');
 const back=new VillaPanel(map,{x:0,y:0,z:-.3,width:2,height:2.8,kind:'plaster'});
 map.blastScars={add(){}};map.blastDust={spawn(){}};
 VillaMap.prototype.damageExplosion.call(map,new THREE.Vector3(1,1.4,.2),7);
 assert.ok(panel.broken.size>0);assert.equal(back.broken.size,0);assert.equal(back.health.size,0,'new hole cannot amplify the same explosion behind cover');
});

test('wide impacts inside one fracture cell cannot pool into a pistol breach',()=>{
 const {panel}=panelFixture('wood',true),piece=panel.pieces[12];
 let a,b,best=0;for(const p of piece.polygon)for(const q of piece.polygon){const distance=p.distanceTo(q);if(distance>best){best=distance;a=p.clone().lerp(piece.center,.2);b=q.clone().lerp(piece.center,.2);}}
 assert.ok(a.distanceTo(b)>.1);
 const hit=p=>({point:new THREE.Vector3(p.x,p.y,0),instanceId:piece.id});
 for(let i=0;i<3;i++){panel.takeBulletHit(hit(a),34);panel.takeBulletHit(hit(b),34);}
 assert.equal(panel.broken.size,0);
 panel.takeBulletHit(hit(a),34);panel.takeBulletHit(hit(a),34);assert.ok(panel.broken.has(piece.id));
});

test('one penetrating sniper shot cuts a small real wooden through-hole without removing a fracture cell',()=>{
 const {panel}=panelFixture('wood',true);panel.map.scene.updateMatrixWorld(true);
 const ray=new THREE.Raycaster(new THREE.Vector3(1,1.4,1),new THREE.Vector3(0,0,-1),0,2);
 const hit=ray.intersectObject(panel.mesh,false)[0];assert.ok(hit);
 const result=panel.takeBulletHit(hit,125,ray.ray.direction,{slot:'primary',distance:80});
 assert.ok(result.penetrates);assert.equal(panel.broken.size,0);assert.equal(panel.punctures,1);
 assert.equal(ray.intersectObject(panel.mesh,false).length,0,'entry and exit are physically open');
 const reverse=new THREE.Raycaster(new THREE.Vector3(1,1.4,-1),new THREE.Vector3(0,0,1),0,2);
 assert.equal(reverse.intersectObject(panel.mesh,false).length,0);
 ray.ray.origin.x+=.06;const neighbour=ray.intersectObject(panel.mesh,false)[0];assert.ok(neighbour,'surrounding wood is preserved');assert.ok(Number.isInteger(neighbour.instanceId));
 assert.ok(panel.mesh.geometry.attributes.position.array.every(Number.isFinite));
});

test('puncturing a batched wooden panel removes only its old render copy and preserves neighbouring panels',()=>{
 const {map,panel}=panelFixture('wood');const next=new VillaPanel(map,{x:3,y:0,z:0,width:2,height:2.8,kind:'wood'});batchVillaPanels(map);map.scene.updateMatrixWorld(true);
 const batch=map.fractureBatches[0],before=batch.mesh.geometry.index.array.slice(),firstCount=panel.mesh.geometry.index.count;
 const ray=new THREE.Raycaster(new THREE.Vector3(1,1.4,1),new THREE.Vector3(0,0,-1),0,2),hit=ray.intersectObject(batch.mesh,false)[0];
 panel.takeBulletHit(hit,125,ray.ray.direction,{slot:'primary',distance:20});assert.equal(panel.mesh.layers.mask,1);assert.equal(panel.renderBatch,null);
 assert.equal(ray.intersectObject(batch.mesh,false).length,0,'old opaque render copy is gone');
 for(let i=firstCount;i<before.length;i++)assert.equal(batch.mesh.geometry.index.array[i],before[i]);
 ray.ray.origin.x=4;assert.ok(ray.intersectObject(batch.mesh,false).some(h=>h.object===next.mesh));
 // Breaking a larger cell later still updates the rebuilt geometry correctly.
 const piece=panel.pieces.find(p=>!panel.broken.has(p.id));panel.removePiece(piece,new THREE.Vector3(0,0,-1));assert.ok(panel.mesh.geometry.index.array.slice(piece.start,piece.start+piece.count).every(i=>i===0));
});

test('grouped pistol impacts deepen a blind wooden crater before a large fragment breaks',()=>{
 const {panel}=panelFixture('wood',true);panel.map.scene.updateMatrixWorld(true);
 const ray=new THREE.Raycaster(new THREE.Vector3(1,1.4,1),new THREE.Vector3(0,0,-1),0,2);
 for(let i=0;i<2;i++){const hit=ray.intersectObject(panel.mesh,false)[0];const r=panel.takeBulletHit(hit,34,ray.ray.direction,{slot:'pistol',distance:1});assert.equal(r.penetrates,false);}
 assert.equal(panel.broken.size,0);assert.ok(panel.punctures>0);
 const bottom=ray.intersectObject(panel.mesh,false)[0];assert.ok(bottom);assert.ok(bottom.point.z<.02,'crater exposes a deeper surface');
 const cache=new Map(panel.punctureGeometry),first=bottom.instanceId;
 panel.takeBulletHit(bottom,34,ray.ray.direction,{slot:'pistol',distance:1});
 const deeper=ray.intersectObject(panel.mesh,false)[0];assert.ok(deeper);assert.ok(deeper.point.z<bottom.point.z);
 assert.ok([...cache].some(([id,entry])=>id!==first&&entry.geometry===panel.punctureGeometry.get(id)?.geometry),'untouched cells reuse triangulation');
});

test('a concentrated pellet pattern tears wood while the same impacts spread across it do not',()=>{
 const grouped=panelFixture('wood',true).panel,spread=panelFixture('wood',true).panel;
 const piece=grouped.pieces[12],hit={point:new THREE.Vector3(piece.center.x,piece.center.y,.0325),instanceId:piece.id};
 for(let i=0;i<10;i++)grouped.takeBulletHit(hit,16,new THREE.Vector3(0,0,-1),{slot:'shotgun',distance:1});
 for(const p of spread.pieces.slice(0,10))spread.takeBulletHit({point:new THREE.Vector3(p.center.x,p.center.y,.0325),instanceId:p.id},16,new THREE.Vector3(0,0,-1),{slot:'shotgun',distance:20});
 assert.ok(grouped.broken.has(piece.id));assert.equal(spread.broken.size,0);
});

test('villa wall breaches remain open after round time and subsequent unrelated damage',()=>{
 const m=new VillaMap(new THREE.Scene()),panel=m.panels.find(p=>p.kind==='plaster'&&p.height>2.6);
 const piece=panel.pieces[10],point=panel.mesh.localToWorld(new THREE.Vector3(piece.center.x,piece.center.y,0)),hit={point,instanceId:piece.id};panel.takeBulletHit(hit,125);panel.takeBulletHit(hit,125);
 const indices=panel.mesh.geometry.index.array.slice();for(let i=0;i<180;i++)m.update(1,new THREE.Vector3(0,5,7));
 assert.ok(panel.broken.has(piece.id));assert.deepEqual(panel.mesh.geometry.index.array,indices);
 const other=m.panels.find(p=>p.kind==='wood'&&p.isDoor),ray=new THREE.Raycaster(other.mesh.localToWorld(new THREE.Vector3(.5,1,1)),new THREE.Vector3(0,0,-1),0,2);
 other.takeBulletHit({point:other.mesh.localToWorld(new THREE.Vector3(.5,1,.0325)),instanceId:other.pieces[10].id},125,new THREE.Vector3(0,0,-1),{slot:'primary',distance:2});
 assert.deepEqual(panel.mesh.geometry.index.array,indices);
});
