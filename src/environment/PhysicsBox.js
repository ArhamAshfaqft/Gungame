import {Box,Vec3} from 'cannon-es';

// Exact support-function projection of an oriented box. Cannon's generic hull
// path visits all eight corners for every SAT axis. The same extrema are the
// centre projection +/- the sum of the three projected half-extents.
const projections=new WeakMap();
const orientations=new WeakMap();
const X=new Vec3(1,0,0),Y=new Vec3(0,1,0),Z=new Vec3(0,0,1);
function projection(hull,axis,p,q){
 let state=projections.get(hull);if(!state){state={x:new Vec3(),y:new Vec3(),z:new Vec3()};projections.set(hull,state);}
 if(state.qx!==q.x||state.qy!==q.y||state.qz!==q.z||state.qw!==q.w){q.vmult(X,state.x);q.vmult(Y,state.y);q.vmult(Z,state.z);state.qx=q.x;state.qy=q.y;state.qz=q.z;state.qw=q.w;}
 const e=hull.physicsHalfExtents,radius=Math.abs(axis.dot(state.x))*e.x+Math.abs(axis.dot(state.y))*e.y+Math.abs(axis.dot(state.z))*e.z,center=axis.dot(p);state.min=center-radius;state.max=center+radius;return state;
}

function orientation(hull,q){
 let state=orientations.get(hull);
 if(!state){state={axes:hull.uniqueAxes.map(()=>new Vec3()),edges:hull.uniqueEdges.map(()=>new Vec3()),cross:new Vec3()};orientations.set(hull,state);}
 if(state.qx!==q.x||state.qy!==q.y||state.qz!==q.z||state.qw!==q.w){
  for(let i=0;i<hull.uniqueAxes.length;i++)q.vmult(hull.uniqueAxes[i],state.axes[i]);
  for(let i=0;i<hull.uniqueEdges.length;i++)q.vmult(hull.uniqueEdges[i],state.edges[i]);
  state.qx=q.x;state.qy=q.y;state.qz=q.z;state.qw=q.w;
 }return state;
}

// Preserve Cannon's complete SAT axis order, early exits and minimum-depth
// choice. Only reuse world-space box axes and scratch storage across contacts.
function findBoxAxis(other,pA,qA,pB,qB,target){
 const a=orientation(this,qA),b=orientation(other,qB),cross=a.cross;let depth=Number.MAX_VALUE;
 for(const axis of a.axes){const d=this.testSepAxis(axis,other,pA,qA,pB,qB);if(d===false)return false;if(d<depth){depth=d;target.copy(axis);}}
 for(const axis of b.axes){const d=this.testSepAxis(axis,other,pA,qA,pB,qB);if(d===false)return false;if(d<depth){depth=d;target.copy(axis);}}
 for(const edgeA of a.edges)for(const edgeB of b.edges){
  edgeA.cross(edgeB,cross);if(cross.almostZero())continue;cross.normalize();
  const d=this.testSepAxis(cross,other,pA,qA,pB,qB);if(d===false)return false;if(d<depth){depth=d;target.copy(cross);}
 }
 if((pB.x-pA.x)*target.x+(pB.y-pA.y)*target.y+(pB.z-pA.z)*target.z>0)target.negate(target);
 return true;
}
export function physicsBox(halfExtents){
 const box=new Box(halfExtents),hull=box.convexPolyhedronRepresentation,original=hull.testSepAxis;hull.physicsHalfExtents=halfExtents;
 hull.testSepAxis=function(axis,other,pA,qA,pB,qB){
  if(!other.physicsHalfExtents||other===this)return original.call(this,axis,other,pA,qA,pB,qB);
  const a=projection(this,axis,pA,qA),b=projection(other,axis,pB,qB);if(a.max<b.min||b.max<a.min)return false;return Math.min(a.max-b.min,b.max-a.min);
 };
 const originalSearch=hull.findSeparatingAxis;
 hull.findSeparatingAxis=function(other,pA,qA,pB,qB,target,faceListA,faceListB){
  if(!other.physicsHalfExtents||other===this||!this.uniqueAxes||!other.uniqueAxes)return originalSearch.call(this,other,pA,qA,pB,qB,target,faceListA,faceListB);
  return findBoxAxis.call(this,other,pA,qA,pB,qB,target);
 };return box;
}
