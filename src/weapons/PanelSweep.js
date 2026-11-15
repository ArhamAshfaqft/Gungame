import * as T from 'three';

const cache=new WeakMap();
// Reuse the convex remnants produced by destruction, including puncture
// channels. Cache planes until damage changes; intact panels retain the fast
// box path. Expanding each plane retains clearance for the grenade radius.
function solidsFor(panel){
 const old=cache.get(panel);
 if(old?.geometry===panel.mesh.geometry&&old.broken===panel.broken.size)return old.solids;
 const solids=[];
 for(const piece of panel.pieces){
  if(panel.broken.has(piece.id))continue;
  const h=panel.thickness/2,front=piece.polygon.map(p=>new T.Vector3(p.x,p.y,h)),back=front.map(p=>new T.Vector3(p.x,p.y,-h));
  const source=panel.punctureSolids?.get(piece.id)||[[front,[...back].reverse(),...front.map((p,i)=>[back[i],back[(i+1)%front.length],front[(i+1)%front.length],p])]];
  for(const faces of source){
   const vertices=faces.flat(),center=vertices.reduce((a,p)=>a.add(p),new T.Vector3()).divideScalar(vertices.length),planes=[];
   for(const face of faces){
    if(face.length<3)continue;
    const plane=new T.Plane().setFromCoplanarPoints(face[0],face[1],face[2]);
    if(plane.normal.lengthSq()<.5)continue;
    if(plane.distanceToPoint(center)>0)plane.negate();
    planes.push(plane);
   }
   if(planes.length>=4)solids.push({planes,bounds:new T.Box3().setFromPoints(vertices)});
  }
 }
 cache.set(panel,{geometry:panel.mesh.geometry,broken:panel.broken.size,solids});return solids;
}
export function sweepDamagedPanel(start,end,radius,panel,box){
 panel.mesh.updateWorldMatrix(true,false);
 const inverse=panel.mesh.matrixWorld.clone().invert(),a=start.clone().applyMatrix4(inverse),b=end.clone().applyMatrix4(inverse),delta=b.clone().sub(a);
 const travel=new T.Box3().setFromPoints([a,b]).expandByScalar(radius);let result=null;
 for(const {planes,bounds} of solidsFor(panel)){
  if(!travel.intersectsBox(bounds))continue;
  let enter=0,exit=1,normal=null,valid=true;
  for(const plane of planes){
   const distance=plane.distanceToPoint(a)-radius,speed=plane.normal.dot(delta);
   if(Math.abs(speed)<1e-10){if(distance>0){valid=false;break;}continue;}
   const time=-distance/speed;
   if(speed<0){if(time>=enter){enter=time;normal=plane.normal;}}else exit=Math.min(exit,time);
   if(enter>exit){valid=false;break;}
  }
  if(valid&&normal&&enter>=0&&enter<=1&&(!result||enter<result.time))result={time:enter,normal:normal.clone().transformDirection(panel.mesh.matrixWorld),box};
 }
 return result;
}
