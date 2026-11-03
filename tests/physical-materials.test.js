import test from 'node:test';import assert from 'node:assert/strict';import * as T from 'three';
import {physicalMaterial,projectileEnergy,penetrationResponse,blastImpact} from '../src/world/PhysicalMaterials.js';
import {VillaMap} from '../src/world/VillaMap.js';import {DebrisPool} from '../src/world/DebrisPool.js';import {dentMetal} from '../src/world/MetalDeformation.js';
import {soundEngine} from '../src/audio/SoundEngine.js';
for(const k of ['playWoodHit','playDoorBreak','playGlassBreak','playImpact'])soundEngine[k]=()=>{};

test('penetration depends on projectile energy, distance, thickness, material and angle',()=>{
 const wood=physicalMaterial('wood');
 assert.ok(penetrationResponse(wood,.065,projectileEnergy('primary',140)).penetrates,'sniper penetrates ordinary timber at long range');
 assert.equal(penetrationResponse(wood,.065,projectileEnergy('pistol',5)).penetrates,false);
 assert.equal(penetrationResponse(wood,.5,projectileEnergy('primary',140)).penetrates,false,'thick beams stop depleted energy');
 assert.equal(penetrationResponse('concrete',.22,projectileEnergy('primary')).penetrates,false);
 assert.equal(penetrationResponse('metal',.08,projectileEnergy('primary')).penetrates,false);
 assert.ok(penetrationResponse('metal',.003,projectileEnergy('primary')).penetrates);
 assert.ok(penetrationResponse(wood,.065,projectileEnergy('primary'),.25).damageMultiplier<penetrationResponse(wood,.065,projectileEnergy('primary'),1).damageMultiplier);
 assert.ok(projectileEnergy('shotgun',2)>projectileEnergy('shotgun',35)*5,'individual pellets lose useful energy over distance');
});

test('close blast damages timber much more than concrete and decays across a room',()=>{
 assert.ok(blastImpact('wood',.5,330)>220);
 assert.ok(blastImpact('wood',2.4,330)<100);
 assert.ok(blastImpact('wood',.5,330)>blastImpact('concrete',.5,330)*4);
});

test('a frag resting on the floor near a partition creates visible local damage',()=>{
 const m=new VillaMap(new T.Scene());
 m.damageExplosion(new T.Vector3(1.9,3.465,3.5),6);
 const damaged=m.panels.filter(p=>p.kind==='plaster'&&p.broken.size);
 assert.ok(damaged.length>0,'test the actual floor-height detonation, not a floating explosion');
 assert.ok(damaged.reduce((n,p)=>n+p.broken.size,0)<25,'a local breach preserves the rest of the room');
 assert.ok(m.blastScars.entries.length>0);
});

test('rubble cannot rest on empty space inside the enclosing box of an open door',()=>{
 const scene=new T.Scene(),door=new T.Mesh(new T.BoxGeometry(2,2,.06),new T.MeshStandardMaterial());door.position.y=1;door.rotation.y=Math.PI/4;scene.add(door);scene.updateMatrixWorld(true);
 const box=new T.Box3().setFromObject(door);box.supportMesh=door;
 const m={colliders:[box]},point=new T.Vector3(box.max.x-.07,2.4,box.max.z-.07);
 assert.equal(VillaMap.prototype.rubbleFloor.call(m,point),0);
});

test('resting fragments lose support when a surface moves, without a manual wake call',()=>{
 const scene=new T.Scene(),floor=new T.Mesh(new T.BoxGeometry(4,.2,4),new T.MeshStandardMaterial());floor.position.y=3.3;scene.add(floor);scene.updateMatrixWorld(true);const box=new T.Box3().setFromObject(floor);box.supportMesh=floor;const m={colliders:[box]};
 const pool=new DebrisPool(scene,new T.BoxGeometry(.2,.02,.2),new T.MeshStandardMaterial(),1,{groundHeight:(point,ceiling)=>VillaMap.prototype.rubbleFloor.call(m,point,ceiling)});
 pool.spawn(new T.Vector3(0,4,0),new T.Vector3(),new T.Matrix4(),new T.Vector3(),Infinity);
 for(let i=0;i<200;i++)pool.update(.016);assert.ok(pool.pieces[0].settled);assert.ok(Math.abs(pool.pieces[0].position.y-3.41)<.001);
 floor.visible=false;
 for(let i=0;i<250;i++)pool.update(.016);assert.ok(Math.abs(pool.pieces[0].position.y-.01)<.001);
});

test('thin sheet metal deforms more than thick steel without disappearing',()=>{
 const thin=new T.Mesh(new T.BoxGeometry(1,1,.008),new T.MeshStandardMaterial()),thick=new T.Mesh(new T.BoxGeometry(1,1,.2),new T.MeshStandardMaterial());
 for(const [mesh,depth] of [[thin,.008],[thick,.2]]){assert.ok(dentMetal(mesh,new T.Vector3(0,0,depth/2),new T.Vector3(0,0,1),125,depth));assert.ok(mesh.visible);}
 const dent=(m,z)=>{let amount=0;const a=m.geometry.attributes.position;for(let i=0;i<a.count;i++)if(Math.abs(a.getX(i))<.1&&Math.abs(a.getY(i))<.1&&a.getZ(i)>0)amount=Math.max(amount,z-a.getZ(i));return amount;};
 assert.ok(dent(thin,.004)>dent(thick,.1));
});

test('nearby wooden props use the same blast material rules and release collision',async()=>{
 const {SurfaceDamage}=await import('../src/world/SurfaceDamage.js');
 const scene=new T.Scene(),m={scene,panels:[],colliders:[],blastScars:{add(){}},blastDust:{spawn(){}}};
 const wood=new T.Mesh(new T.BoxGeometry(.5,.5,.05),new T.MeshStandardMaterial());wood.position.set(0,1,0);scene.add(wood);scene.updateMatrixWorld(true);
 const collider=new T.Box3().setFromObject(wood);collider.supportMesh=wood;wood.userData={isShootable:true,surface:'wood',physicalMaterial:'wood',woodHealth:90,collider};m.colliders.push(collider);m.surfaceDamage=new SurfaceDamage(scene,m.colliders);
 VillaMap.prototype.damageExplosion.call(m,new T.Vector3(0,1,.35),6);
 assert.equal(wood.visible,false);assert.equal(m.colliders.length,0);
});

test('energy transport composes by travelled distance and grazing impacts stop in ordinary timber',async()=>{
 const {transportEnergy}=await import('../src/world/PhysicalMaterials.js');
 const e=projectileEnergy('primary',100),first=penetrationResponse('wood',.065,e);
 const atNext=transportEnergy('primary',first.remainingEnergy,2),second=penetrationResponse('wood',.065,atNext);
 assert.ok(second.penetrates);assert.ok(second.remainingEnergy<first.remainingEnergy);
 assert.ok(Math.abs(transportEnergy('primary',transportEnergy('primary',4500,40),60)-e)<1e-9);
 assert.equal(penetrationResponse('wood',.065,4500,.08).penetrates,false);
});
