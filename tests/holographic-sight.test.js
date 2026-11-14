import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {attachHolographicSight,updateHolographicSight,pivotHolographicLean,HOLO_AXIS_Y} from '../src/models/HolographicSight.js';
import {WEAPONS} from '../src/weapons/WeaponProfiles.js';

test('M4 holo replaces the rear iron and its sight anchors align with neutral ADS',()=>{
 const model=new T.Group(),oldIron=new T.Group();oldIron.name='optic_iron';model.add(oldIron);
 for(const name of ['anchor_sight_iron','anchor_sight_front']){const anchor=new T.Object3D();anchor.name=name;model.add(anchor);}
 attachHolographicSight(model);assert.equal(oldIron.visible,false);
 model.position.fromArray(WEAPONS.assault.aim);model.updateMatrixWorld(true);
 const camera=new T.PerspectiveCamera(62,16/9,.01,10);camera.updateMatrixWorld(true);
 for(const name of ['anchor_sight_iron','anchor_sight_front']){
  const point=model.getObjectByName(name).getWorldPosition(new T.Vector3()).project(camera);
  assert.ok(Math.abs(point.x)<1e-6&&Math.abs(point.y)<1e-6);
 }
 updateHolographicSight(model,camera);const reticle=model.userData.holoSight.userData.reticle;
 assert.equal(reticle.visible,true);assert.ok(Math.abs(reticle.position.y-.049)<1e-6);
 assert.ok(Math.abs(WEAPONS.assault.aim[1]+HOLO_AXIS_Y)<1e-6);
});

test('ADS lean pivots around the glass and keeps the reticle centered for either peek direction',()=>{
 for(const angle of [-.22,.22]){
  const group=new T.Group(),model=new T.Group();group.add(model);attachHolographicSight(model);
  group.position.fromArray(WEAPONS.assault.aim);group.rotation.z=angle;
  pivotHolographicLean(group,model,angle,1);
  const camera=new T.PerspectiveCamera(62,16/9,.01,10);updateHolographicSight(model,camera);
  const reticle=model.userData.holoSight.userData.reticle;
  assert.equal(reticle.visible,true);
  const center=reticle.getWorldPosition(new T.Vector3()).project(camera);
  assert.ok(Math.abs(center.x)<1e-6&&Math.abs(center.y)<1e-6);
  assert.ok(Math.abs(reticle.position.x)<1e-6&&Math.abs(reticle.position.y-.049)<1e-6);
 }
});
test('holo reticle follows view parallax and disappears when the sight window is outside the view axis',()=>{
 const model=new T.Group();attachHolographicSight(model);model.position.fromArray(WEAPONS.assault.aim);
 const camera=new T.PerspectiveCamera(62,1,.01,10);camera.position.x=.005;updateHolographicSight(model,camera);
 const reticle=model.userData.holoSight.userData.reticle;assert.equal(reticle.visible,true);assert.ok(Math.abs(reticle.position.x-.005)<1e-6);
 const projected=reticle.getWorldPosition(new T.Vector3()).project(camera);assert.ok(Math.abs(projected.x)<1e-6&&Math.abs(projected.y)<1e-6);
 camera.position.x=.1;updateHolographicSight(model,camera);assert.equal(reticle.visible,false);
 camera.position.x=0;camera.rotation.y=Math.PI;updateHolographicSight(model,camera);assert.equal(reticle.visible,false);
});
