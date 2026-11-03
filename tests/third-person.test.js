import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {chaseCameraPosition,bodyMovement} from '../src/player/ThirdPersonView.js';
test('chase camera stays behind the eye, closes in while aiming, and stops before walls',()=>{
 const eye=new THREE.Vector3(0,1.6,0),rotation=new THREE.Quaternion();
 const free=chaseCameraPosition(eye,rotation,[]);assert.ok(free.z>3);assert.ok(chaseCameraPosition(eye,rotation,[],true).z<free.z);
 const wall=new THREE.Box3(new THREE.Vector3(-2,0,1.5),new THREE.Vector3(2,3,1.7));const blocked=chaseCameraPosition(eye,rotation,[wall]);assert.ok(blocked.z<1.3);assert.ok(blocked.z>0);
 const yaw=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),Math.PI);assert.ok(chaseCameraPosition(eye,yaw,[]).z<0);
});

test('player movement uses the same body coordinates as imported root motion at every yaw',()=>{
 for(const yaw of [0,.7,Math.PI,-1.2]){
  const forwardVelocity=new THREE.Vector3(-Math.sin(yaw)*3,0,-Math.cos(yaw)*3);
  const rightVelocity=new THREE.Vector3(Math.cos(yaw)*3,0,-Math.sin(yaw)*3);
  const forward=bodyMovement(forwardVelocity,yaw+Math.PI),right=bodyMovement(rightVelocity,yaw+Math.PI);
  assert.ok(Math.abs(forward.forward-3)<1e-6);assert.ok(Math.abs(forward.lateral)<1e-6);
  assert.ok(Math.abs(right.lateral+3)<1e-6);assert.ok(Math.abs(right.forward)<1e-6);
 }
});


test('crouched chase camera stays above the floor when looking upward',()=>{
 const position=chaseCameraPosition(new THREE.Vector3(0,1.05,0),new THREE.Quaternion().setFromEuler(new THREE.Euler(.8,0,0)),[],false,0);
 assert.ok(position.y>=.22);
});
