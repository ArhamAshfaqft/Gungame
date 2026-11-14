import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {World,Body,Box,Vec3,Quaternion,SAPBroadphase} from 'cannon-es';
import {MotionBatch} from '../src/environment/MotionBatch.js';
import {installShapeCulling} from '../src/environment/ShapeCulling.js';
import {materialPart,removeProp,syncDamagedCollision} from '../src/world/MaterialProps.js';
import {SurfaceDamage} from '../src/world/SurfaceDamage.js';
import {projectSurfaceMark,removeSurfaceMark} from '../src/world/SurfaceDecal.js';
import {soundEngine} from '../src/audio/SoundEngine.js';
import {physicsBox} from '../src/environment/PhysicsBox.js';
import {accelerateRaycast} from '../src/environment/RaycastCache.js';
import {WorldRayQuery} from '../src/environment/WorldRayQuery.js';
import {updateShadowCache} from '../src/environment/ShadowCache.js';
import {unionCollisionBoxes,collisionVolumes} from '../src/environment/CollisionVolumes.js';
import {WorldSSAOPass} from '../src/environment/WorldSSAOPass.js';
import {SSAOPass} from 'three/examples/jsm/postprocessing/SSAOPass.js';
import {EnvironmentSystem} from '../src/environment/EnvironmentSystem.js';
import {supportCandidates,invalidateSupport,supportHeight} from '../src/world/SupportIndex.js';
import {LiquidSystem} from '../src/environment/LiquidSystem.js';
for(const k of ['playWoodHit','playDoorBreak','playGlassBreak','playImpact'])soundEngine[k]=()=>{};

test('map and particle support queries share one index and see moves, fractures and removals',()=>{
 const mesh=materialPart(new T.Mesh(new T.BoxGeometry(2,.2,2),new T.MeshStandardMaterial()),'wood');mesh.position.y=2;mesh.updateMatrixWorld(true);
 const box=new T.Box3().setFromObject(mesh);box.supportMesh=mesh;mesh.userData.collider=box;
 const colliders=[box],map={colliders},particles={colliders},point=new T.Vector3(0,3,0);
 assert.ok(Math.abs(supportHeight(map,point)-2.1)<1e-7);assert.equal(supportHeight(particles,point),supportHeight(map,point));assert.equal(map.supportIndex,particles.supportIndex);
 mesh.position.set(4,1,0);mesh.updateMatrixWorld(true);box.setFromObject(mesh);invalidateSupport(colliders,true);
 assert.equal(supportHeight(particles,point),0);assert.equal(supportHeight(map,new T.Vector3(4,3,0)),supportHeight(particles,new T.Vector3(4,3,0)));assert.equal(map.supportIndex,particles.supportIndex);
 removeProp(mesh,colliders);assert.equal(supportHeight(map,new T.Vector3(4,3,0)),0);assert.equal(supportHeight(particles,new T.Vector3(4,3,0)),0);
 const other={colliders:[]};supportCandidates(other,point);assert.notEqual(other.supportIndex,map.supportIndex,'different collision worlds remain independent');
});

test('moving collision bounds reuse boxes and follow the same cut geometry through rotation and removal',()=>{
 const scene=new T.Scene(),mesh=materialPart(new T.Mesh(new T.BoxGeometry(1,1,.2),new T.MeshStandardMaterial()),'wood');scene.add(mesh);scene.updateMatrixWorld(true);
 const colliders=[new T.Box3().setFromObject(mesh)];mesh.userData.collider=colliders[0];mesh.userData.dynamicEnvironment=true;syncDamagedCollision(mesh,colliders);
 const first=mesh.userData.damageColliders,revision=colliders.supportRevision;
 mesh.position.set(2,3,4);mesh.rotation.set(.2,.5,.3);scene.updateMatrixWorld(true);syncDamagedCollision(mesh,colliders);
 assert.equal(mesh.userData.damageColliders,first);assert.ok(colliders.supportRevision>revision);assert.deepEqual(first[0],Object.assign(mesh.geometry.boundingBox.clone().applyMatrix4(mesh.matrixWorld),{supportMesh:mesh,dynamicEnvironment:true}));
 const fx=new SurfaceDamage(scene,colliders);fx.hit({object:mesh,point:mesh.localToWorld(new T.Vector3(0,0,.1)),face:{normal:new T.Vector3(0,0,1)},distance:0},'primary',new T.Vector3(0,0,-1).transformDirection(mesh.matrixWorld));
 syncDamagedCollision(mesh,colliders);assert.notEqual(mesh.userData.damageColliders,first,'a fracture replaces the original local collision volumes');const cut=mesh.userData.damageColliders;
 mesh.position.x+=2;scene.updateMatrixWorld(true);syncDamagedCollision(mesh,colliders);assert.equal(mesh.userData.damageColliders,cut);
 collisionVolumes(mesh).forEach((local,i)=>{const expected=local.clone().applyMatrix4(mesh.matrixWorld);assert.ok(cut[i].min.equals(expected.min)&&cut[i].max.equals(expected.max),'every cut collision box follows the actual world transform');});
 removeProp(mesh,colliders);assert.equal(colliders.length,0);mesh.visible=true;syncDamagedCollision(mesh,colliders);assert.notEqual(mesh.userData.damageColliders,cut,'removal invalidates the moving cache');assert.ok(colliders.length>0);
});

