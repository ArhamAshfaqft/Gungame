import * as THREE from 'three';
import {ConvexHull} from 'three/examples/jsm/math/ConvexHull.js';
const EPS=1e-6;
export function boxSolid(box){
 const points=[];for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z])points.push(new THREE.Vector3(x,y,z));
 const hull=new ConvexHull().setFromPoints(points);return hull.faces.map(face=>{const vertices=[];let edge=face.edge;do{vertices.push(edge.head().point.clone());edge=edge.next;}while(edge!==face.edge);return vertices;});
}
function cap(points,normal){
 const unique=[];for(const p of points)if(!unique.some(v=>v.distanceToSquared(p)<EPS*EPS))unique.push(p);
 if(unique.length<3)return null;
 const center=unique.reduce((sum,p)=>sum.add(p),new THREE.Vector3()).multiplyScalar(1/unique.length);
 const u=new THREE.Vector3().crossVectors(normal,Math.abs(normal.y)<.9?new THREE.Vector3(0,1,0):new THREE.Vector3(1,0,0)).normalize(),v=new THREE.Vector3().crossVectors(normal,u);
 unique.sort((a,b)=>Math.atan2(a.clone().sub(center).dot(v),a.clone().sub(center).dot(u))-Math.atan2(b.clone().sub(center).dot(v),b.clone().sub(center).dot(u)));
 return unique;
}
export function clipSolid(solid,plane){
 const faces=[],crossings=[];let cut=false,inside=false;
 for(const face of solid){const polygon=[];for(let i=0;i<face.length;i++){
  const a=face[i],b=face[(i+1)%face.length],da=plane.distanceToPoint(a),db=plane.distanceToPoint(b);
  if(da<=EPS){polygon.push(a.clone());inside=true;}else cut=true;
  if((da<-EPS&&db>EPS)||(da>EPS&&db<-EPS)){const p=a.clone().lerp(b,da/(da-db));polygon.push(p);crossings.push(p);}
  else if(Math.abs(da)<=EPS)crossings.push(a);
 }if(polygon.length>=3)faces.push(polygon);}
 if(!inside)return [];
 if(cut){const polygon=cap(crossings,plane.normal);if(polygon)faces.push(polygon);}
 return faces;
}
export function subtractSolid(solid,planes){
 if(planes.some(plane=>solid.every(face=>face.every(p=>plane.distanceToPoint(p)>=-EPS))))return [solid];
 const pieces=[];let remainder=solid;
 for(const plane of planes){if(!remainder.length)break;const outside=clipSolid(remainder,plane.clone().negate());if(outside.length)pieces.push(outside);remainder=clipSolid(remainder,plane);}
 return pieces;
}
export function fracturePlanes(point,normal,radius,depth,seed=1,grain=null){
 const n=normal.clone().normalize(),u=new THREE.Vector3().crossVectors(n,Math.abs(n.y)<.9?new THREE.Vector3(0,1,0):new THREE.Vector3(1,0,0)).normalize(),v=new THREE.Vector3().crossVectors(n,u),points=[];
 let state=(seed>>>0)||1;const random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
 const count=7,phase=random()*Math.PI*2,bottomDepth=depth*(.86+random()*.2);
 for(let i=0;i<count;i++){const angle=phase+i/count*Math.PI*2,r=radius*(.78+random()*.34),radial=u.clone().multiplyScalar(Math.cos(angle)*r).addScaledVector(v,Math.sin(angle)*r);
  if(grain){const g=grain.clone().addScaledVector(n,-grain.dot(n)).normalize();radial.addScaledVector(g,radial.dot(g)*1.3);radial.multiplyScalar(.75);}
  points.push(point.clone().addScaledVector(n,depth*.3).add(radial));points.push(point.clone().addScaledVector(n,-bottomDepth).addScaledVector(radial,.42));
 }
 const hull=new ConvexHull().setFromPoints(points),planes=[];
 for(const face of hull.faces){const plane=new THREE.Plane(face.normal.clone(),-face.constant);if(!planes.some(p=>p.normal.distanceToSquared(plane.normal)<1e-8&&Math.abs(p.constant-plane.constant)<EPS))planes.push(plane);}
 return planes;
}
export function solidsGeometry(solids){
 const positions=[],normals=[],uvs=[];
 for(const solid of solids)for(const face of solid){if(face.length<3)continue;const normal=new THREE.Vector3().crossVectors(face[1].clone().sub(face[0]),face[2].clone().sub(face[0])).normalize();
  for(let i=1;i<face.length-1;i++)for(const p of [face[0],face[i],face[i+1]]){positions.push(p.x,p.y,p.z);normals.push(normal.x,normal.y,normal.z);uvs.push((Math.abs(normal.x)>.5?p.z:p.x)/3,(Math.abs(normal.y)>.5?p.z:p.y)/3);}
 }
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));g.computeBoundingBox();g.computeBoundingSphere();return g;
}

export function projectileChannel(point,direction,thickness,energy){
 const axis=direction.clone().normalize(),u=new THREE.Vector3().crossVectors(axis,Math.abs(axis.y)<.9?new THREE.Vector3(0,1,0):new THREE.Vector3(1,0,0)).normalize(),v=new THREE.Vector3().crossVectors(axis,u),radius=.007+.006*Math.sqrt(Math.min(1,energy/4500)),points=[];
 const start=point.clone().addScaledVector(axis,-.015),end=point.clone().addScaledVector(axis,thickness+.025);
 for(let i=0;i<7;i++){const a=i/7*Math.PI*2,offset=u.clone().multiplyScalar(Math.cos(a)*radius).addScaledVector(v,Math.sin(a)*radius);points.push(start.clone().add(offset),end.clone().addScaledVector(offset,1.6));}
 return new ConvexHull().setFromPoints(points).faces.map(face=>new THREE.Plane(face.normal.clone(),-face.constant));
}
