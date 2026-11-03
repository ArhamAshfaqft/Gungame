import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {operation,markOperation,packOperation,computeOperation,applyOperation,runOperation,packGeometry,transfers} from '../src/environment/GeometryJobs.js';
import {snapshotBlast,computeBlastPlan} from '../src/environment/BlastPlanning.js';
import {VillaMap} from '../src/world/VillaMap.js';
import {VillaPanel} from '../src/world/VillaPanel.js';
import {SurfaceDamage} from '../src/world/SurfaceDamage.js';
import {soundEngine} from '../src/audio/SoundEngine.js';
import {DestructionPipeline} from '../src/environment/DestructionPipeline.js';
import {DestructionWorkers} from '../src/environment/DestructionWorkers.js';
import {FrameWorkQueue} from '../src/environment/FrameWorkQueue.js';
for(const key of ['playWoodHit','playDoorBreak','playImpact','playGlassBreak'])soundEngine[key]=()=>{};
const makeMesh=(material='wood',w=1,h=1,d=.06)=>{const mesh=new T.Mesh(new T.BoxGeometry(w,h,d),new T.MeshStandardMaterial());mesh.userData={physicalMaterial:material,isShootable:true};mesh.position.set(1,2,3);mesh.rotation.set(.2,.6,-.1);mesh.updateMatrixWorld(true);return mesh;};
function sameGeometry(a,b){for(const key of ['position','normal','uv','color'])assert.deepEqual(a.attributes[key]?.array,b.attributes[key]?.array,key);assert.deepEqual(a.index?.array,b.index?.array);}

test('worker mesh cuts, penetration, rail severing and metal dents match synchronous geometry exactly',()=>{
 for(const [kind,material,w,h,d,args] of [
  ['chip','wood',1,1,.06,[new T.Vector3(0,0,.03),new T.Vector3(0,0,1),.18,.1]],
  ['puncture','wood',1,1,.06,[new T.Vector3(0,0,.03),new T.Vector3(0,0,-1),.06,4500]],
  ['sever','wood',.06,2,.06,[new T.Vector3(0,0,.03)]],
  ['dent','metal',1,1,.01,[new T.Vector3(0,0,.005),new T.Vector3(0,0,1),125,.01]],
 ]){
  const a=makeMesh(material,w,h,d),b=makeMesh(material,w,h,d),direct=operation(kind,a,args),remote=operation(kind,b,args);
  const payload=packOperation(remote),source=Array.from(b.geometry.attributes.position.array),value=runOperation(direct),result=computeOperation(structuredClone(payload,{transfer:transfers(payload)}));
  assert.deepEqual(Array.from(b.geometry.attributes.position.array),source,'only copied buffers are transferred');
  assert.equal(applyOperation(remote,result),value,kind);sameGeometry(a.geometry,b.geometry);assert.equal(a.visible,b.visible);
  if(kind==='chip'||kind==='puncture'){
   const next=[new T.Vector3(.09,.04,.03),new T.Vector3(0,0,1),.13,.05];
   runOperation(operation('chip',a,next));const op=operation('chip',b,next);applyOperation(op,computeOperation(packOperation(op)));sameGeometry(a.geometry,b.geometry);
  }
 }
});

test('worker surface decals retain local placement, UVs, material ownership and cannot resurrect removed marks',()=>{
 const a=makeMesh(),b=makeMesh(),entry=mesh=>({mesh,decal:new T.Mesh(new T.BufferGeometry(),new T.MeshStandardMaterial()),local:new T.Vector3(0,0,.03),rotation:new T.Quaternion(),size:new T.Vector3(.15,.15,.04)}),left=entry(a),right=entry(b);
 const op=markOperation(right),value=runOperation(markOperation(left)),result=computeOperation(packOperation(op));assert.equal(applyOperation(op,result),value);sameGeometry(left.decal.geometry,right.decal.geometry);assert.equal(right.decal.parent,b);
 right.removed=true;right.decal.removeFromParent();assert.equal(applyOperation(op,result),false);assert.equal(right.decal.parent,null);
});