test('selective SSAO visibility matches the stock pass and restores hidden subtrees',()=>{
 const scene=new T.Scene(),hidden=new T.Group(),line=new T.Line(),points=new T.Points(),nestedLine=new T.Line();
 hidden.visible=false;hidden.add(new T.Line(),new T.Mesh());line.add(nestedLine,new T.Mesh());scene.add(new T.Mesh(),line,points,hidden);points.visible=false;
 const stockScene=scene.clone(true),make=(prototype,scene)=>Object.assign(Object.create(prototype),{scene,_visibilityCache:new Map()});
 const original=make(SSAOPass.prototype,stockScene),optimized=make(WorldSSAOPass.prototype,scene),visibility=s=>{const result=[];s.traverseVisible(o=>result.push(o.type));return result;};
 const before=[];scene.traverse(o=>before.push(o.visible));original.overrideVisibility();optimized.overrideVisibility();assert.deepEqual(visibility(scene),visibility(stockScene));
 assert.ok([...optimized._visibilityCache.keys()].every(o=>o.isLine||o.isPoints));
 original.restoreVisibility();optimized.restoreVisibility();const after=[];scene.traverse(o=>after.push(o.visible));assert.deepEqual(after,before);assert.equal(optimized._visibilityCache.size,0);
});

test('water impact rings stay out of SSAO while the bounded visible ripple and water surface remain available',()=>{
 const scene=new T.Scene(),map={scene,colliders:[],rubbleFloor:()=>0},liquids=new LiquidSystem(map),water=new T.Mesh(new T.PlaneGeometry(1,1),new T.MeshPhysicalMaterial());
 water.rotation.x=-Math.PI/2;water.position.y=.6;scene.add(water);scene.updateMatrixWorld(true);
 const body=liquids.add(water,{bottom:.2});body.impact(new T.Vector3(.45,.6,.45),34);liquids.update(.9);
 assert.equal(liquids.rings.count,1);assert.deepEqual(Array.from(liquids.rippleBounds.array.slice(0,4)),[-.5,.5,-.5,.5]);
 const pass=Object.assign(Object.create(WorldSSAOPass.prototype),{scene,_visibilityCache:new Map()});
 assert.equal(liquids.rings.visible,true);pass.overrideVisibility();assert.equal(liquids.rings.visible,false,'unclipped normal/depth ring cannot shadow the floor outside the tub');assert.equal(water.visible,true);
 pass.restoreVisibility();assert.equal(liquids.rings.visible,true,'the clipped visible ripple still renders');
 liquids.rings.visible=false;pass.overrideVisibility();pass.restoreVisibility();assert.equal(liquids.rings.visible,false,'an already hidden effect stays hidden');
});

