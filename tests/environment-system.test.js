import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {EnvironmentSystem} from '../src/environment/EnvironmentSystem.js';
import {LiquidSystem} from '../src/environment/LiquidSystem.js';
import {cabinet,bookshelf,countertop} from '../src/environment/ConstructionPrefabs.js';
import {MATERIALS,VISUAL_MATERIALS} from '../src/environment/MaterialCatalog.js';
import {materialPart,removeProp} from '../src/world/MaterialProps.js';
import {invalidateSupport,supportHeight} from '../src/world/SupportIndex.js';
import {SurfaceDamage} from '../src/world/SurfaceDamage.js';
import {DebrisPool} from '../src/world/DebrisPool.js';
import {VillaPanel} from '../src/world/VillaPanel.js';
import {soundEngine} from '../src/audio/SoundEngine.js';
const V=(x=0,y=0,z=0)=>new T.Vector3(x,y,z);
for(const name of ['playWoodHit','playDoorBreak','playGlassBreak','playImpact','playWaterImpact'])soundEngine[name]=()=>{};

// A small adapter intentionally has no villa coordinates or fixed storey height.
function room(){
 const m={scene:new T.Scene(),colliders:[],panels:[],decor:[],propBatches:[],materials:{}};
 m.box=(x,y,z,w,h,d,type='wood',solid=true)=>{
  const mat=m.materials[type]??=new T.MeshStandardMaterial();
  const mesh=materialPart(new T.Mesh(new T.BoxGeometry(w,h,d),mat),VISUAL_MATERIALS[type]||'wood');mesh.position.set(x,y,z);m.scene.add(mesh);
  if(solid){const box=new T.Box3().setFromObject(mesh);box.supportMesh=mesh;mesh.userData.collider=box;m.colliders.push(box);}return mesh;
 };
 m.rubbleFloor=(p,c)=>supportHeight(m,p,c);m.box(0,-.1,0,16,.2,16,'concrete');m.environment=new EnvironmentSystem(m);return m;
}
function step(m,count=240){for(let i=0;i<count;i++)m.environment.update(1/60);}
function hit(fx,mesh,point,normal=V(0,0,1),slot='primary'){return fx.hit({object:mesh,point,face:{normal},distance:2},slot,normal.clone().negate());}

test('a real falling loose object wakes a settled object through physical contact',()=>{
 const m=room(),e=m.environment,target=m.box(0,.05,0,.3,.1,.2),r=e.register(target,{loose:true,parts:[target]});e.activate(r);step(m,180);assert.equal(r.body.sleepState,2);
 const falling=m.box(0,.9,0,.25,.12,.18),incoming=e.register(falling,{loose:true,parts:[falling]});e.activate(incoming);let woke=false;
 for(let i=0;i<120;i++){e.update(1/60);if(r.body.sleepState!==2)woke=true;}
 assert.ok(woke,'sleeping must preserve the collision response to a new real impact');
});

test('shared cabinet is hollow with independent doors, handles and interior shelves',()=>{
 const m=room(),g=cabinet(m,{x:0,y:0,z:0,width:1.4,height:1,depth:.6});m.environment.observeScene();
 const doors=g.children.filter(o=>o.name==='Cabinet door'),shelves=g.children.filter(o=>o.name==='Cabinet interior shelf');assert.equal(doors.length,2);assert.equal(shelves.length,2);
 const empty=V(-.3,.75,0);assert.ok(!m.colliders.some(b=>b.containsPoint(empty)),'the interior must contain real space');
 const door=doors[0],handle=door.children[0];removeProp(door,m.colliders);assert.equal(handle.visible,false,'a removed door cannot leave a floating handle');assert.ok(doors[1].visible&&shelves.every(s=>s.visible));
 step(m);assert.equal(m.environment.records.filter(r=>r.body).length,0,'intact shelves should not fall before damage');
});

