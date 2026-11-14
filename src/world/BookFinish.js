import * as T from 'three';
// Shared by intact books and worker-rebuilt bullet cuts. Raw cut faces show paper.
export function applyBookFinish(geometry,finish){
 const p=geometry.attributes.position,n=geometry.attributes.normal,values=new Float32Array(p.count*3),ink=new T.Color(finish.coverColor),paper=new T.Color(0xd5ccb5);
 for(let i=0;i<p.count;i++){
  const front=n.getZ(i)>.9&&p.getZ(i)>finish.depth*.40,cover=Math.abs(n.getX(i))>.9&&Math.abs(p.getX(i))>finish.width*.44;
  const c=front||cover?ink:paper;values[i*3]=c.r;values[i*3+1]=c.g;values[i*3+2]=c.b;
 }
 geometry.setAttribute('color',new T.BufferAttribute(values,3));geometry.parameters??={};geometry.parameters.bookFinish={...finish};return geometry;
}
