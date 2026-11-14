import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {VillaMap} from '../src/world/VillaMap.js';
import {alignedOpenings,partitionJunctions} from '../src/world/WallLayout.js';

test('window layout leaves solid piers at partition junctions and ignores other floors',()=>{
 const wall={axis:'z',coord:11,from:-14,to:14,base:6.8,openings:[{at:8,width:7,sill:.65,height:2.2,kind:'glass'}]};
 const partition={axis:'x',coord:10.5,from:-11,to:11,base:6.8};
 const result=alignedOpenings(wall,[wall,partition,{...partition,coord:7,base:3.4}]);
 assert.equal(result.length,2);assert.ok(result.every(o=>o.at+o.width/2<=10.2800001||o.at-o.width/2>=10.7199999));
 assert.ok(result.some(o=>Math.abs(o.at-7)<o.width/2),'other-floor walls do not cut this pane');
});

test('Collection entrance sits completely over annex floor and clear of its end wall',()=>{
 const map=new VillaMap(new T.Scene());
 for(const base of [0,3.4,6.8]){
  const wall=map.wallSpecs.find(w=>w.axis==='x'&&w.coord===14&&w.base===base);
  const opening=wall.openings.find(o=>o.name==='Gallery connection');
  assert.ok(opening.at-opening.width/2>=-9.85,'door does not extend beyond annex floor at z=-10');
  assert.ok(opening.at+opening.width/2<2,'door stays inside annex boundary');
 }
 for(const x of [13.7,14,14.3]){
  const point=new T.Vector3(x,3.4,-8.6);
  assert.ok(map.colliders.some(b=>!b.ramp&&b.min.x<=x&&b.max.x>=x&&b.min.z<=point.z&&b.max.z>=point.z&&Math.abs(b.max.y-3.4)<.04),'continuous support across entrance');
  point.y=4.4;
  assert.ok(!map.colliders.some(b=>!b.ramp&&b.containsPoint(point)),'no end-wall pier cuts through doorway');
 }
});

test('all villa glazing and artwork clear perpendicular partitions',()=>{
 const map=new VillaMap(new T.Scene());
 for(const wall of map.wallSpecs)for(const at of partitionJunctions(wall,map.wallSpecs))for(const o of wall.openings){
  if(o.kind!=='glass')continue;
  assert.ok(at<=o.at-o.width/2-.2+1e-7||at>=o.at+o.width/2+.2-1e-7,`glass at ${wall.axis}=${wall.coord}, floor ${wall.base}, split by ${at}`);
 }
 for(const art of map.artMounts)for(const at of partitionJunctions(art.wall,map.wallSpecs))
  assert.ok(Math.abs(art.x-at)>art.w/2+.25,'artwork frame clears room corners');
 const kitchen=map.wallSpecs.find(w=>w.axis==='z'&&w.coord===-11&&w.base===3.4);
 const window=kitchen.openings.find(o=>o.kind==='glass'&&o.width>=3.7&&o.at>2.7&&o.at<7);
 assert.ok(window,'countertop retains its broad window');
 assert.ok(window.sill<=1.08&&window.sill+window.height>=2.79,'glazing extends behind upper cabinets');
 const rails=[];map.scene.traverse(o=>{if(o.name==='Kitchen cabinet suspension rail')rails.push(o);});
 assert.equal(rails.length,2);
 const cabinets=map.environment.records.filter(r=>Math.abs(r.object.position.y-5.2)<.001&&r.object.position.z===-10.5);
 assert.equal(cabinets.length,3);
 for(const cabinet of cabinets)assert.ok(cabinet.supports.every(c=>rails.includes(c.mesh)),'cabinets hang from rails, never glass');

});


test('upstairs guest window and surround end before the service-passage partition',()=>{
 class InspectedVilla extends VillaMap{finishArchitecture(){super.finishArchitecture();this.surroundSources=[];this.scene.traverse(o=>{if(o.name==='Front window surround')this.surroundSources.push(o);});}}
 const map=new InspectedVilla(new T.Scene()),wall=map.wallSpecs.find(w=>w.axis==='z'&&w.coord===11&&w.base===6.8);
 const glazing=wall.openings.filter(o=>o.kind==='glass'&&o.at>0);
 assert.equal(glazing.length,1,'no leftover pane on the other side of the guest-room wall');
 const pane=glazing[0];assert.ok(pane.width>5.5,'guest room keeps a broad window');assert.ok(pane.at+pane.width/2<10.28,'opening clears partition');
 const surrounds=map.surroundSources.filter(o=>o.name==='Front window surround'&&o.userData.windowSpan?.base===6.8&&o.userData.windowSpan.from>0);
 assert.equal(surrounds.length,4);
 for(const mesh of surrounds){const bounds=new T.Box3().setFromObject(mesh);assert.ok(bounds.max.x<10.4,'surround stays on guest-room side of partition');assert.ok(bounds.min.z>=10.89,'surround stays outside the interior wall face, not in the room');}
});
