import test from 'node:test';
import assert from 'node:assert/strict';
import {PerspectiveCamera,Scene,Mesh,BoxGeometry,MeshBasicMaterial,Matrix4} from 'three';
import {PredictionCamera} from '../src/multiplayer/PredictionCamera.js';
import {WorldSync} from '../src/multiplayer/WorldSync.js';

test('prediction renders intermediate frames without changing simulation endpoints or delaying mouse look',()=>{
 const camera=new PerspectiveCamera(),view=new PredictionCamera(camera);view.tick();camera.position.x=1;view.tick();
 view.render(.25,{yaw:.7,pitch:-.2});assert.equal(camera.position.x,.25);assert.equal(camera.rotation.y,.7);assert.equal(camera.rotation.x,-.2);
 view.render(.75,{yaw:.8,pitch:0});assert.equal(camera.position.x,.75);
 view.restore();assert.equal(camera.position.x,1);
 camera.position.x=1.1;view.correct();view.render(.5,{yaw:0,pitch:0});assert.ok(Math.abs(camera.position.x-.6)<1e-9);
 camera.position.x=50;view.reset();view.render(.1,{yaw:0,pitch:0});assert.equal(camera.position.x,50,'respawn resets both endpoints');
});

test('quiet world polling allocates no matrix clones, but preserves transform and geometry changes',()=>{
 const scene=new Scene(),mesh=new Mesh(new BoxGeometry(),new MeshBasicMaterial());mesh.userData.isShootable=true;scene.add(mesh);
 const sync=new WorldSync(scene,{colliders:[]});let clones=0;const original=Matrix4.prototype.clone;
 Matrix4.prototype.clone=function(){clones++;return original.call(this)};
 try{
  for(let i=0;i<100;i++)assert.equal(sync.collect().length,0);
  assert.equal(clones,0);
  mesh.position.x=2;let entries=sync.collect();assert.equal(entries.length,1);assert.equal(entries[0].matrix[12],2);
  assert.equal(sync.collect().length,0);
  mesh.geometry.attributes.position.needsUpdate=true;entries=sync.collect();assert.ok(entries[0].geometry);
 }finally{Matrix4.prototype.clone=original;mesh.geometry.dispose();mesh.material.dispose();}
});
