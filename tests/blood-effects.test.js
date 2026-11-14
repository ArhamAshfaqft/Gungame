import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {BloodEffects,bloodImpactProfile} from '../src/world/BloodEffects.js';
function setup(){
 const scene=new THREE.Scene(),floor=new THREE.Mesh(new THREE.BoxGeometry(10,.1,10),new THREE.MeshBasicMaterial());floor.position.y=-.05;floor.userData.isShootable=true;scene.add(floor);
 const table=new THREE.Mesh(new THREE.BoxGeometry(2,1,2),new THREE.MeshBasicMaterial());table.position.y=.5;table.userData.isShootable=true;scene.add(table);scene.updateMatrixWorld(true);
 return{scene,floor,table,effects:new BloodEffects(scene)};
}
test('bleeding follows the wounded bone after death and overflows a nearby table edge onto the floor',()=>{
 const {scene,floor,table,effects}=setup(),head=new THREE.Object3D(),hips=new THREE.Object3D();head.position.set(.5,1.4,0);hips.position.set(-.6,1.2,0);scene.add(head,hips);scene.updateMatrixWorld(true);
 const bot={model:scene,rig:{bones:{Head:head,Hips:hips}},isAlive:true,ragdoll:{sleeping:true}};
 effects.wound(bot,new THREE.Vector3(.5,1.4,0),'primary',125);
 head.position.x=.94;scene.updateMatrixWorld(true);bot.isAlive=false;effects.death(bot);effects.update(1/60);
 const pool=effects.marks.find(m=>m.pool);assert.equal(pool.mesh,table);assert.ok(Math.abs(pool.local.x-.94)<.001,'pool follows the head wound, not the pelvis');assert.equal(effects.streams.length,1);
 const streak=effects.marks.find(m=>m.streak);assert.equal(streak?.mesh,table,'visible streak belongs to tabletop side');assert.ok(streak.decal.geometry.index.count>0,'side streak has surface triangles');assert.ok(pool.size.x>.8,'death pool is clearly visible');
 for(let i=0;i<1800;i++)effects.update(1/120);
 assert.equal(effects.marks.filter(m=>m.mesh===floor&&m.pool).length,1,'drips feed one growing floor pool');assert.ok(effects.marks.every(m=>!m.growth),'finished stains stop updating growth');assert.equal(effects.streams.length,0);assert.equal(effects.landings.length,0);assert.equal(effects.active,0,'dripping finishes instead of simulating indefinitely');effects.dispose();
});
test('bleeding in the middle of a tabletop cannot pass through the solid table to the floor',()=>{
 const {table,effects}=setup(),hit=effects.surface(new THREE.Vector3(0,1.4,0),new THREE.Vector3(0,-1,0),2,effects.targets());
 assert.equal(hit.object,table);effects.overflow(hit,.6,effects.targets());assert.equal(effects.streams.length,0);effects.dispose();
});
test('weapon impact strength and range affect the blood spray, and respawn clears old wounds',()=>{
 assert.ok(bloodImpactProfile('primary',125,3).size>bloodImpactProfile('pistol',34,3).size);
 assert.ok(bloodImpactProfile('assault',36,3).speed>bloodImpactProfile('assault',36,110).speed);
 const {scene,effects}=setup(),bone=new THREE.Object3D();scene.add(bone);const bot={model:scene,rig:{bones:{Head:bone}}};effects.wound(bot,new THREE.Vector3(),'pistol',34);effects.clearWounds(bot);effects.death(bot);assert.equal(effects.pending.length,0);effects.dispose();
});


test('thin tabletops receive a clipped side streak without painting empty air beneath the edge',()=>{
 const {scene,table,effects}=setup();table.geometry.dispose();table.geometry=new THREE.BoxGeometry(2,.12,2);table.position.y=1;scene.updateMatrixWorld(true);
 const hit=effects.surface(new THREE.Vector3(.94,1.4,0),new THREE.Vector3(0,-1,0),2,effects.targets());effects.overflow(hit,.9,effects.targets());
 const streak=effects.marks.find(m=>m.streak);assert.ok(streak,'side streak created');
 const position=streak.decal.geometry.attributes.position,point=new THREE.Vector3();
 for(let i=0;i<position.count;i++){point.fromBufferAttribute(position,i);streak.decal.localToWorld(point);assert.ok(point.y>=.938&&point.y<=1.063,'streak remains clipped to thin tabletop');}
 effects.dispose();
});