test('lost shelf support releases books onto the shelf below and preserves batching while sleeping and waking',()=>{
 const m=room(),g=bookshelf(m,{x:0,y:0,z:0,width:2.8});m.environment.observeScene();
 const shelves=g.children.filter(o=>o.name==='Bookshelf shelf'),shelf=shelves[2],books=m.environment.records.filter(r=>r.loose&&r.supports.includes(shelf)),before=books.map(r=>r.object.getWorldPosition(V()).y);
 removeProp(shelf,m.colliders);step(m,420);assert.ok(books.length>3);
 for(let i=0;i<books.length;i++){assert.ok(books[i].object.getWorldPosition(V()).y<before[i]-.3);assert.equal(books[i].body.sleepState,2);}
 assert.ok(books.some(r=>r.object.getWorldPosition(V()).y>.7),'surviving lower shelves catch falling books');
 assert.ok(books.every(r=>r.object.userData.motionBatch),'moving and settled books share GPU material batches');
 const r=books[0],batch=r.object.userData.motionBatch;m.environment.hit(r.object,r.object.getWorldPosition(V()),V(0,0,1),100);assert.equal(r.object.userData.motionBatch,batch,'waking keeps a single moving render instance');assert.equal(r.body.sleepState,0);step(m,10);assert.ok(r.object.localToWorld(r.center.clone()).distanceTo(V(r.body.position.x,r.body.position.y,r.body.position.z))<1e-6,'the visible source follows the rigid body after waking');
});

test('an impact wakes settled physics once, unrelated support revisions do not repeatedly wake it',()=>{
 const m=room(),mesh=m.box(0,.1,0,.2,.2,.2);const r=m.environment.register(mesh,{loose:true});m.environment.activate(r);step(m,200);assert.equal(r.body.sleepState,2);
 m.environment.hit(mesh,mesh.position.clone(),V(1,0,0),1);step(m,250);assert.equal(r.body.sleepState,2);
 for(let i=0;i<120;i++){invalidateSupport(m.colliders,true);m.environment.update(1/60);}assert.equal(r.body.sleepState,2);assert.equal(m.environment.lastImpact,null);
});

test('sleeping loose props wake when their real floor support is removed, without needing a nearby shot',()=>{
 const m=room(),shelf=m.box(0,.95,0,2,.1,2),book=materialPart(m.box(0,1.15,0,.13,.3,.2,'wood',false),'paper'),r=m.environment.register(book,{loose:true});m.environment.activate(r);step(m,300);assert.equal(r.body.sleepState,2);assert.ok(r.sleepAnchors.some(s=>s.mesh===shelf));
 removeProp(shelf,m.colliders);step(m,300);assert.ok(book.position.y<.3);assert.equal(r.body.sleepState,2);
});

test('failed shelves release every loose prop immediately even with a low discretionary body budget',()=>{
 const m=room(),shelf=m.box(0,1,0,2,.1,1);m.environment.maxAwake=1;const books=[];
 for(let i=0;i<8;i++){const mesh=materialPart(m.box(-.8+i*.2,1.2,0,.12,.3,.2,'wood',false),'paper');books.push(m.environment.support(mesh,[shelf],{loose:true}));}
 removeProp(shelf,m.colliders);m.environment.supportChanged(shelf);assert.ok(books.every(r=>r.body));assert.equal(m.environment.pending.size,0);step(m,300);assert.ok(books.every(r=>r.object.position.y<.3));
});

test('metal keeps its material but loses its mounting when the support is destroyed',()=>{
 const m=room(),support=m.box(0,1,0,.5,2,.2),metal=m.box(0,1,.13,.07,2,.05,'metal',false);const r=m.environment.support(metal,[support],{wallMount:true});
 m.environment.hit(metal,metal.position.clone(),V(0,0,1),125);assert.equal(r.body,null,'a bullet dent alone does not detach intact mountings');
 removeProp(support,m.colliders);step(m,300);assert.ok(r.body);assert.ok(metal.visible);assert.ok(metal.position.y<.2);assert.equal(MATERIALS.metal.fracture,Infinity);
});

test('a thin stone countertop fractures in its centre and exposes a separate timber backing',()=>{
 const m=room();m.box(0,.45,0,2,.9,1);const stone=countertop(m,{x:0,y:1,z:0,width:2,height:.12,depth:1});m.environment.observeScene();
 const fx=new SurfaceDamage(m.scene,m.colliders),core=m.environment.records.find(r=>r.object.name==='Countertop timber backing');assert.ok(core?.object.visible);assert.equal(stone.userData.thickness,.035);
 hit(fx,stone,V(0,1.06,0),V(0,1,0));assert.equal(stone.userData.surfaceCuts,1);
 const ray=new T.Raycaster(V(0,1.4,0),V(0,-1,0));ray.layers.enableAll();assert.equal(ray.intersectObject(stone).length,0);assert.ok(ray.intersectObject(core.object).length>0);
});

