import test from 'node:test';import assert from 'node:assert/strict';import * as T from 'three';
import {VillaMap} from '../src/world/VillaMap.js';import {SurfaceDamage} from '../src/world/SurfaceDamage.js';import {materialPart} from '../src/world/MaterialProps.js';import {supportCandidates,invalidateSupport} from '../src/world/SupportIndex.js';import {DebrisPool} from '../src/world/DebrisPool.js';import {soundEngine} from '../src/audio/SoundEngine.js';import {settleFloorFixtures} from '../src/world/FloorFixtures.js';
for(const k of ['playWoodHit','playDoorBreak','playGlassBreak','playImpact'])soundEngine[k]=()=>{};
function fixture(kind,w=1,h=1,d=.06){const scene=new T.Scene(),mesh=materialPart(new T.Mesh(new T.BoxGeometry(w,h,d),new T.MeshStandardMaterial()),kind),collider=new T.Box3().setFromObject(mesh),colliders=[collider];collider.supportMesh=mesh;mesh.userData.collider=collider;scene.add(mesh);return{scene,mesh,colliders,fx:new SurfaceDamage(scene,colliders)};}
function shoot(f,slot='primary',point=new T.Vector3(0,0,.03),normal=new T.Vector3(0,0,1),options={}){f.scene.updateMatrixWorld(true);return f.fx.hit({object:f.mesh,point,face:{normal},distance:3},slot,normal.clone().negate(),options);}

