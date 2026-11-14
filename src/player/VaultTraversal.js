import * as T from 'three';

// Planned only on a jump press. Every part of the tucked-body route must be
// clear, so intact glazing, lintels and furniture still block traversal.
export function planVault(position,height,yaw,colliders,speed=0){
 position=position.clone();
 const feet=position.y-height,forward=new T.Vector3(-Math.sin(yaw),0,-Math.cos(yaw));
 const ray=new T.Ray(new T.Vector3(position.x,feet+.1,position.z),forward);
 let obstacle=null,distance=Infinity;
 for(const box of colliders){
  if(box.ramp||box.doorGroup||box.stairGuard)continue;
  const rise=box.max.y-feet;if(rise<.25||rise>1.45)continue;
  const point=ray.intersectBox(box,new T.Vector3());if(!point)continue;
  const d=point.distanceTo(ray.origin);
  if(d<distance&&d<1.45){distance=d;obstacle=box;}
 }
 if(!obstacle)return null;
 const size=obstacle.getSize(new T.Vector3());
 if(Math.min(size.x,size.z)>.9)return null;
 const exit=new T.Ray(ray.origin.clone().addScaledVector(forward,4),forward.clone().negate()).intersectBox(obstacle,new T.Vector3());
 if(!exit)return null;
 const far=exit.clone().sub(ray.origin).dot(forward);
 if(far-distance>.9)return null;
 const travel=far+.56;
 if(travel<.6||travel>2.6)return null;
 const lift=obstacle.max.y-feet+.055,tuckedHeight=1.05;
 const at=t=>{
  const rise=t<.3?Math.sin(t/.3*Math.PI/2):1;
  return position.clone().addScaledVector(forward,travel*T.MathUtils.smoothstep(t,.3,1)).setY(feet+lift*rise+tuckedHeight);
 };
 for(let i=0;i<=24;i++){
  const p=at(i/24),bottom=p.y-tuckedHeight;
  for(const box of colliders){
   if(box.ramp)continue;
   if(p.x+.43>box.min.x&&p.x-.43<box.max.x&&p.z+.43>box.min.z&&p.z-.43<box.max.z
      &&bottom<box.max.y-.005&&p.y>box.min.y+.005)return null;
  }
 }
 return {time:0,duration:T.MathUtils.clamp(.22+travel/Math.max(4,speed),.45,.65),height:tuckedHeight,at,
  exitVelocity:forward.clone().multiplyScalar(T.MathUtils.clamp(speed,2.4,7.2))};
}