test('clustered physics support queries retain all neighbours across buckets, floors and removals',()=>{
 const map={scene:new T.Scene(),colliders:[]},environment=new EnvironmentSystem(map);
 for(let x=-6;x<=6;x++)for(let z=-6;z<=6;z++)for(const y of [0,3.4,6.8,10.2])map.colliders.push(new T.Box3(new T.Vector3(x*2,y,z*2),new T.Vector3(x*2+1.5,y+.2,z*2+1.5)));
 const positions=[[-.01,1,-.01],[.01,7,.01],[1.99,4,1.99],[2.01,10,2.01],[-2.01,3,-2.01]];
 environment.records=Array.from({length:180},(_,i)=>({body:new Body({mass:1,position:new Vec3(...positions[i%positions.length])})}));
 const expected=()=>{const set=new Set();for(const r of environment.records){if(r.body.sleepState===Body.SLEEPING)continue;const p=r.body.position;for(let x=-2;x<=2;x++)for(let z=-2;z<=2;z++)for(const box of supportCandidates(map,new T.Vector3((Math.floor(p.x/2)+x)*2+.5,0,(Math.floor(p.z/2)+z)*2+.5)))if(!box.dynamicEnvironment&&box.max.y>=p.y-5&&box.min.y<=p.y+4)set.add(box);}return set;};
 environment.syncStatic();assert.deepEqual(new Set(environment.staticBodies.keys()),expected());
 const first=[...environment.staticBodies.values()][0].body;environment.syncStatic();assert.equal([...environment.staticBodies.values()][0].body,first,'unchanged supports retain their physics bodies');
 const removed=[...environment.staticBodies.keys()][0];map.colliders.splice(map.colliders.indexOf(removed),1);invalidateSupport(map.colliders);environment.records.slice(0,36).forEach(r=>r.body.sleep());environment.syncStatic();assert.ok(!environment.staticBodies.has(removed));assert.deepEqual(new Set(environment.staticBodies.keys()),expected());
});

test('collision volume union preserves every occupied point and opening without duplicate contacts or mass',()=>{
 const box=(a,b)=>new T.Box3(new T.Vector3(...a),new T.Vector3(...b)),source=[box([0,0,0],[2,.2,1]),box([1,0,0],[3,.2,1]),box([0,0,0],[1,.2,1]),box([4,0,0],[5,.2,1])],result=unionCollisionBoxes(source);
 assert.equal(result.length,2);for(let x=-.1;x<5.2;x+=.031)for(let z=-.1;z<1.2;z+=.071){const p=new T.Vector3(x,.1,z);assert.equal(source.some(b=>b.containsPoint(p)),result.some(b=>b.containsPoint(p)));}
 for(let i=0;i<result.length;i++)for(let j=i+1;j<result.length;j++){const overlap=result[i].clone().intersect(result[j]);assert.ok(overlap.isEmpty()||overlap.getSize(new T.Vector3()).toArray().some(v=>v<1e-7));}
 const volume=result.reduce((n,b)=>{const s=b.getSize(new T.Vector3());return n+s.x*s.y*s.z;},0);assert.ok(Math.abs(volume-.8)<1e-8);
});

test('moving render batches retain every source, UVs and transform while growing and reusing storage',()=>{
 const scene=new T.Scene(),batch=new MotionBatch(scene),material=new T.MeshStandardMaterial(),sources=[];
 for(let i=0;i<140;i++){const m=materialPart(new T.Mesh(new T.BoxGeometry(.1,.25,.2),material),'paper');m.position.set(i*.2,1,0);m.castShadow=true;scene.add(m);sources.push(m);batch.add(m);}
 assert.equal(batch.groups.size,1);const group=[...batch.groups.values()][0];assert.equal(group.objects.size,140);assert.ok(group.capacity>=140);
 const source=sources[17],entry=batch.entries.get(source),matrix=new T.Matrix4();group.mesh.getMatrixAt(entry.id,matrix);assert.ok(matrix.elements.every((v,i)=>Math.abs(v-source.matrixWorld.elements[i])<1e-6));assert.ok(group.mesh.geometry.attributes.uv.count>=source.geometry.attributes.uv.count);
 source.position.set(-3,2,1);source.rotation.y=.4;batch.sync(source);group.mesh.getMatrixAt(entry.id,matrix);assert.ok(matrix.elements.every((v,i)=>Math.abs(v-source.matrixWorld.elements[i])<1e-6));
 const ray=new T.Raycaster(new T.Vector3(-3,2,3),new T.Vector3(0,0,-1));assert.equal(ray.intersectObject(group.mesh)[0].object,source);
 batch.detach(source);assert.equal(batch.entries.get(source),undefined);assert.equal(group.objects.size,139);assert.equal(source.layers.mask,1);batch.add(source);assert.equal(group.objects.size,140);
 const originalGeometry=source.geometry;source.geometry=new T.BoxGeometry(.2,.2,.2);batch.sync(source);assert.equal(batch.entries.get(source).geometry,source.geometry);assert.notEqual(source.geometry,originalGeometry);assert.equal(group.objects.size,140);
 removeProp(source,[]);assert.equal(batch.entries.get(source),undefined);assert.equal(group.objects.size,139);batch.dispose();assert.ok(sources.every(m=>!m.userData.motionBatch));
});

