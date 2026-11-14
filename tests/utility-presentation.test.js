import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {ProjectilePresentation} from '../src/multiplayer/ProjectilePresentation.js';
import {SmokeCloud} from '../src/weapons/SmokeCloud.js';
import {SmokeVolumePass,MAX_SMOKE_VOLUMES} from '../src/environment/SmokeVolumePass.js';
import {DetonationEffects} from '../src/weapons/DetonationEffects.js';
import {GameWorld} from '../server/GameWorld.js';

test('throwables advance between snapshots without extrapolating beyond a bounce',()=>{
 const mesh=new T.Object3D(),view=new ProjectilePresentation(mesh);view.push([0,1,0],0);view.push([1,2,0],50);
 view.update(100);assert.equal(mesh.position.x,.5);assert.equal(mesh.position.y,1.5);
 view.update(110);assert.ok(mesh.position.x>.5&&mesh.position.x<1);
 view.push([.7,1,0],100);view.update(150);assert.ok(Math.abs(mesh.position.x-.85)<1e-8);
 view.update(1000);assert.equal(mesh.position.x,.7,'no extrapolation through a wall during missing packets');
});

test('dense smoke uses a bounded depth pass only while active and clips at room boundaries',()=>{
 const scene=new T.Scene(),camera=new T.PerspectiveCamera(),pass=new SmokeVolumePass(new T.DepthTexture()),clip=new T.Box3(new T.Vector3(-2,3.4,-2),new T.Vector3(2,6.5,2));
 pass.update([],camera);assert.equal(pass.enabled,false);
 const clouds=Array.from({length:MAX_SMOKE_VOLUMES+1},(_,i)=>new SmokeCloud(scene,new T.Vector3(i,3.5,0),clip));
 for(const c of clouds){c.age=2;c.update(0);assert.equal(c.mesh.userData.ssao,false)}
 pass.update(clouds,camera,.016);assert.equal(pass.enabled,true);assert.equal(pass.material.uniforms.count.value,MAX_SMOKE_VOLUMES);
 assert.equal(clouds.filter(c=>c.volumeOnly).length,MAX_SMOKE_VOLUMES);
 assert.ok(pass.material.uniforms.clipMin.value[0].equals(clip.min));assert.ok(pass.material.uniforms.clipMax.value[0].equals(clip.max));
 for(const cloud of clouds){cloud.age=cloud.duration;cloud.dispose(scene);}pass.update([],camera);assert.equal(pass.enabled,false);pass.dispose();
});

test('frag/flash cosmetics share a fixed particle pool and expire without geometry churn',()=>{
 const fx=new DetonationEffects(new T.Scene()),geometry=fx.mesh.geometry;
 for(let i=0;i<40;i++)fx.burst(i%2?'flash':'frag',new T.Vector3());
 assert.equal(fx.mesh.count,96);assert.equal(fx.mesh.geometry,geometry);assert.equal(fx.mesh.userData.ssao,false);
 assert.equal(fx.attributes.timing.count,96);fx.update(2);assert.equal(fx.mesh.visible,false);
});

test('wellness floor no longer shares a coplanar top with the exterior stair landing',()=>{
 const world=new GameWorld('villa');
 try{
  for(const [x,z] of [[-16.5,-4],[-16.5,4.3]]){
   const meshes=new Set(world.map.colliders.filter(b=>Math.abs(b.max.y-3.4)<1e-5&&b.min.x<x&&b.max.x>x&&b.min.z<z&&b.max.z>z).map(b=>b.supportMesh).filter(Boolean));
   assert.equal(meshes.size,1,`exactly one walkable slab at ${x}, ${z}`);
  }
 }finally{world.dispose();}
});
