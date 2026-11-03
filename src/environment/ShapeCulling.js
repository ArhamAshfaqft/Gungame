import {Vec3} from 'cannon-es';

// Cannon's compound narrowphase uses shape spheres before SAT. Spheres around a
// thin floor or long shelf overlap many distant fragments. Cached world AABBs
// reject those provably separate shape pairs without changing contact geometry.
export function installShapeCulling(narrowphase){
 const cache=new WeakMap(),original=narrowphase.convexConvex;
 const bounds=(shape,p,q)=>{let entry=cache.get(shape);if(!entry){entry={min:new Vec3(),max:new Vec3()};cache.set(shape,entry);}
  if(entry.x!==p.x||entry.y!==p.y||entry.z!==p.z||entry.qx!==q.x||entry.qy!==q.y||entry.qz!==q.z||entry.qw!==q.w){
   shape.calculateWorldAABB(p,q,entry.min,entry.max);entry.x=p.x;entry.y=p.y;entry.z=p.z;entry.qx=q.x;entry.qy=q.y;entry.qz=q.z;entry.qw=q.w;
  }return entry;
 };
 narrowphase.convexConvex=function(si,sj,xi,xj,qi,qj,bi,bj,rsi,rsj,justTest,faceListA,faceListB){
  const a=bounds(si,xi,qi),b=bounds(sj,xj,qj),epsilon=1e-7;
  if(a.max.x+epsilon<b.min.x||b.max.x+epsilon<a.min.x||a.max.y+epsilon<b.min.y||b.max.y+epsilon<a.min.y||a.max.z+epsilon<b.min.z||b.max.z+epsilon<a.min.z)return false;
  return original.call(this,si,sj,xi,xj,qi,qj,bi,bj,rsi,rsj,justTest,faceListA,faceListB);
 };
}