test('moving bullet marks preserve draw order and shadows, reproject safely and never block bullets',()=>{
 const scene=new T.Scene(),book=materialPart(new T.Mesh(new T.BoxGeometry(.2,.3,.15),new T.MeshStandardMaterial()),'paper');scene.add(book);book.castShadow=true;
 const fx=new SurfaceDamage(scene,[]);fx.hit({object:book,point:new T.Vector3(0,0,.075),face:{normal:new T.Vector3(0,0,1)},distance:2},'pistol',new T.Vector3(0,0,-1));
 const mark=fx.marks[0];assert.ok(mark);const batch=new MotionBatch(scene);batch.addTree(book);assert.ok(batch.entries.get(mark.decal));
 const decalGroup=batch.entries.get(mark.decal).group;assert.equal(decalGroup.mesh.castShadow,false);assert.equal(decalGroup.mesh.renderOrder,2);
 book.position.x=2;batch.syncTree(book);const ray=new T.Raycaster(new T.Vector3(2,0,1),new T.Vector3(0,0,-1)),hits=[];for(const group of batch.groups.values())ray.intersectObject(group.mesh,false,hits);assert.ok(hits.length);assert.ok(hits.every(h=>h.object===book));
 projectSurfaceMark(mark);assert.ok(batch.entries.get(mark.decal));removeSurfaceMark(mark);assert.equal(batch.entries.get(mark.decal),undefined);assert.equal(decalGroup.objects.size,0);
});

test('shape culling skips separated thin pieces and invalidates cached bounds when transforms change',()=>{
 let calls=0;const np={convexConvex(){calls++;return true;}};installShapeCulling(np);
 const floor=new Box(new Vec3(5,.02,5)).convexPolyhedronRepresentation,book=new Box(new Vec3(.1,.1,.1)).convexPolyhedronRepresentation,q=new Quaternion(),p=new Vec3(0,1,0);
 assert.equal(np.convexConvex(floor,book,new Vec3(),p,q,q),false);assert.equal(calls,0);
 p.y=.1;assert.equal(np.convexConvex(floor,book,new Vec3(),p,q,q),true);assert.equal(calls,1);
 p.x=6;assert.equal(np.convexConvex(floor,book,new Vec3(),p,q,q),false);p.x=0;q.setFromAxisAngle(new Vec3(0,0,1),.4);assert.equal(np.convexConvex(floor,book,new Vec3(),p,new Quaternion(),q),true);
});

test('cached shape culling preserves compound contact counts and physical trajectories',()=>{
 const create=enabled=>{const w=new World({gravity:new Vec3(0,-9.81,0)});if(enabled)installShapeCulling(w.narrowphase);const floor=new Body({mass:0,position:new Vec3(0,-.2,0)});floor.addShape(new Box(new Vec3(4,.2,4)));w.addBody(floor);
  for(let n=0;n<4;n++){const b=new Body({mass:1,position:new Vec3((n-1.5)*.35,1+n*.2,0)});b.quaternion.setFromEuler(.1*n,.2*n,.07*n);for(let j=0;j<4;j++)b.addShape(new Box(new Vec3(.08,.03,.12)),new Vec3(0,(j-1.5)*.06,0));w.addBody(b);}return w;};
 const original=create(false),optimized=create(true);
 for(let i=0;i<300;i++){original.step(1/60);optimized.step(1/60);assert.equal(optimized.contacts.length,original.contacts.length);for(let n=1;n<5;n++){assert.ok(original.bodies[n].position.distanceTo(optimized.bodies[n].position)<1e-9);assert.ok(original.bodies[n].quaternion.almostEquals?original.bodies[n].quaternion.almostEquals(optimized.bodies[n].quaternion,1e-9):Math.abs(original.bodies[n].quaternion.w-optimized.bodies[n].quaternion.w)<1e-9);}}
});

