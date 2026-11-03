import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {World,Body,Box,Vec3,Quaternion} from 'cannon-es';
import {MotionBatch} from '../src/environment/MotionBatch.js';
import {installShapeCulling} from '../src/environment/ShapeCulling.js';
import {materialPart,removeProp} from '../src/world/MaterialProps.js';
import {SurfaceDamage} from '../src/world/SurfaceDamage.js';
import {projectSurfaceMark,removeSurfaceMark} from '../src/world/SurfaceDecal.js';
import {soundEngine} from '../src/audio/SoundEngine.js';
import {physicsBox} from '../src/environment/PhysicsBox.js';
import {accelerateRaycast} from '../src/environment/RaycastCache.js';
import {WorldRayQuery} from '../src/environment/WorldRayQuery.js';
import {updateShadowCache} from '../src/environment/ShadowCache.js';
import {unionCollisionBoxes} from '../src/environment/CollisionVolumes.js';
for(const k of ['playWoodHit','playDoorBreak','playGlassBreak','playImpact'])soundEngine[k]=()=>{};

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
