import {SAPBroadphase} from 'cannon-es';

// Sort and stop on the same bounds. Cannon's default sweep sorts AABBs but
// stops on bounding spheres, and checks sleeping pairs before the stop test.
// A destroyed room can leave hundreds of sleeping/static bodies in that loop.
export class EnvironmentBroadphase extends SAPBroadphase {
 constructor(world){super(world);this.useBoundingBoxes=true;}
 collisionPairs(world,pairsA,pairsB){
  if(this.dirty){this.sortList();this.dirty=false;}
  const axis=['x','y','z'][this.axisIndex],bodies=this.axisList;
  for(let i=0;i<bodies.length;i++){
   const a=bodies[i],upper=a.aabb.upperBound[axis];
   for(let j=i+1;j<bodies.length;j++){
    const b=bodies[j];if(b.aabb.lowerBound[axis]>upper)break;
    if(this.needBroadphaseCollision(a,b))this.intersectionTest(a,b,pairsA,pairsB);
   }
  }
 }
}
