import {Box,Vec3} from 'cannon-es';

// Exact support-function projection of an oriented box. Cannon's generic hull
// path visits all eight corners for every SAT axis. The same extrema are the
// centre projection +/- the sum of the three projected half-extents.
const projections=new WeakMap();
const X=new Vec3(1,0,0),Y=new Vec3(0,1,0),Z=new Vec3(0,0,1);
function projection(hull,axis,p,q){
 let state=projections.get(hull);if(!state){state={x:new Vec3(),y:new Vec3(),z:new Vec3()};projections.set(hull,state);}
 if(state.qx!==q.x||state.qy!==q.y||state.qz!==q.z||state.qw!==q.w){q.vmult(X,state.x);q.vmult(Y,state.y);q.vmult(Z,state.z);state.qx=q.x;state.qy=q.y;state.qz=q.z;state.qw=q.w;}
 const e=hull.physicsHalfExtents,radius=Math.abs(axis.dot(state.x))*e.x+Math.abs(axis.dot(state.y))*e.y+Math.abs(axis.dot(state.z))*e.z,center=axis.dot(p);state.min=center-radius;state.max=center+radius;return state;
}
export function physicsBox(halfExtents){
 const box=new Box(halfExtents),hull=box.convexPolyhedronRepresentation,original=hull.testSepAxis;hull.physicsHalfExtents=halfExtents;
 hull.testSepAxis=function(axis,other,pA,qA,pB,qB){
  if(!other.physicsHalfExtents||other===this)return original.call(this,axis,other,pA,qA,pB,qB);
  const a=projection(this,axis,pA,qA),b=projection(other,axis,pB,qB);if(a.max<b.min||b.max<a.min)return false;return Math.min(a.max-b.min,b.max-a.min);
 };return box;
}
