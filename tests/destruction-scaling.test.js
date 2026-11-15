import test from 'node:test';
import assert from 'node:assert/strict';
import {World,Body,Box,Vec3,NaiveBroadphase,ObjectCollisionMatrix} from 'cannon-es';
import * as T from 'three';
import {EnvironmentBroadphase} from '../src/environment/EnvironmentBroadphase.js';
import {supportCandidates,invalidateSupport} from '../src/world/SupportIndex.js';
import {EnvironmentSystem} from '../src/environment/EnvironmentSystem.js';
import {SurfaceDamage} from '../src/world/SurfaceDamage.js';
import {materialPart,removeProp} from '../src/world/MaterialProps.js';
import {soundEngine} from '../src/audio/SoundEngine.js';
import {WorldSync} from '../src/multiplayer/WorldSync.js';
for(const key of ['playWoodHit','playDoorBreak','playGlassBreak','playImpact'])soundEngine[key]=()=>{};

test('environment sweep retains every naive AABB collision pair across axes, filters, sleeping and removals',()=>{
 const world=new World(),sweep=new EnvironmentBroadphase(world),naive=new NaiveBroadphase();naive.useBoundingBoxes=true;
 let seed=19;const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
 for(let i=0;i<240;i++){
  const b=new Body({mass:i%4?1:0,position:new Vec3(random()*20-10,random()*10,random()*20-10)});
  b.addShape(new Box(new Vec3(.02+random()*3,.02+random(),.02+random()*3)),new Vec3(random()-.5,0,0));b.quaternion.setFromEuler(random()*3,random()*3,random()*3);
  if(i%7===0)b.sleep();if(i%9===0)b.collisionFilterMask=2;world.addBody(b);
 }
 const pairs=bp=>{const a=[],b=[];bp.collisionPairs(world,a,b);return a.map((x,i)=>[x.id,b[i].id].sort((a,b)=>a-b).join(':')).sort();};
 for(let pass=0;pass<3;pass++){
  for(let axis=0;axis<3;axis++){sweep.axisIndex=axis;sweep.dirty=true;assert.deepEqual(pairs(sweep),pairs(naive));}
  for(const b of [...world.bodies].filter((b,i)=>i%11===0))world.removeBody(b);
  for(const b of world.bodies){b.position.x+=random()-.5;b.aabbNeedsUpdate=true;}
 }
});

test('contact storage preserves motion and collision events while bodies are added and removed',()=>{
 const make=sparse=>{
  const w=new World({gravity:new Vec3(0,-9.81,0)});w.broadphase=new EnvironmentBroadphase(w);w.events=[];
  if(sparse){w.collisionMatrix=new ObjectCollisionMatrix();w.collisionMatrixPrevious=new ObjectCollisionMatrix();}
  w.addBody(new Body({mass:0,shape:new Box(new Vec3(5,.1,5)),position:new Vec3(0,-.1,0)}));
  for(let i=0;i<16;i++){const b=new Body({mass:1,shape:new Box(new Vec3(.15,.15,.15)),position:new Vec3(i%4*.4,1+Math.floor(i/4)*.5,0)});b.testId=i;b.addEventListener('collide',e=>w.events.push([w.stepnumber,i,e.body.testId??'floor']));w.addBody(b);}
  return w;
 };
 const a=make(false),b=make(true);
 for(let i=0;i<240;i++){
  // Remove the last body so the stock index-based reference is comparable.
  if(i===60)for(const w of [a,b])w.removeBody(w.bodies.at(-1));
  a.step(1/60);b.step(1/60);assert.equal(b.contacts.length,a.contacts.length);
  for(let j=0;j<a.bodies.length;j++)assert.ok(a.bodies[j].position.distanceTo(b.bodies[j].position)<1e-10);
 }
 assert.deepEqual(b.events.filter(e=>e[0]<60),a.events.filter(e=>e[0]<60));
 // The dense matrix is reindexed on removal and can invent new collide events.
 // Existing contacts in the sparse matrix retain their identity instead.
 assert.ok(b.events.filter(e=>e[0]===60).length<=a.events.filter(e=>e[0]===60).length);
 assert.ok(Object.keys(b.collisionMatrix.matrix).length<50,'storage tracks real contacts, not every possible pair');
});

test('moving support buckets retain the building index and match a full scan across cell boundaries',()=>{
 const map={colliders:[]};for(let i=0;i<200;i++)map.colliders.push(new T.Box3(new T.Vector3(i%20-10,0,Math.floor(i/20)-5),new T.Vector3(i%20-9.3,.2,Math.floor(i/20)-4.3)));
 const moving=map.colliders[31],query=new T.Vector3();supportCandidates(map,query);const grid=map.supportIndex;
 for(let frame=0;frame<40;frame++){
  moving.translate(new T.Vector3(.37,.01,-.21));invalidateSupport(map.colliders,true);
  for(const p of [moving.getCenter(new T.Vector3()),query,new T.Vector3(-9,0,-4)]){
   const x=Math.floor(p.x/2),z=Math.floor(p.z/2),expected=map.colliders.filter(box=>Math.floor(box.min.x/2)<=x&&Math.floor(box.max.x/2)>=x&&Math.floor(box.min.z/2)<=z&&Math.floor(box.max.z/2)>=z);
   assert.deepEqual(new Set(supportCandidates(map,p)),new Set(expected));assert.equal(map.supportIndex,grid);
  }
 }
 map.colliders.splice(15,1);invalidateSupport(map.colliders);supportCandidates(map,query);assert.notEqual(map.supportIndex,grid);
 const replacement=map.colliders[0].clone().translate(new T.Vector3(20,0,20));map.colliders[0]=replacement;invalidateSupport(map.colliders,true);
 assert.ok(supportCandidates(map,replacement.getCenter(new T.Vector3())).includes(replacement),'same-count collision replacements rebuild safely');
});

