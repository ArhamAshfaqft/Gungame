import test from 'node:test';import assert from 'node:assert/strict';import * as THREE from 'three';import {subtractBox,chipBox,impactParameters} from '../src/world/SurfaceGeometry.js';import {SurfaceDamage} from '../src/world/SurfaceDamage.js';import {soundEngine} from '../src/audio/SoundEngine.js';
for(const key of ['playImpact','playWoodHit','playDoorBreak','playGlassBreak'])soundEngine[key]=()=>{};
const volume=b=>{const s=b.getSize(new THREE.Vector3());return s.x*s.y*s.z};
test('surface box subtraction removes only the damaged volume and leaves closed solid fragments',()=>{const box=new THREE.Box3(new THREE.Vector3(-1,-1,-1),new THREE.Vector3(1,1,1)),cut=new THREE.Box3(new THREE.Vector3(.8,.8,.8),new THREE.Vector3(1.2,1.2,1.2));const pieces=subtractBox(box,cut);assert.ok(Math.abs(pieces.reduce((v,b)=>v+volume(b),0)-(8-.008))<1e-6);for(const b of pieces)assert.ok(volume(b)>0);});
test('sniper edge impacts change actual concrete geometry; metal only dents and marks',()=>{const scene=new THREE.Scene(),effects=new SurfaceDamage(scene,[]),box=new THREE.Mesh(new THREE.BoxGeometry(2,2,2),new THREE.MeshStandardMaterial());box.userData.surface='concrete';scene.add(box);scene.updateMatrixWorld(true);const old=box.geometry;effects.hit({object:box,point:new THREE.Vector3(.97,.95,1),face:{normal:new THREE.Vector3(0,0,1)}},'primary',new THREE.Vector3(0,0,-1));assert.notEqual(box.geometry,old);assert.equal(box.userData.surfaceCuts,1);assert.ok(effects.pools.concrete.pieces.length>0);assert.ok(effects.marks.length>0);assert.ok(effects.marks[0].decal.position.z<1);const metal=new THREE.Mesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshStandardMaterial({metalness:1}));scene.add(metal);const m=metal.geometry;effects.hit({object:metal,point:new THREE.Vector3(0,0,.5),face:{normal:new THREE.Vector3(0,0,1)}},'pistol',new THREE.Vector3(0,0,-1));assert.notEqual(metal.geometry,m);assert.ok(!metal.userData.surfaceCuts);assert.ok(metal.geometry.attributes.position.array.every(Number.isFinite));assert.ok(effects.pools.metal.pieces.length>0);});
test('pistol and sniper leave different size impacts; marks and debris have fixed caps',()=>{assert.ok(impactParameters('primary','concrete').radius>impactParameters('pistol','concrete').radius*2);const scene=new THREE.Scene(),effects=new SurfaceDamage(scene,[]),mesh=new THREE.Mesh(new THREE.PlaneGeometry(10,10),new THREE.MeshBasicMaterial());scene.add(mesh);for(let i=0;i<205;i++)effects.hit({object:mesh,point:new THREE.Vector3((i%15)*.15,Math.floor(i/15)*.15,0),face:{normal:new THREE.Vector3(0,0,1)}},'pistol',new THREE.Vector3(0,0,-1));assert.equal(effects.marks.length,192);assert.ok(effects.pools.concrete.pieces.length<=160);effects.update(80);assert.equal(effects.marks.length,0);});
test('destroyed wooden props release their collision and bulbs extinguish only their linked lights',()=>{const scene=new THREE.Scene(),wood=new THREE.Mesh(new THREE.BoxGeometry(.4,.4,.4),new THREE.MeshStandardMaterial()),collider=new THREE.Box3().setFromObject(wood),colliders=[collider],effects=new SurfaceDamage(scene,colliders);wood.userData={surface:'wood',collider};scene.add(wood);for(let i=0;i<2;i++)effects.hit({object:wood,point:new THREE.Vector3(0,0,.2),face:{normal:new THREE.Vector3(0,0,1)}},'primary',new THREE.Vector3(0,0,-1));assert.equal(wood.visible,false);assert.equal(colliders.length,0);const light=new THREE.PointLight(0xffffff,8),other=new THREE.PointLight(0xffffff,4),bulb=new THREE.Mesh(new THREE.SphereGeometry(.1),new THREE.MeshBasicMaterial());bulb.userData.breakableLight={lights:[light],broken:false};scene.add(bulb);effects.hit({object:bulb,point:new THREE.Vector3(),face:{normal:new THREE.Vector3(0,1,0)}},'pistol',new THREE.Vector3(0,-1,0));assert.equal(light.intensity,0);assert.equal(other.intensity,4);assert.equal(bulb.visible,false);});

