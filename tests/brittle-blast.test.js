import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {VillaMap} from '../src/world/VillaMap.js';
import {SurfaceDamage} from '../src/world/SurfaceDamage.js';
import {materialPart} from '../src/world/MaterialProps.js';
import {packOperation,computeOperation,applyOperation} from '../src/environment/GeometryJobs.js';
import {soundEngine} from '../src/audio/SoundEngine.js';

for(const key of Object.getOwnPropertyNames(Object.getPrototypeOf(soundEngine)))if(key.startsWith('play'))soundEngine[key]=()=>{};
const V=(x=0,y=0,z=0)=>new T.Vector3(x,y,z);
function sample(){
 const scene=new T.Scene(),colliders=[],mesh=materialPart(new T.Mesh(new T.BoxGeometry(2.8,.68,.12),new T.MeshStandardMaterial()),'ceramic');
 scene.add(mesh);const box=new T.Box3().setFromObject(mesh);box.supportMesh=mesh;mesh.userData.collider=box;colliders.push(box);
 return{mesh,fx:new SurfaceDamage(scene,colliders),hit:{object:mesh,point:V(0,0,.06),face:{normal:V(0,0,1)},distance:0}};
}
function gapWidth(mesh){let count=0;for(let x=-1.2;x<=1.2;x+=.025){const ray=new T.Raycaster(V(x,0,.2),V(0,0,-1),0,.4);if(!ray.intersectObject(mesh).length)count++;}return count*.025;}

test('thin ceramic has a broad through-fracture under blast instead of a bullet crater',()=>{
 const bullet=sample(),blast=sample();
 bullet.fx.hit(bullet.hit,'primary',V(0,0,-1),{damage:125});
 blast.fx.hit(blast.hit,'primary',V(0,0,-1),{damage:180,blast:true});
 assert.ok(gapWidth(blast.mesh)>.8);assert.ok(gapWidth(blast.mesh)>gapWidth(bullet.mesh)*2);
 assert.equal(blast.fx.marks.length,0,'blast fracture must not add a bullet decal');
 assert.ok(blast.fx.pools.concrete.pieces.length<=24);assert.equal(blast.fx.pools.concrete.capacity,160);
});

test('worker and synchronous brittle blast cuts produce the same geometry with a single cut',()=>{
 const direct=sample(),worker=sample();direct.fx.hit(direct.hit,'primary',V(0,0,-1),{damage:180,blast:true});
 const steps=worker.fx.hitSteps(worker.hit,'primary',V(0,0,-1),{damage:180,blast:true},true);let step=steps.next(),operations=0;
 while(!step.done){const op=step.value;assert.equal(op.kind,'chip');operations++;step=steps.next(applyOperation(op,computeOperation(packOperation(op))));}
 assert.equal(operations,1);for(const attr of ['position','normal','uv'])assert.deepEqual(worker.mesh.geometry.attributes[attr].array,direct.mesh.geometry.attributes[attr].array);
 assert.equal(worker.fx.marks.length,0);assert.equal(worker.mesh.visible,direct.mesh.visible);
});

test('a grenade inside the villa bathtub shatters its complete shell, spills finite water, and retains the floor',()=>{
 const map=new VillaMap(new T.Scene());map.surfaceDamage=new SurfaceDamage(map.scene,map.colliders);
 const tub=map.liquids.bodies.find(b=>b.walls.some(w=>w.name==='Bathtub shell')),pools=Object.fromEntries(Object.entries(map.surfaceDamage.pools).map(([k,p])=>[k,p.capacity]));
 map.damageExplosionSync(V(tub.x,tub.bottom+.16,tub.z),6);
 assert.ok(tub.walls.every(w=>!w.visible),'the shell must shatter, not receive several large holes');
 const base=map.scene.children.find(o=>o.name==='Bathtub base');assert.equal(base.visible,false);
 assert.ok(!map.colliders.some(box=>tub.walls.includes(box.supportMesh)||box.supportMesh===base));
 assert.ok(map.debris.pieces.some(p=>p.life===Infinity),'visible broken pieces remain in the existing retained pool');
 for(let i=0;i<180;i++){map.update(1/60,V(6.5,8,-6));map.surfaceDamage.update(1/60);}
 assert.ok(map.liquids.spilled>.5);assert.ok(tub.volume<tub.initialVolume*.2);
 assert.ok(Math.abs(tub.volume+map.liquids.spilled-tub.initialVolume)<1e-8);
 assert.equal(map.surfaceDamage.marks.filter(mark=>tub.walls.includes(mark.mesh)).length,0);
 assert.ok(map.rubbleFloor(V(tub.x,6.85,tub.z),6.85)>6.7,'the concrete storey remains underneath the tub');
 assert.deepEqual(Object.fromEntries(Object.entries(map.surfaceDamage.pools).map(([k,p])=>[k,p.capacity])),pools);
});

test('an outside blast breaks the near tub wall while the pre-blast shell shields its far wall',()=>{
 const map=new VillaMap(new T.Scene());map.surfaceDamage=new SurfaceDamage(map.scene,map.colliders);
 const tub=map.liquids.bodies.find(b=>b.walls.some(w=>w.name==='Bathtub shell'));
 map.damageExplosionSync(V(tub.x,tub.bottom+.16,-6.9),6);
 assert.equal(tub.walls[3].visible,false,'close blast breaks the whole facing wall');
 assert.equal(tub.walls[2].visible,true,'the opposite wall remains behind the original cover');assert.equal(tub.walls[2].userData.surfaceCuts,undefined);
 assert.equal(map.scene.children.find(o=>o.name==='Bathtub base').visible,true);
});

test('a distant outside blast chips the tub instead of removing its whole facing wall',()=>{
 const map=new VillaMap(new T.Scene());map.surfaceDamage=new SurfaceDamage(map.scene,map.colliders);
 const tub=map.liquids.bodies.find(b=>b.walls.some(w=>w.name==='Bathtub shell'));
 map.damageExplosionSync(V(tub.x,tub.bottom+.16,-4.5),6);
 assert.equal(tub.walls[3].visible,true);assert.ok(tub.walls[3].userData.surfaceCuts>0);assert.equal(tub.walls[2].userData.surfaceCuts,undefined);
 assert.equal(map.surfaceDamage.marks.filter(mark=>tub.walls.includes(mark.mesh)).length,0);
});