test('a frame reads real panel holes and an attached door becomes hinged physics with its breach intact',()=>{
 const m=room();m.materials.softWall=new T.MeshStandardMaterial({vertexColors:true});m.materials.woodPanel=new T.MeshStandardMaterial({vertexColors:true});m.emitPanelDebris=()=>{};
 const wall=new VillaPanel(m,{x:0,y:0,z:-.15,width:2,height:2.4,kind:'plaster'}),frame=m.box(0,1.2,0,.07,2.4,.28,'metal',false);frame.name='Door frame';frame.userData.wallAttachment=[V(.1,.4,-.15),V(.1,1.2,-.15),V(.1,2,-.15)];
 const door=new VillaPanel(m,{x:0,y:0,z:0,width:1.2,height:2.3,door:true});m.environment.observeScene();const record=m.environment.byObject.get(frame),dr=m.environment.byObject.get(door.group);assert.ok(record&&dr);
 const hole=door.pieces.find(p=>p.center.distanceTo(new T.Vector2(.6,1.2))<.4);door.removePiece(hole,V(0,0,1));door.refreshCollision();
 for(const p of wall.pieces)wall.removePiece(p,V(0,0,1));wall.refreshCollision();assert.equal(m.environment.attachmentsIntact(record),false,'a visible mesh with all its triangles removed provides no anchoring');
 invalidateSupport(m.colliders);step(m,4);assert.ok(record.body&&dr.body);assert.ok(dr.joint,'the door keeps a hinge to its falling frame');assert.equal(door.detachedEnvironment,true);
 const at=door.mesh.localToWorld(V(hole.center.x,hole.center.y,0));assert.ok(!door.mesh.userData.damageColliders.some(b=>b.containsPoint(at)),'detached doors must not refill their old holes with solid collision');
});

test('retained debris tracks its actual owner rather than every unrelated collider update',()=>{
 const m=room(),upper=m.box(0,1.95,0,2,.1,2),pool=new DebrisPool(m.scene,new T.BoxGeometry(.1,.02,.1),new T.MeshBasicMaterial(),8,{groundHeight:(p,c)=>m.rubbleFloor(p,c),supportOwner:()=>m.lastSupportMesh,supportInterval:.05,supportRevision:()=>m.colliders.supportRevision||0});
 pool.spawn(V(0,2.3,0),V(),new T.Matrix4(),V(),Infinity);for(let i=0;i<300;i++)pool.update(1/60);assert.ok(pool.pieces[0].settled);
 const original=pool.groundHeight;let queries=0;pool.groundHeight=(...a)=>{queries++;return original(...a);};for(let i=0;i<120;i++){invalidateSupport(m.colliders,true);pool.update(1/60);}assert.equal(queries,0);
 removeProp(upper,m.colliders);for(let i=0;i<200;i++)pool.update(1/60);assert.ok(pool.pieces[0].position.y<.1,'removing the owner releases the retained fragment');
});

test('water impact ripples and splashes; a breached container drains finite water without losing volume',()=>{
 const m=room(),liquids=new LiquidSystem(m),mesh=new T.Mesh(new T.PlaneGeometry(1,1,12,12),new T.MeshPhysicalMaterial());mesh.rotation.x=-Math.PI/2;mesh.position.set(0,.6,0);m.scene.add(mesh);
 const wall=m.box(0,.4,.55,1.2,.8,.1,'ceramic'),body=liquids.add(mesh,{bottom:.2,floor:0,walls:[wall]});body.impact(V(0,.6,0),34);liquids.update(.01);assert.ok(liquids.rings.count>0&&liquids.drops.pieces.length>0);assert.equal(mesh.userData.collider,undefined);
 removeProp(wall,m.colliders);for(let i=0;i<300;i++)liquids.update(1/60);
 const spilled=[...liquids.cells.values()].reduce((n,c)=>n+c.volume,0);assert.ok(spilled>.1);assert.ok(Math.abs(body.volume+spilled-body.initialVolume)<1e-8);assert.ok(body.level>=body.bottom);assert.ok(liquids.puddles.count>0);
});