test('a close sniper cuts a local gap in thin timber while the anchored ends survive',()=>{
 const f=fixture('wood',.055,2.6,.07);shoot(f,'primary',new T.Vector3(0,0,.035));assert.equal(f.mesh.userData.jointCuts,1);assert.ok(f.mesh.visible);
 const ray=new T.Raycaster(new T.Vector3(0,0,1),new T.Vector3(0,0,-1));assert.equal(ray.intersectObject(f.mesh).length,0);
 assert.ok(f.colliders.length>=2);assert.ok(f.colliders.every(b=>!b.containsPoint(new T.Vector3(0,0,0))));
 const weak=fixture('wood',.055,2.6,.07);shoot(weak,'pistol',new T.Vector3(0,0,.035));assert.equal(weak.mesh.userData.jointCuts,undefined);shoot(weak,'pistol',new T.Vector3(0,0,.035));shoot(weak,'pistol',new T.Vector3(0,0,.035));assert.equal(weak.mesh.userData.jointCuts,1);
 const twice=fixture('wood',.055,2.6,.07);shoot(twice,'primary',new T.Vector3(0,-.5,.035));shoot(twice,'primary',new T.Vector3(0,.5,.035));assert.equal(ray.intersectObject(twice.mesh).length,0,'the disconnected middle cannot remain floating after two cuts');
});
test('floor joists lose a local section in one close sniper hit without changing floor skins',()=>{
 const map=new VillaMap(new T.Scene()),floor=map.timberFloors[0],beam=floor.joists[0],mesh=beam.mesh,fx=new SurfaceDamage(map.scene,map.colliders),point=mesh.position.clone().add(new T.Vector3(0,.08,0));
 fx.hit({object:mesh,point,face:{normal:new T.Vector3(0,1,0)},distance:3},'primary',new T.Vector3(0,-1,0));
 assert.equal(mesh.visible,false);const ends=floor.joists.filter(b=>b!==beam&&b.row===beam.row&&b.a>=beam.a&&b.b<=beam.b&&b.mesh.visible);assert.equal(ends.length,2);assert.ok(ends.reduce((n,b)=>n+b.b-b.a,0)<beam.b-beam.a-.2);assert.equal(floor.boards.broken.size,0);assert.equal(floor.backing.broken.size,0);assert.equal(floor.ceiling.broken.size,0);
});
test('glass bottle body, neck and label shatter together; neighbouring glass stays intact',()=>{
 const f=fixture('glass',.1,.3,.1),neck=materialPart(new T.Mesh(f.mesh.geometry.clone(),f.mesh.material),'glass'),other=fixture('glass');f.scene.add(neck);f.mesh.userData.damageParts=[f.mesh,neck];neck.userData.damageRoot=f.mesh;shoot(f,'pistol',new T.Vector3(0,0,.05));assert.ok(!f.mesh.visible&&!neck.visible);assert.ok(other.mesh.visible);assert.equal(f.colliders.length,0);assert.ok(f.fx.pools.glass.pieces.length>0);
});
test('books retain paper on light hits, emit pages and eventually shred; upholstery emits fabric and filling',()=>{
 const book=fixture('paper',.12,.28,.2);shoot(book,'pistol',new T.Vector3(0,0,.1));assert.ok(book.mesh.visible);assert.ok(book.fx.pools.paper.pieces.length>0);assert.equal(book.fx.pools.concrete.pieces.length,0);for(let i=0;i<4;i++)shoot(book,'pistol',new T.Vector3(0,0,.1));assert.equal(book.mesh.visible,false);
 const pillow=fixture('cloth',.8,.2,.5);shoot(pillow,'pistol',new T.Vector3(0,0,.25));assert.ok(pillow.mesh.visible);assert.ok(pillow.fx.pools.cloth.pieces.length>0&&pillow.fx.pools.stuffing.pieces.length>0);assert.equal(pillow.fx.pools.concrete.pieces.length,0);assert.equal(pillow.fx.marks.length,1);
 for(let i=0;i<100;i++)shoot(pillow,'pistol',new T.Vector3(0,0,.25));assert.ok(pillow.fx.pools.cloth.pieces.length<=96&&pillow.fx.pools.stuffing.pieces.length<=96);
});
test('marble edges chip under a heavy hit, grouped impacts fracture a thin centre; metal never breaks',()=>{
 const stone=fixture('stone',2,.12,1);shoot(stone,'primary',new T.Vector3(.98,.06,.45),new T.Vector3(0,1,0));assert.equal(stone.mesh.userData.surfaceCuts,1);assert.ok(stone.fx.pools.concrete.pieces.length>0);
 const mid=fixture('stone',2,.12,1);shoot(mid,'primary',new T.Vector3(0,.06,0),new T.Vector3(0,1,0));assert.equal(mid.mesh.userData.surfaceCuts,undefined);shoot(mid,'primary',new T.Vector3(0,.06,0),new T.Vector3(0,1,0));assert.equal(mid.mesh.userData.surfaceCuts,1);
 const metal=fixture('metal',1,1,.02);for(let i=0;i<20;i++)shoot(metal,'primary',new T.Vector3(0,0,.01));assert.ok(metal.mesh.visible);assert.equal(metal.colliders.length,1);assert.equal(metal.mesh.userData.surfaceCuts,undefined);
});
test('damageable scenery remains batched, individually shootable and correctly classified',()=>{
 const m=new VillaMap(new T.Scene()),parts=[];m.scene.traverse(o=>{if(o.userData.damageablePart)parts.push(o);});
 assert.ok(parts.filter(o=>o.userData.physicalMaterial==='paper').length>100);assert.ok(parts.filter(o=>o.name==='Glass bottle').length>40);assert.ok(parts.some(o=>o.userData.physicalMaterial==='cloth'&&o.userData.collider));assert.ok(parts.some(o=>o.userData.physicalMaterial==='stone'));assert.ok(parts.filter(o=>o.userData.renderBatch).length>parts.length*.9);
 const slat=parts.find(o=>o.userData.physicalMaterial==='wood'&&o.geometry.parameters?.height===2.6&&o.geometry.parameters?.width===.055);assert.ok(slat?.userData.renderBatch);assert.equal(slat.userData.isShootable,true);
});
test('support buckets invalidate after movement; settled rubble sleeps without repeated support raycasts',()=>{
 const box=new T.Box3(new T.Vector3(0,0,0),new T.Vector3(1,1,1)),map={colliders:[box]};assert.ok(supportCandidates(map,new T.Vector3(.5,2,.5)).includes(box));box.translate(new T.Vector3(6,0,0));invalidateSupport(map.colliders);assert.equal(supportCandidates(map,new T.Vector3(.5,2,.5)).length,0);assert.ok(supportCandidates(map,new T.Vector3(6.5,2,.5)).includes(box));
 let revision=0,height=0,calls=0;const p=new DebrisPool(new T.Scene(),new T.BoxGeometry(.1,.02,.1),new T.MeshBasicMaterial(),64,{groundHeight:()=>{calls++;return height;},supportRevision:()=>revision});
 for(let i=0;i<64;i++)p.spawn(new T.Vector3(i,1,0),new T.Vector3(),new T.Matrix4(),new T.Vector3(),Infinity);for(let i=0;i<300;i++)p.update(.016);calls=0;for(let i=0;i<180;i++)p.update(.016);assert.equal(calls,0);height=-1;revision++;p.update(.016);assert.ok(calls<=96);for(let i=0;i<300;i++)p.update(.016);assert.ok(p.pieces.every(x=>x.position.y<-.9));
});
test('wooden chair legs can fail, tipping the rigid chair and moving its collision with it',()=>{
 const m=new VillaMap(new T.Scene()),f=m.floorFixtures.find(f=>f.object.userData.supportParts),before=f.object.position.y;for(const leg of f.object.userData.supportParts.slice(0,3))leg.visible=false;
 for(let i=0;i<240;i++)settleFloorFixtures(m,1/60);assert.ok(Math.abs(f.object.quaternion.w)<.9);assert.ok(f.meshes[0].userData.collider.min.y<before+.1);assert.ok(m.environment.byObject.get(f.object).body);
});
test('temporary particles sample support on a bounded cadence and release stale cached support',()=>{
 let revision=0,height=0,calls=0;
 const p=new DebrisPool(new T.Scene(),new T.BoxGeometry(.02,.02,.02),new T.MeshBasicMaterial(),2,{groundHeight:()=>{calls++;return height;},supportRevision:()=>revision,supportInterval:.12});
 p.spawn(new T.Vector3(0,10,0),new T.Vector3(),new T.Matrix4(),new T.Vector3(),5);
 for(let i=0;i<24;i++){revision++;p.update(1/60);}assert.ok(calls<=5,'unrelated moving supports must not force every airborne particle to raycast each frame');
 p.clear();height=3.4;p.spawn(new T.Vector3(0,3.41,0),new T.Vector3(),new T.Matrix4(),new T.Vector3(),5);for(let i=0;i<15;i++)p.update(1/60);assert.ok(p.pieces[0].settled);
 height=0;revision++;for(let i=0;i<120;i++)p.update(1/60);assert.ok(p.pieces[0].position.y<.05,'cached height cannot suspend particles after the floor disappears');
});
