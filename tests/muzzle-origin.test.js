import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {attachMuzzleFlash,muzzleWorldPosition} from '../src/models/MuzzleFlash.js';
import {SniperWeapon} from '../src/weapons/SniperWeapon.js';

test('muzzle anchor follows transformed barrel and attaching twice does not shift its origin',()=>{
 const root=new T.Group(),gun=new T.Mesh(new T.BoxGeometry(.05,.05,1));root.add(gun);root.position.set(5,2,3);root.rotation.y=.8;gun.rotation.x=.25;
 const flash=attachMuzzleFlash(gun,'assault'),expected=gun.localToWorld(new T.Vector3(0,0,-.525));
 assert.ok(muzzleWorldPosition(gun).distanceTo(expected)<1e-6);assert.equal(attachMuzzleFlash(gun,'assault'),flash);
 gun.position.x=.4;assert.ok(muzzleWorldPosition(gun).distanceTo(expected)>.39);
});
test('local shot streak reanchors to the displayed muzzle on pose inspection and stays thin and bounded',()=>{
 const weapon={scene:new T.Scene(),tracers:[],visualMuzzlePosition:()=>new T.Vector3(1,2,3)};
 SniperWeapon.prototype.createBulletTracer.call(weapon,new T.Vector3(0,2,0),new T.Vector3(0,2,-300),'assault');
 SniperWeapon.prototype.syncTracerOrigins.call(weapon);const tracer=weapon.tracers[0];
 assert.deepEqual(tracer.mesh.position.toArray(),[1,2,3]);assert.equal(tracer.mesh.scale.z,8);assert.ok(tracer.life<.1);
 tracer.mesh.geometry.computeBoundingBox();assert.ok(tracer.mesh.geometry.boundingBox.getSize(new T.Vector3()).x<.006);
 assert.ok(tracer.mesh.getWorldDirection(new T.Vector3()).dot(tracer.end.clone().sub(tracer.mesh.position).normalize())>.999);
});