test('analytical box projection matches generic corner projection across sizes, axes and rotations',()=>{
 let state=123;const random=()=>((state=(Math.imul(state,1664525)+1013904223)>>>0)/4294967296);
 for(let i=0;i<1200;i++){const a=new Vec3(.01+random()*5,.01+random()*3,.01+random()*5),b=new Vec3(.01+random(),.01+random(),.01+random()),fastA=physicsBox(a).convexPolyhedronRepresentation,fastB=physicsBox(b).convexPolyhedronRepresentation,baseA=new Box(a).convexPolyhedronRepresentation,baseB=new Box(b).convexPolyhedronRepresentation,qA=new Quaternion(),qB=new Quaternion();qA.setFromEuler(random()*6,random()*6,random()*6);qB.setFromEuler(random()*6,random()*6,random()*6);
  for(let n=0;n<3;n++){const axis=new Vec3(random()-.5,random()-.5,random()-.5);axis.normalize();const pA=new Vec3(random()*6,random()*6,random()*6),pB=new Vec3(random()*6,random()*6,random()*6),expected=baseA.testSepAxis(axis,baseB,pA,qA,pB,qB),actual=fastA.testSepAxis(axis,fastB,pA,qA,pB,qB);if(expected===false)assert.equal(actual,false);else assert.ok(Math.abs(actual-expected)<1e-10);}
 }
});

test('cached box axes preserve the full Cannon SAT search and invalidate when either box rotates',()=>{
 let state=321;const random=()=>((state=(Math.imul(state,1664525)+1013904223)>>>0)/4294967296),reference=new Box(new Vec3(1,1,1)).convexPolyhedronRepresentation.findSeparatingAxis;
 for(let i=0;i<1200;i++){
  const a=physicsBox(new Vec3(.02+random()*2,.02+random(),.02+random())).convexPolyhedronRepresentation,b=physicsBox(new Vec3(.02+random(),.02+random()*2,.02+random())).convexPolyhedronRepresentation;
  const pA=new Vec3(random(),random(),random()),pB=new Vec3(random()*2,random()*2,random()*2),qA=new Quaternion(),qB=new Quaternion();
  for(let j=0;j<3;j++){
   if(j!==1)qA.setFromEuler(random()*6,random()*6,random()*6);if(j!==2)qB.setFromEuler(random()*6,random()*6,random()*6);
   const expected=new Vec3(),actual=new Vec3(),hit=reference.call(a,b,pA,qA,pB,qB,expected);
   assert.equal(a.findSeparatingAxis(b,pA,qA,pB,qB,actual),hit);if(hit)assert.ok(actual.distanceTo(expected)<1e-12,'contact normal and tie-breaking order are unchanged');
  }
 }
});

test('cached SAT axes retain contact counts and rigid-body trajectories through pile impacts',()=>{
 const reference=new Box(new Vec3(1,1,1)).convexPolyhedronRepresentation.findSeparatingAxis;
 const make=optimized=>{
  const world=new World({gravity:new Vec3(0,-9.81,0)});world.broadphase=new SAPBroadphase(world);world.broadphase.useBoundingBoxes=true;world.solver.iterations=20;
  const shape=size=>{const s=physicsBox(new Vec3(...size));if(!optimized)s.convexPolyhedronRepresentation.findSeparatingAxis=reference;return s;};
  world.addBody(new Body({mass:0,shape:shape([3,.1,3]),position:new Vec3(0,-.1,0)}));
  for(let i=0;i<18;i++){const body=new Body({mass:.2,shape:shape([.15,.07,.2]),position:new Vec3((i%3-.9)*.32,.1+Math.floor(i/3)*.16,0)});body.quaternion.setFromEuler(i*.01,i*.04,i*.005);world.addBody(body);}
  return world;
 };
 const a=make(false),b=make(true);
 for(let frame=0;frame<360;frame++){
  if(frame===100)for(const world of [a,b])world.bodies[10].applyImpulse(new Vec3(.2,.1,.08));
  a.step(1/60);b.step(1/60);assert.equal(b.contacts.length,a.contacts.length);
  for(let i=1;i<a.bodies.length;i++){assert.ok(a.bodies[i].position.distanceTo(b.bodies[i].position)<1e-9);const qa=a.bodies[i].quaternion,qb=b.bodies[i].quaternion;assert.ok(Math.abs(qa.x-qb.x)+Math.abs(qa.y-qb.y)+Math.abs(qa.z-qb.z)+Math.abs(qa.w-qb.w)<1e-9);}
 }
});