test('damaged stationary parts and new marks stay batched and retain their actual geometry and ray hits',()=>{
 const scene=new T.Scene(),mesh=materialPart(new T.Mesh(new T.BoxGeometry(4,4,.4),new T.MeshStandardMaterial()),'concrete');mesh.position.y=2;scene.add(mesh);scene.updateMatrixWorld(true);
 const collider=new T.Box3().setFromObject(mesh);collider.supportMesh=mesh;mesh.userData.collider=collider;
 const map={scene,colliders:[collider]},environment=new EnvironmentSystem(map);environment.register(mesh,{anchored:true});
 const damage=new SurfaceDamage(scene,map.colliders);map.surfaceDamage=damage;
 const hit=local=>damage.hit({object:mesh,point:mesh.localToWorld(local),face:{normal:new T.Vector3(0,0,1)},distance:1},'primary',new T.Vector3(0,0,-1));
 hit(new T.Vector3(0,0,.2));assert.ok(mesh.userData.motionBatch);assert.ok(damage.marks[0].decal.userData.motionBatch,'new stationary bullet marks share their material draw');
 hit(new T.Vector3(1.98,1.98,.2));assert.ok(mesh.userData.surfaceCuts>0);assert.equal(environment.motionBatch.entries.get(mesh).geometry,mesh.geometry,'the batch stores the new chipped mesh');
 const ray=new T.Raycaster(new T.Vector3(0,2,2),new T.Vector3(0,0,-1)),hits=[];for(const group of environment.motionBatch.groups.values())group.mesh.raycast(ray,hits);
 assert.ok(hits.some(h=>h.object===mesh),'bullets still hit the real source');assert.ok(hits.every(h=>h.object===mesh),'marks cannot become bullet blockers');
 assert.equal(environment.byObject.get(mesh).body,null,'render batching never creates a physics body for an anchored part');
 removeProp(mesh,map.colliders);assert.equal(environment.motionBatch.entries.get(mesh),undefined);environment.motionBatch.dispose();
});

test('multiplayer damage stays batched through geometry updates, interpolation and removal',()=>{
 const make=()=>{const scene=new T.Scene(),mesh=materialPart(new T.Mesh(new T.BoxGeometry(1,1,1),new T.MeshStandardMaterial()),'wood');scene.add(mesh);const map={scene,colliders:[]};map.environment=new EnvironmentSystem(map);return{mesh,map,sync:new WorldSync(scene,map)};};
 const server=make(),client=make(),batch=client.map.environment.motionBatch;
 server.mesh.position.x=2;client.sync.apply(server.sync.collect());assert.ok(client.mesh.userData.motionBatch);
 server.mesh.position.x=4;client.sync.apply(server.sync.collect(),{interpolate:true});client.sync.presentation.update(.05);
 const entry=batch.entries.get(client.mesh),matrix=new T.Matrix4();entry.group.mesh.getMatrixAt(entry.id,matrix);assert.ok(Math.abs(matrix.elements[12]-3)<1e-6,'GPU transform follows the interpolated furniture pose');
 server.mesh.geometry.attributes.position.setX(0,.2);server.mesh.geometry.attributes.position.needsUpdate=true;client.sync.apply(server.sync.collect());assert.equal(batch.entries.get(client.mesh).geometry,client.mesh.geometry);
 const mark=new T.Mesh(new T.PlaneGeometry(.1,.1),new T.MeshBasicMaterial());client.mesh.add(mark);batch.add(mark);server.mesh.visible=false;client.sync.apply(server.sync.collect());
 assert.equal(batch.entries.get(client.mesh),undefined);assert.equal(batch.entries.get(mark),undefined,'hidden furniture cannot leave its batched details floating');
 for(const fixture of [server,client])fixture.map.environment.motionBatch.dispose();
});

test('late debris frames cannot create a physics catch-up spiral; normal host ticks keep 60 Hz physics',()=>{
 const scene=new T.Scene(),mesh=materialPart(new T.Mesh(new T.BoxGeometry(.2,.2,.2),new T.MeshStandardMaterial()),'wood');mesh.position.y=3;scene.add(mesh);
 const map={scene,colliders:[],rubbleFloor:()=>0},environment=new EnvironmentSystem(map),record=environment.register(mesh);environment.activate(record);
 let steps=0;const original=environment.world.step.bind(environment.world);environment.world.step=dt=>{assert.equal(dt,1/60);steps++;original(dt);};
 environment.update(.2);assert.equal(steps,2);assert.ok(environment.accumulator<1/60);
 steps=0;environment.update(1/60);assert.equal(steps,1,'late time does not leak into the next frame');
 steps=0;environment.update(1/30);assert.equal(steps,2,'normal authoritative 30 Hz ticks still run two full physics steps');
 assert.ok(record.body.position.y<3);assert.ok(mesh.visible&&mesh.userData.motionBatch);environment.motionBatch.dispose();
});