function fixture(){
 const scene=new T.Scene(),map={scene,panels:[],colliders:[],materials:Object.fromEntries(['wood','woodPanel','softWall','metal','glass'].map(n=>[n,new T.MeshStandardMaterial({side:T.DoubleSide})])),emitPanelDebris(){},blastScars:{add(){}},blastDust:{spawn(){}}};
 map.surfaceDamage=new SurfaceDamage(scene,map.colliders);return map;
}
test('worker blast planning preserves pre-blast cover and the original cumulative damage results',()=>{
 const make=()=>{const m=fixture(),front=new VillaPanel(m,{x:0,y:0,z:0,width:2,height:2.8,kind:'plaster'}),back=new VillaPanel(m,{x:0,y:0,z:-.3,width:2,height:2.8,kind:'plaster'});return{m,front,back};},a=make(),b=make(),position=new T.Vector3(1,1.4,.2);
 VillaMap.prototype.damageExplosionSync.call(a.m,position,7);
 const {payload,lookup}=snapshotBlast(b.m,position,7),plan=computeBlastPlan(structuredClone(payload,{transfer:transfers(payload)}));
 for(const {id,exposed} of plan.panels){const p=lookup.get(id).userData.breakable,set=new Set(exposed);if(set.size)p.applyBlast(position,330,7,(_,id)=>set.has(id));}
 assert.deepEqual([...b.front.broken],[...a.front.broken]);assert.deepEqual([...b.front.health],[...a.front.health]);assert.equal(b.back.health.size,0);assert.ok(b.front.broken.size>0);
});

test('blast snapshots preserve source face groups, geometry ranges and contain no live scene references',()=>{
 const m=fixture(),mesh=makeMesh();mesh.userData.damageablePart=true;m.scene.add(mesh);const array=mesh.geometry.index.array.slice();mesh.geometry.setDrawRange(3,mesh.geometry.index.count-3);
 const {payload}=snapshotBlast(m,new T.Vector3(1,2,3.5),6),copy=structuredClone(payload,{transfer:transfers(payload)});assert.equal(copy.objects.length,1);assert.deepEqual(mesh.geometry.index.array,array);assert.equal(copy.objects[0].geometry.drawRange.start,3);assert.equal(copy.objects[0].geometry.groups.length,6);assert.ok(packGeometry(mesh.geometry).attributes.uv);
});

test('worker visibility matches every original prop hit and panel exposure in the furnished study, kitchen and floor',()=>{
 const map=new VillaMap(new T.Scene()),position=new T.Vector3();let props=[],panels=[];
 map.surfaceDamage={hit(hit,_slot,direction,{damage}){props.push({id:hit.object.id,strength:damage,point:hit.object.worldToLocal(hit.point.clone()),normal:hit.face.normal,direction});}};
 for(const p of map.panels)p.applyBlast=(_position,_power,_radius,visible)=>panels.push({id:p.mesh.id,exposed:p.pieces.filter(c=>!p.broken.has(c.id)&&visible(null,c.id)).map(c=>c.id)});
 for(const spot of [[-12.75,7.45,-6],[6.5,3.7,-4.1],[-8,6.92,6.7],[6.5,7.12,-8],[6.5,7.12,-6.9],[6.5,7.12,-4.5]]){
  position.fromArray(spot);props=[];panels=[];VillaMap.prototype.damageExplosionSync.call(map,position,6);
  const plan=computeBlastPlan(snapshotBlast(map,position,6).payload),ids=x=>x.map(v=>v.id).sort((a,b)=>a-b);
  assert.deepEqual(ids(plan.props),ids(props),`prop exposure ${spot}`);
  assert.deepEqual(plan.panels.filter(p=>p.exposed.length).map(({id,exposed})=>({id,exposed})),panels,`panel exposure ${spot}`);
  for(const p of plan.props){const original=props.find(h=>h.id===p.id);assert.ok(Math.abs(p.strength-original.strength)<1e-8);assert.ok(original.point.distanceTo(new T.Vector3().fromArray(p.localPoint))<1e-7);assert.ok(original.normal.distanceTo(new T.Vector3().fromArray(p.normal))<1e-7);}
 }
});

test('floor-overlay worker projection keeps only the same upward carpet triangles after a breach',()=>{
 const a=makeMesh('wood',2,2,.06),b=makeMesh('wood',2,2,.06);a.rotation.set(-Math.PI/2,0,0);b.rotation.copy(a.rotation);a.updateMatrixWorld(true);b.updateMatrixWorld(true);
 const entry=mesh=>({mesh,floorOverlay:true,decal:new T.Mesh(new T.BufferGeometry(),new T.MeshStandardMaterial()),local:new T.Vector3(0,0,.03),rotation:new T.Quaternion(),size:new T.Vector3(2,2,.2)}),left=entry(a),right=entry(b);
 for(const mesh of [a,b])runOperation(operation('chip',mesh,[new T.Vector3(0,0,.03),new T.Vector3(0,0,1),.3,.15]));
 const op=markOperation(right);assert.equal(runOperation(markOperation(left)),applyOperation(op,computeOperation(packOperation(op))));sameGeometry(left.decal.geometry,right.decal.geometry);
});