test('ray acceleration preserves original face indices and rebuilds after holes and geometry edits',()=>{
 const geometry=new T.BoxGeometry(2,2,2,8,8,8),material=new T.MeshStandardMaterial(),source=new T.Mesh(geometry,material);source.updateMatrixWorld(true);const original=source.raycast,indexBefore=geometry.index.array.slice(),ray=new T.Raycaster(new T.Vector3(.17,.21,3),new T.Vector3(0,0,-1));
 const base=[];original.call(source,ray,base);accelerateRaycast(source);let hits=[];source.raycast(ray,hits);assert.deepEqual(hits.map(h=>h.faceIndex).sort(),base.map(h=>h.faceIndex).sort());assert.deepEqual(geometry.index.array,indexBefore);
 const tree=geometry.boundsTree;source.position.x=.1;source.updateMatrixWorld(true);hits=[];source.raycast(ray,hits);assert.equal(geometry.boundsTree,tree,'transform changes do not rebuild local geometry');
 const face=hits[0].faceIndex;geometry.index.array.fill(0,face*3,face*3+3);geometry.index.needsUpdate=true;hits=[];source.raycast(ray,hits);assert.ok(hits.every(h=>h.faceIndex!==face));assert.notEqual(geometry.boundsTree,tree,'removed triangles invalidate acceleration');
 geometry.translate(.3,0,0);const fresh=[];original.call(source,ray,fresh);hits=[];source.raycast(ray,hits);assert.deepEqual(hits.map(h=>h.faceIndex).sort(),fresh.map(h=>h.faceIndex).sort());
});

test('world query culling preserves finite-range, inside-object and rotated mesh ray hits',()=>{
 const objects=[];for(let i=0;i<40;i++){const mesh=new T.Mesh(new T.BoxGeometry(.5,1,.5),new T.MeshStandardMaterial({side:T.DoubleSide}));mesh.position.set((i%5)*1.5,Math.floor(i/5)*.7,(i%3)*1.2);mesh.rotation.set(i*.02,i*.1,0);mesh.updateMatrixWorld(true);objects.push(mesh);}
 const query=new WorldRayQuery(objects);for(const origin of [new T.Vector3(0,0,0),new T.Vector3(3,2,8),new T.Vector3(8,1,1)])for(const far of [.05,.5,3,Infinity])for(const direction of [new T.Vector3(0,0,-1),new T.Vector3(1,.1,0).normalize(),new T.Vector3(-1,-.2,-.5).normalize()]){
  const ray=new T.Raycaster(origin,direction,0,far),base=ray.intersectObjects(objects,false),actual=query.intersect(ray);assert.deepEqual(actual.map(h=>[h.object.id,h.faceIndex,h.distance]),base.map(h=>[h.object.id,h.faceIndex,h.distance]));
 }
});

test('moving-shadow invalidation retains full quality and updates only intersecting light frusta',()=>{
 const scene=new T.Scene(),top=new T.SpotLight(),bottom=new T.SpotLight();top.position.set(0,10,0);top.target.position.set(0,5,0);bottom.position.set(0,4,0);bottom.target.position.set(0,0,0);for(const light of [top,bottom]){light.castShadow=true;light.distance=8;light.angle=.7;scene.add(light,light.target);}scene.updateMatrixWorld(true);
 const renderer={shadowMap:{needsUpdate:false}},sizes=[top.shadow.mapSize.clone(),bottom.shadow.mapSize.clone()];assert.equal(updateShadowCache(renderer,scene,true),2);for(const light of [top,bottom])light.shadow.needsUpdate=false;
 renderer.shadowMap.needsUpdate=false;const bounds=new T.Box3(new T.Vector3(-.2,6,-.2),new T.Vector3(.2,7,.2));assert.equal(updateShadowCache(renderer,scene,false,bounds),1);assert.equal(top.shadow.needsUpdate,true);assert.equal(bottom.shadow.needsUpdate,false);assert.equal(renderer.shadowMap.needsUpdate,true);assert.ok(top.shadow.mapSize.equals(sizes[0])&&bottom.shadow.mapSize.equals(sizes[1]));
 for(const light of [top,bottom])light.shadow.needsUpdate=false;assert.equal(updateShadowCache(renderer,scene,false,new T.Box3()),0);assert.equal(updateShadowCache(renderer,scene,true),2);
});
