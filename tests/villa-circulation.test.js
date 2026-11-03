import test from 'node:test';import assert from 'node:assert/strict';import * as T from 'three';import {VillaMap,VILLA_ROOMS} from '../src/world/VillaMap.js';
test('all twenty room regions connect to their floor circulation with player-sized clearance',()=>{
const m=new VillaMap(new T.Scene()),step=.3,rows=74,cols=164,out=[];
for(const y of [0,3.4,6.8]){
 const blocked=m.colliders.filter(b=>!b.ramp&&!b.villaPanel?.isDoor&&b.max.y>y+.12&&b.min.y<y+1.7),cells=new Map();
 for(let ix=0;ix<cols;ix++)for(let iz=0;iz<rows;iz++){
  const x=-24+ix*step,z=-11+iz*step;if(!(x>-14&&x<14||x>=14&&x<24&&z>-10&&z<2||y===3.4&&x>-23&&x<-14&&z>-10&&z<2))continue;
  if(z>-8&&z<-1&&(Math.abs(x)<1.3||x>10.45&&x<12.55))continue;
  if(blocked.some(b=>x>b.min.x-.46&&x<b.max.x+.46&&z>b.min.z-.46&&z<b.max.z+.46))continue;
  const key=ix*rows+iz;cells.set(key,{x,z});
 }
 const start=[...cells].sort((a,b)=>Math.hypot(a[1].x,a[1].z-7)-Math.hypot(b[1].x,b[1].z-7))[0][0],seen=new Set([start]),queue=[start];
 for(let i=0;i<queue.length;i++)for(const k of [queue[i]-rows,queue[i]+rows,queue[i]-1,queue[i]+1])if(cells.has(k)&&!seen.has(k)){seen.add(k);queue.push(k);}
 for(const [f,a,b,c,d,name] of VILLA_ROOMS)if(f===y){const candidates=[...cells].filter(([,p])=>p.x>=a&&p.x<=b&&p.z>=c&&p.z<=d),reachable=candidates.filter(([k])=>seen.has(k));out.push({y,name,free:candidates.length,reachable:reachable.length,pct:Math.round(reachable.length/Math.max(1,candidates.length)*100),bad:candidates.filter(([k])=>!seen.has(k)).slice(0,2).map(([,p])=>p)});}
}
assert.equal(out.length,20);for(const r of out){assert.ok(r.free>0,r.name);assert.ok(r.reachable/r.free>.95,`${r.name} is isolated or has unreachable pockets`);}
});