test('jagged chips create sloped cut faces instead of rectangular box notches and stay bounded',()=>{
 const mesh=new THREE.Mesh(new THREE.BoxGeometry(2,2,2),new THREE.MeshStandardMaterial());chipBox(mesh,new THREE.Vector3(.97,.92,1),new THREE.Vector3(0,0,1),.18,.13);
 const normals=mesh.geometry.attributes.normal;let sloped=0;for(let i=0;i<normals.count;i++){const values=[Math.abs(normals.getX(i)),Math.abs(normals.getY(i)),Math.abs(normals.getZ(i))];if(Math.max(...values)<.995)sloped++;}
 assert.ok(sloped>12,'fracture must expose oblique faces');assert.ok(mesh.geometry.attributes.position.count<50000);assert.ok(mesh.geometry.attributes.position.array.every(Number.isFinite));
 for(let i=0;i<12;i++)chipBox(mesh,new THREE.Vector3(.95-i*.01,.91,1),new THREE.Vector3(0,0,1),.18,.13);assert.ok(mesh.userData.surfaceCuts<=8);
});
test('surface-clipped marks never extend beyond a wall edge and follow moved parents',()=>{
 const scene=new THREE.Scene(),effects=new SurfaceDamage(scene,[]),mesh=new THREE.Mesh(new THREE.BoxGeometry(1,1,.2),new THREE.MeshStandardMaterial());scene.add(mesh);
 effects.hit({object:mesh,point:new THREE.Vector3(.49,0,.1),face:{normal:new THREE.Vector3(0,0,1)}},'pistol',new THREE.Vector3(0,0,-1));
 const mark=effects.marks[0];assert.ok(mark);assert.equal(mark.decal.parent,mesh);
 const p=mark.decal.geometry.attributes.position;for(let i=0;i<p.count;i++)assert.ok(p.getX(i)<=.502,'no decal triangles in empty air beyond edge');
 const before=mark.decal.getWorldPosition(new THREE.Vector3());mesh.position.x=2;mesh.rotation.y=.4;scene.updateMatrixWorld(true);effects.update(0);assert.ok(mark.decal.getWorldPosition(new THREE.Vector3()).x>before.x+1.9);
});
test('marks are reprojected after indexed door boards are removed, including complete supporting surface loss',()=>{
 const scene=new THREE.Scene(),effects=new SurfaceDamage(scene,[]),mesh=new THREE.Mesh(new THREE.PlaneGeometry(1,1),new THREE.MeshStandardMaterial());scene.add(mesh);
 effects.hit({object:mesh,point:new THREE.Vector3(),face:{normal:new THREE.Vector3(0,0,1)}},'pistol',new THREE.Vector3(0,0,-1));assert.equal(effects.marks.length,1);
 const original=effects.marks[0].decal.geometry;mesh.geometry.setIndex([]);effects.update(.016);assert.equal(effects.marks.length,0);assert.equal(original!==mesh.geometry,true);
});

test('concrete edge damage accumulates locally, with distance and penetration reducing strength',()=>{
 const make=()=>{const scene=new THREE.Scene(),fx=new SurfaceDamage(scene,[]),mesh=new THREE.Mesh(new THREE.BoxGeometry(2,2,.4),new THREE.MeshStandardMaterial());scene.add(mesh);return{fx,mesh}};
 const hit=(target,x=.98,y=0,distance=0,slot='pistol',damage)=>target.fx.hit({object:target.mesh,point:new THREE.Vector3(x,y,.2),face:{normal:new THREE.Vector3(0,0,1)},distance},slot,new THREE.Vector3(0,0,-1),{damage});
 const close=make();hit(close);hit(close);assert.equal(close.mesh.userData.surfaceCuts,undefined);hit(close);assert.equal(close.mesh.userData.surfaceCuts,1);
 const separate=make();hit(separate,.98,-.5);hit(separate,.98,0);hit(separate,.98,.5);assert.equal(separate.mesh.userData.surfaceCuts,undefined,'damage must not pool across a whole wall');
 const far=make();for(let i=0;i<3;i++)hit(far,.98,0,80);assert.equal(far.mesh.userData.surfaceCuts,undefined);for(let i=0;i<6;i++)hit(far,.98,0,80);assert.equal(far.mesh.userData.surfaceCuts,1);
 const sniper=make();hit(sniper,.98,0,5,'primary');assert.equal(sniper.mesh.userData.surfaceCuts,1);
 const distant=make();hit(distant,.98,0,160,'primary');assert.equal(distant.mesh.userData.surfaceCuts,undefined);
 const weakened=make();hit(weakened,.98,0,0,'primary',40);assert.equal(weakened.mesh.userData.surfaceCuts,undefined);
 assert.ok(impactParameters('pistol','concrete').radius<.018);
 assert.ok(impactParameters('primary','concrete',{distance:160}).strength<impactParameters('primary','concrete').strength);
});

test('repeat impacts reuse one surface mark while separate impact positions remain distinct',()=>{
 const scene=new THREE.Scene(),effects=new SurfaceDamage(scene,[]),mesh=new THREE.Mesh(new THREE.PlaneGeometry(4,4),new THREE.MeshStandardMaterial());scene.add(mesh);
 for(let i=0;i<40;i++)effects.hit({object:mesh,point:new THREE.Vector3(),face:{normal:new THREE.Vector3(0,0,1)}},'pistol',new THREE.Vector3(0,0,-1));
 assert.equal(effects.marks.length,1);
 effects.hit({object:mesh,point:new THREE.Vector3(.2,0,0),face:{normal:new THREE.Vector3(0,0,1)}},'pistol',new THREE.Vector3(0,0,-1));assert.equal(effects.marks.length,2);
 assert.ok(effects.marks.every(m=>m.decal.geometry.index.count>0));
});

test('villa impact scars survive long round time instead of visually repairing the surface',()=>{
 const scene=new THREE.Scene(),effects=new SurfaceDamage(scene,[],{retainMarks:true}),mesh=new THREE.Mesh(new THREE.BoxGeometry(2,2,.3),new THREE.MeshStandardMaterial());scene.add(mesh);
 effects.hit({object:mesh,point:new THREE.Vector3(.2,.3,.15),face:{normal:new THREE.Vector3(0,0,1)}},'pistol',new THREE.Vector3(0,0,-1));
 const mark=effects.marks[0];effects.update(180);assert.ok(effects.marks.includes(mark));assert.ok(mark.decal.parent===mesh);
});
