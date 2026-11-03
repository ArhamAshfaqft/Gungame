import test from 'node:test';import assert from 'node:assert/strict';import * as T from 'three';
import {VillaMap} from '../src/world/VillaMap.js';import {SurfaceDamage} from '../src/world/SurfaceDamage.js';import {soundEngine} from '../src/audio/SoundEngine.js';
const V=(x=0,y=0,z=0)=>new T.Vector3(x,y,z);
for(const k of Object.getOwnPropertyNames(Object.getPrototypeOf(soundEngine)))if(k.startsWith('play'))soundEngine[k]=()=>{};
const make=()=>{const m=new VillaMap(new T.Scene());m.surfaceDamage=new SurfaceDamage(m.scene,m.colliders);return m;};
function tick(m,frames){for(let i=0;i<frames;i++){m.update(1/60,V(0,8.45,0));m.surfaceDamage.update(1/60);}}
function hit(m,mesh,local,slot='pistol',normal=V(0,0,1)){
 mesh.updateWorldMatrix(true,false);const point=mesh.localToWorld(local.clone()),direction=normal.clone().transformDirection(mesh.matrixWorld).negate(),p=mesh.userData.breakable,impact={object:mesh,point,face:{normal},distance:2};
 m.surfaceDamage.hit(impact,slot,direction,{panel:!!p,distance:2,damage:slot==='primary'?125:34});
 if(p)p.takeBulletHit(impact,slot==='primary'?125:34,direction,{slot,distance:2,energy:slot==='primary'?4500:500});return{point,direction};
}
test('one pistol hit into a bookcase back preserves its intact mounts and every supported book',()=>{
 const m=make(),e=m.environment,r=e.records.find(r=>r.parts.some(p=>p.name==='Bookshelf back')&&r.object.position.y===6.8&&r.object.position.x===-13.4),books=e.records.filter(b=>b.loose&&b.object.parent===r.object),positions=books.map(b=>b.object.getWorldPosition(V()));
 hit(m,r.parts[0],V(0,.12,.009));tick(m,900);assert.equal(r.body,null);assert.equal(books.length,125);
 for(let i=0;i<books.length;i++){assert.equal(books[i].body,null);assert.ok(positions[i].distanceTo(books[i].object.getWorldPosition(V()))<1e-8);}
});
test('shot and breached door stays mounted, opens normally, and does not silently fall off its intact frame',()=>{
 const m=make(),p=m.panels.find(p=>p.isDoor&&p.group.position.y===6.8),record=m.environment.byObject.get(p.group);assert.ok(record);
 hit(m,p.mesh,V(p.width*.5,1.3,.033),'primary');hit(m,p.mesh,V(p.width*.5+.2,1.3,.033),'primary');tick(m,240);
 assert.equal(record.body,null);assert.ok(!p.detachedEnvironment);assert.ok(p.punctures>0||p.broken.size>0);p.toggle(p.group.position.clone().add(V(0,0,1)));tick(m,90);assert.ok(p.openAmount>.99);
});
test('a shot-off chair support starts its physics response immediately before the next support scan',()=>{
 const m=make(),f=m.floorFixtures.find(f=>f.object.userData.supportParts),legs=f.object.userData.supportParts,r=m.environment.byObject.get(f.object);assert.ok(r);
 for(const leg of legs.filter(o=>o.position.x>0))hit(m,leg,V(0,0,.021),'primary');
 assert.ok(r.body,'the structural hit cannot wait for a cosmetic decal or a room-wide scan');tick(m,300);
 assert.ok(Math.abs(f.object.quaternion.z)+Math.abs(f.object.quaternion.x)>.1,'the surviving footprint cannot keep an unsupported chair upright');
});
test('sniper chips wooden finish over concrete; the concrete remains and further unrelated updates never repair the finish',()=>{
 const m=make(),mesh=m.floorSurfaces.find(mesh=>mesh.userData.construction==='finish'&&mesh.position.y>6),box=mesh.geometry.boundingBox,local=box.getCenter(V());local.y=box.max.y;
 hit(m,mesh,local,'primary',V(0,1,0));assert.ok(mesh.userData.surfaceCuts>0);const source=mesh.geometry;
 const point=mesh.localToWorld(local.clone()),ray=new T.Raycaster(point.clone().add(V(0,.15,0)),V(0,-1,0),0,.3);ray.layers.enableAll();assert.equal(ray.intersectObject(mesh).length,0,'the wood skin has a real missing section');
 const targets=[];m.scene.traverseVisible(o=>{if(o.userData.isShootable)targets.push(o);});const next=ray.intersectObjects(targets,false)[0];assert.ok(next);assert.equal(next.object.userData.physicalMaterial,'concrete');tick(m,300);assert.equal(mesh.geometry,source);assert.equal(ray.intersectObject(mesh).length,0);
});
test('a damaged book uses one simple rigid-body shape and sleeps after falling without losing its visual cut',()=>{
 const m=make(),r=m.environment.records.find(r=>r.loose&&r.object.name==='Bound book'),mesh=r.object;hit(m,mesh,V(0,0,.115),'pistol');const geometry=mesh.geometry;
 assert.ok(r.body);assert.equal(r.body.shapes.length,1);tick(m,900);assert.equal(r.body.sleepState,2);assert.equal(mesh.geometry,geometry);assert.ok(mesh.visible&&mesh.userData.motionBatch);
 m.environment.hit(mesh,mesh.getWorldPosition(V()),V(1,0,0),34);assert.equal(r.body.sleepState,0);
});

test('a whole grenade-disturbed study pile settles and keeps its visible books with no delayed activation',()=>{
 const m=make(),e=m.environment,original=Math.random;let seed=12345;Math.random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
 try{m.damageExplosionSync(V(-12.75,7.45,-6),6);tick(m,3600);}finally{Math.random=original;}
 const books=e.records.filter(r=>r.body&&r.object.name==='Bound book');assert.ok(books.length>50);assert.equal(e.pending.size,0);
 assert.ok(books.every(r=>r.body.shapes.length===1));assert.ok(books.every(r=>r.body.sleepState===2),JSON.stringify(books.filter(r=>r.body.sleepState!==2).map(r=>({speed:r.body.velocity.length(),spin:r.body.angularVelocity.length(),quiet:r.quietProbe?.time,rest:r.restProbe?.time}))));assert.ok(books.every(r=>r.object.visible));
});