test('puddle flow respects a wall, responds to its removal and descends through a floor opening',()=>{
 const m=room(),wall=m.box(.4,.5,.2,.06,1,2,'concrete'),liquids=new LiquidSystem(m);const a=liquids.getCell(V(.2,0,.2)),b=liquids.getCell(V(.6,0,.2));assert.equal(liquids.canFlow(a,b),false);
 removeProp(wall,m.colliders);liquids.spill(V(.2,0,.2),.02);liquids.flow(.1);assert.equal(liquids.canFlow(a,b),true);assert.ok(b.volume>0);
 const upper=m.box(0,2.95,0,3,.1,3,'wood');invalidateSupport(m.colliders);liquids.spill(V(.2,3,.2),.02);const cell=liquids.getCell(V(.2,3,.2));assert.ok(Math.abs(cell.floor-3)<1e-6);
 removeProp(upper,m.colliders);for(let i=0;i<20;i++)liquids.flow(.1);assert.equal(cell.volume,0);assert.ok([...liquids.cells.values()].some(c=>Math.abs(c.floor)<1e-6&&c.volume>0));
});

test('a container stops draining at the breach sill rather than emptying below the hole',()=>{
 const m=room(),liquids=new LiquidSystem(m),mesh=new T.Mesh(new T.PlaneGeometry(1,1),new T.MeshPhysicalMaterial());mesh.rotation.x=-Math.PI/2;mesh.position.set(0,.6,0);m.scene.add(mesh);
 const body=liquids.add(mesh,{bottom:.2,floor:0});body.wallRevision='';body.leaks=[{point:V(0,.45,.5),normal:V(0,0,1),sill:.4,area:.02}];
 for(let i=0;i<1600;i++)body.update(1/60);assert.ok(Math.abs(body.level-.4)<.001);assert.ok(body.volume>.19);assert.ok(Math.abs(body.volume+liquids.spilled-body.initialVolume)<1e-8);
});

test('an uphill flow rejection does not poison the downhill connection cache',()=>{
 const m=room(),liquids=new LiquidSystem(m),a={key:'low',x:0,z:0,floor:0},b={key:'high',x:1,z:0,floor:.3};assert.equal(liquids.canFlow(a,b),false);assert.equal(liquids.canFlow(b,a),true);
});

test('unrelated dynamic motion does not rescan intact support relationships; structural loss still does',()=>{
 const m=room(),shelf=m.box(0,1,0,1,.1,1),book=materialPart(m.box(0,1.2,0,.1,.3,.1,'wood',false),'paper');const r=m.environment.support(book,[shelf],{loose:true});step(m,120);
 let scans=0;const original=m.environment.isSupported.bind(m.environment);m.environment.isSupported=(r)=>{scans++;return original(r);};for(let i=0;i<120;i++){invalidateSupport(m.colliders,true);m.environment.update(1/60);}assert.equal(scans,0);
 removeProp(shelf,m.colliders);step(m,240);assert.ok(r.body);assert.ok(book.position.y<.3);
});

test('destroyed physics parents release their constraints and invisible loose objects leave GPU batches',()=>{
 const m=room(),base=m.box(0,1,0,.2,2,.2),shelf=m.box(0,1.5,0,1,.05,.4),parent=m.environment.register(base),child=m.environment.support(shelf,[base]);m.environment.activate(parent);m.environment.activate(child);assert.ok(child.joint);
 removeProp(base,m.colliders);step(m,240);assert.equal(parent.body,null);assert.equal(child.joint,null);assert.equal(m.environment.world.constraints.length,0);assert.ok(shelf.position.y<.3);
 const book=materialPart(m.box(2,.2,0,.1,.3,.1,'wood',false),'paper'),r=m.environment.register(book,{loose:true});book.castShadow=true;m.environment.activate(r);assert.ok(book.userData.motionBatch);book.visible=false;step(m,1);assert.equal(r.body,null);assert.equal(book.userData.motionBatch,undefined);assert.ok(m.motionShadowBounds.containsPoint(book.position),'removing the last caster also clears its cached shadow');
});
