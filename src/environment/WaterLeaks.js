import {Vector3,Raycaster} from 'three';

// Rescan only changed wall geometry. Connected empty samples are one opening,
// never one average of all holes in a wall. Samples retain area/height for flow.
export function findWallLeaks(body,wall){
 if(wall.visible&&!wall.userData.fractureSolids&&!wall.userData.networkFractured)return [];
 wall.updateWorldMatrix(true,false);if(!wall.geometry.boundingBox)wall.geometry.computeBoundingBox();
 const box=wall.geometry.boundingBox.clone().applyMatrix4(wall.matrixWorld),size=box.getSize(new Vector3()),center=box.getCenter(new Vector3());
 const axis=size.x>size.z?'x':'z',across=axis==='x'?'z':'x',normal=new Vector3();normal[across]=Math.sign(center[across]-body[across])||1;
 const cols=Math.max(1,Math.min(64,Math.ceil(size[axis]/.06))),rows=Math.max(1,Math.ceil((body.initialLevel-body.bottom)/.03)),dx=size[axis]/cols,dy=(body.initialLevel-body.bottom)/rows;
 const cells=new Array(cols*rows),ray=new Raycaster();ray.layers.enableAll();ray.ray.direction.copy(normal);ray.far=size[across]+.02;
 for(let row=0;row<rows;row++)for(let col=0;col<cols;col++){
  const point=center.clone();point[axis]=box.min[axis]+dx*(col+.5);point.y=body.bottom+dy*(row+.5);
  // Cast through the complete shell thickness, not from an arbitrary offset.
  point[across]=normal[across]>0?box.max[across]:box.min[across];
  ray.ray.origin.copy(point).addScaledVector(normal,-size[across]-.01);
  if(!wall.visible||!ray.intersectObject(wall,false).length)cells[row*cols+col]={point,bottom:point.y-dy/2,top:point.y+dy/2,area:dx*dy};
 }
 const leaks=[];
 for(let seed=0;seed<cells.length;seed++){
  if(!cells[seed])continue;
  const pending=[seed],samples=[];let sill=Infinity;const mean=new Vector3();
  while(pending.length){const id=pending.pop(),cell=cells[id];if(!cell)continue;cells[id]=null;samples.push(cell);mean.add(cell.point);sill=Math.min(sill,cell.bottom);
   const col=id%cols,row=Math.floor(id/cols);if(col)pending.push(id-1);if(col+1<cols)pending.push(id+1);if(row)pending.push(id-cols);if(row+1<rows)pending.push(id+cols);
  }
  mean.multiplyScalar(1/samples.length);
  const anchor=samples.reduce((best,c)=>c.point.distanceToSquared(mean)<best.point.distanceToSquared(mean)?c:best);
  leaks.push({point:anchor.point.clone(),normal:normal.clone(),sill,area:samples.length*dx*dy,wall,cells:samples});
 }
 return leaks;
}

// Integrate the submerged portion: Q = Cd A sqrt(2 g h). A partly exposed hole
// loses wet area as the level falls; a dry opening emits neither water nor spray.
export function leakFlow(leak,level){
 if(!leak.cells){const head=Math.max(0,level-leak.sill);return {head,flow:.62*leak.area*Math.sqrt(2*9.81*head),point:leak.point};}
 let flow=0,headSum=0;const mean=new Vector3();
 for(const cell of leak.cells){
  const wet=Math.max(0,Math.min(cell.top,level)-cell.bottom);if(wet<=0)continue;
  const head=level-cell.bottom-wet/2,q=.62*cell.area*wet/(cell.top-cell.bottom)*Math.sqrt(2*9.81*head);
  flow+=q;headSum+=head*q;mean.addScaledVector(cell.point,q);
 }
 if(!flow)return {flow:0,head:0,point:leak.point};
 mean.multiplyScalar(1/flow);
 let best=null,distance=Infinity;
 for(const cell of leak.cells){if(cell.bottom>=level)continue;const d=cell.point.distanceToSquared(mean);if(d<distance){best=cell;distance=d;}}
 const point=best.point.clone();point.y=best.bottom+(Math.min(level,best.top)-best.bottom)/2;
 return {flow,head:headSum/flow,point};
}
