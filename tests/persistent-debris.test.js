import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {DebrisPool} from '../src/world/DebrisPool.js';

test('retained rubble settles on upper floors, survives time and subsequent hits, and clears on reset',()=>{
 let floor=3.4;
 const pool=new DebrisPool(new THREE.Scene(),new THREE.BoxGeometry(.2,.07,.2),new THREE.MeshStandardMaterial(),2,{groundHeight:()=>floor});
 const spawn=(life)=>pool.spawn(new THREE.Vector3(0,4,0),new THREE.Vector3(),new THREE.Matrix4(),new THREE.Vector3(),life);
 spawn(Infinity);spawn(Infinity);const first=pool.slots[0];spawn(1);assert.equal(pool.slots[0],first);
 for(let i=0;i<500;i++)pool.update(.05);
 assert.equal(pool.pieces.length,2);assert.ok(first.settled);assert.ok(Math.abs(first.position.y-3.435)<.001);
 assert.equal(pool.opacity.getX(0),1);
 floor=0;for(let i=0;i<200;i++)pool.update(.05);
 assert.ok(Math.abs(first.position.y-.035)<.001,'rubble falls when its supporting floor is breached');
 pool.clear();assert.equal(pool.pieces.length,0);assert.equal(pool.mesh.count,0);
});

test('temporary shards still expire',()=>{
 const pool=new DebrisPool(new THREE.Scene(),new THREE.TetrahedronGeometry(1),new THREE.MeshStandardMaterial(),2);
 pool.spawn(new THREE.Vector3(),new THREE.Vector3(),new THREE.Matrix4(),new THREE.Vector3(),1);
 pool.update(2);assert.equal(pool.pieces.length,0);
});
