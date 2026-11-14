import {MotionBatch} from '../src/environment/MotionBatch.js';
import {operation,packOperation,computeOperation,applyOperation} from '../src/environment/GeometryJobs.js';
import {punctureProp} from '../src/world/SurfaceGeometry.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {batchStaticParts} from '../src/environment/PartBatching.js';
import {VillaMap} from '../src/world/VillaMap.js';

test('shared prop batches retain coloured model surfaces and independent damage',()=>{
 const scene=new T.Scene(),material=new T.MeshStandardMaterial({vertexColors:true}),parts=[];
 for(let i=0;i<3;i++){const g=new T.BoxGeometry(.1,.2,.1),colors=new Float32Array(g.attributes.position.count*3);for(let j=0;j<colors.length;j+=3)colors[j+i]=1;g.setAttribute('color',new T.BufferAttribute(colors,3));const mesh=new T.Mesh(g,material);mesh.position.x=i;mesh.userData.damageablePart=true;scene.add(mesh);parts.push(mesh);}
 const map={scene};batchStaticParts(map);assert.equal(map.propBatches.length,1);
 const colors=map.propBatches[0].mesh.geometry.attributes.color;assert.equal(colors.getX(0),1);assert.equal(colors.getY(24),1);assert.equal(colors.getZ(48),1);
 parts[1].userData.renderBatch.detach(parts[1]);assert.equal(parts[1].layers.mask,1);assert.equal(parts[1].geometry.attributes.color.getY(0),1);assert.ok(parts[0].userData.renderBatch);
});

test('detailed props retain material damage and cups have a genuinely open rim',()=>{
 const map=new VillaMap(new T.Scene()),objects=[];map.scene.traverse(o=>{if(o.isMesh)objects.push(o);});
 const cup=objects.find(o=>o.name==='Hollow ceramic cup');assert.ok(cup);assert.equal(cup.userData.physicalMaterial,'ceramic');assert.ok(cup.userData.looseItem);
 cup.updateWorldMatrix(true,false);const bounds=new T.Box3().setFromObject(cup),origin=bounds.getCenter(new T.Vector3());origin.y=bounds.max.y+.1;const ray=new T.Raycaster(origin,new T.Vector3(0,-1,0)),hits=[];cup.raycast(ray,hits);hits.sort((a,b)=>a.distance-b.distance);assert.ok(hits.length);assert.ok(hits[0].point.y<bounds.max.y-.06,'centre ray reaches the cup bottom, not a solid top cap');
 const books=objects.filter(o=>o.name==='Bound book');assert.ok(books.length>100);assert.ok(books.every(o=>o.userData.physicalMaterial==='paper'&&o.userData.looseItem));
 assert.ok(objects.some(o=>o.name==='Bedside lamp'));const details=objects.filter(o=>o.name==='Villa architectural details'&&o.material===map.materials.propModel);assert.ok(details.length);assert.ok(details.every(o=>o.geometry.attributes.color),'merged desktop models retain their keycap/casing colours');
 const cabinets=objects.filter(o=>o.name==='Detailed storage cabinet');assert.ok(cabinets.length);assert.ok(cabinets.every(o=>o.userData.physicalMaterial==='wood'));
 const cabinet=cabinets[0];cabinet.geometry.computeBoundingBox();const b=cabinet.geometry.boundingBox,point=b.getCenter(new T.Vector3());point.z=b.max.z;
 assert.equal(punctureProp(cabinet,point,new T.Vector3(0,0,-1),b.max.z-b.min.z,4500),true,'improved storage still accepts a real through hole');
 assert.ok(cabinet.geometry.attributes.color,'cut geometry keeps its wood tint');
 const top=objects.find(o=>o.name==='Villa table top');assert.equal(top.geometry.type,'BoxGeometry','bevels retain the existing fracture entry path');
 top.geometry.computeBoundingBox();const topBounds=top.geometry.boundingBox,hit=topBounds.getCenter(new T.Vector3());hit.y=topBounds.max.y;
 assert.equal(punctureProp(top,hit,new T.Vector3(0,-1,0),.12,4500),true);assert.equal(top.geometry.parameters.surfaceUvScale,1,'veneer scale survives a bullet hole');
 const p=top.geometry.attributes.position,n=top.geometry.attributes.normal,uv=top.geometry.attributes.uv;
 for(let i=0;i<p.count;i++)assert.ok(Math.abs(uv.getX(i)-(Math.abs(n.getX(i))>.5?p.getZ(i):p.getX(i)))<.000001);


});

test('book covers face outward and retain colour through worker damage and moving batches',()=>{
 const map=new VillaMap(new T.Scene());let book;map.scene.traverse(o=>{if(!book&&o.name==='Bound book')book=o;});
 const finish=book.geometry.parameters.bookFinish;assert.ok(finish);assert.notEqual(finish.coverColor,0xffffff);
 const check=()=>{const p=book.geometry.attributes.position,n=book.geometry.attributes.normal,c=book.geometry.attributes.color,ink=new T.Color(finish.coverColor);let spine=0;
  for(let i=0;i<p.count;i++)if(n.getZ(i)>.9&&p.getZ(i)>finish.depth*.4&&Math.abs(p.getY(i)/finish.height)<.2){assert.ok(Math.abs(c.getX(i)-ink.r)<.00001);assert.ok(Math.abs(c.getY(i)-ink.g)<.00001);spine++;}
  assert.ok(spine);assert.ok([...c.array].some(v=>v>.1));
 };
 // Sample inside a spine face rather than its decorative edge bands.
 const op=operation('chip',book,[new T.Vector3(0,0,finish.depth/2),new T.Vector3(0,0,1),.035,.02]);
 const result=computeOperation(packOperation(op));assert.equal(result.value,true);applyOperation(op,result);check();
 const batch=new MotionBatch(map.scene);batch.add(book);let group=[...batch.groups.values()][0],buffer=group.mesh.geometry.attributes.color;
 assert.ok(buffer,'moving renderer must upload colour attributes');
 const source=book.geometry.attributes.color;for(let i=0;i<source.count*3;i++)assert.equal(buffer.array[i],source.array[i]);
 const op2=operation('chip',book,[new T.Vector3(0,finish.height*.25,finish.depth/2),new T.Vector3(0,0,1),.03,.015]);
 applyOperation(op2,computeOperation(packOperation(op2)));batch.add(book);check();
 group=[...batch.groups.values()][0];assert.ok([...group.mesh.geometry.attributes.color.array].some(v=>v>.1));batch.dispose();
});