test('a bullet flush completes pending blast cuts before a newer hit, ignoring late worker responses',()=>{
 const mesh=makeMesh(),pending=[],pipeline=Object.create(DestructionPipeline.prototype),tasks=[];
 Object.assign(pipeline,{map:{colliders:[]},pool:{run(_kind,data){return new Promise(resolve=>pending.push(()=>resolve(computeOperation(data))));}},frames:{tasks},jobs:new Map(),waiters:[],plans:0,stats:{operations:0,fallbacks:0,errors:[]},task:fn=>tasks.push(fn)});
 const first=new T.Vector3(0,0,.03),second=new T.Vector3(.3,0,.03),normal=new T.Vector3(0,0,1);
 pipeline.queueImpact(mesh,function*(){yield operation('chip',mesh,[first,normal,.12,.05]);});
 assert.equal(mesh.userData.surfaceCuts,undefined);pipeline.flush(mesh);assert.equal(mesh.userData.surfaceCuts,1);
 runOperation(operation('chip',mesh,[second,normal,.12,.05]));const current=mesh.geometry;assert.equal(mesh.userData.surfaceCuts,2);
 return Promise.resolve().then(()=>{pending.forEach(resolve=>resolve());return Promise.resolve();}).then(()=>{tasks.splice(0).forEach(fn=>fn());assert.equal(mesh.geometry,current);assert.equal(mesh.userData.surfaceCuts,2);assert.equal(pipeline.jobs.size,0);});
});

test('flushing a queued rail fracture updates the real collision list',()=>{
 const mesh=makeMesh('wood',.06,2,.06),original=new T.Box3().setFromObject(mesh),colliders=[original];mesh.userData.collider=original;
 const pipeline=Object.create(DestructionPipeline.prototype),job={mesh,done:false,factory:function*(){yield operation('sever',mesh,[new T.Vector3(0,0,.03)]);}};
 Object.assign(pipeline,{map:{colliders},jobs:new Map([[mesh,[job]]]),frames:{tasks:[]},waiters:[],plans:0});pipeline.flush(mesh);
 assert.ok(!colliders.includes(original));assert.equal(colliders.length,2);assert.ok(colliders.every(box=>box.supportMesh===mesh));
});

test('worker batches retain every result, isolate failed cuts, prioritize blast plans and cancel cleanly',async()=>{
 const workers=[],pool=new DestructionWorkers(2,{createWorker(){const worker={messages:[],postMessage(message){this.messages.push(message);},terminate(){this.terminated=true;}};workers.push(worker);return worker;}}),pending=[];
 for(let i=0;i<40;i++)pending.push(pool.run('geometry',{i}));pending.push(pool.run('plan',{i:40}));const settled=Promise.allSettled(pending);
 workers.forEach(worker=>worker.onmessage({data:{ready:true,protocol:2}}));assert.equal(workers[0].messages[0].jobs[0].kind,'plan');assert.equal(workers[1].messages[0].jobs.length,16);
 while(workers.some(w=>w.messages.length)){for(const worker of workers){const message=worker.messages.shift();if(!message)continue;worker.onmessage({data:{results:message.jobs.map(job=>({id:job.id,...(job.payload.i===7?{error:'Failed cut'}:{result:job.payload.i})}))}});}}
 const results=await settled;assert.equal(results.filter(v=>v.status==='fulfilled').length,40);assert.match(results[7].reason.message,/Failed cut/);assert.equal(results[40].value,40);
 const cancelled=pool.run('geometry',{i:50});pool.dispose();await assert.rejects(cancelled,/cancelled/);assert.ok(workers.every(w=>w.terminated));
});

test('an old cached worker protocol is rejected instead of accepting incompatible results',async()=>{
 const worker={postMessage(){throw Error('Old worker must not receive new jobs');},terminate(){this.terminated=true;}},pool=new DestructionWorkers(1,{createWorker:()=>worker});
 const rejected=assert.rejects(pool.run('plan',{}),/unavailable/);worker.onmessage({data:{ready:true,protocol:1}});await rejected;assert.ok(worker.terminated);pool.dispose();
});

test('frame budgeting retains every task in order without scheduling empty follow-up frames',()=>{
 const original=globalThis.requestAnimationFrame,callbacks=[],seen=[];globalThis.requestAnimationFrame=fn=>callbacks.push(fn);
 try{const queue=new FrameWorkQueue(0);queue.push(()=>{seen.push(1);queue.push(()=>seen.push(3));});queue.push(()=>seen.push(2));
  while(callbacks.length)callbacks.shift()();assert.deepEqual(seen,[1,2,3]);assert.equal(queue.stats.frames,3);assert.equal(queue.tasks.length,0);
  queue.push(()=>seen.push(4));queue.dispose();callbacks.shift()();assert.deepEqual(seen,[1,2,3]);
 }finally{globalThis.requestAnimationFrame=original;}
});
