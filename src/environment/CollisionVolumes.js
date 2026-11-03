import {Box3,Vector3} from 'three';
const axes=['x','y','z'],cache=new WeakMap(),epsilon=1e-7;
function subtract(box,cut){
 const overlap=box.clone().intersect(cut);if(axes.some(a=>overlap.max[a]-overlap.min[a]<=epsilon))return[box];
 const core=box.clone(),out=[];
 for(const a of axes){
  if(overlap.min[a]>core.min[a]+epsilon){const b=core.clone();b.max[a]=overlap.min[a];out.push(b);core.min[a]=overlap.min[a];}
  if(overlap.max[a]<core.max[a]-epsilon){const b=core.clone();b.min[a]=overlap.max[a];out.push(b);core.max[a]=overlap.max[a];}
 }return out;
}
// CSG hull bounds overlap. Their union is useful collision geometry, but making
// each overlap a separate shape duplicates contacts and mass. Partition the
// same union into disjoint boxes, then join full matching faces. No opening is
// filled and no occupied collision volume is discarded.
export function unionCollisionBoxes(boxes){
 const volume=b=>{const s=b.getSize(new Vector3());return s.x*s.y*s.z;},sorted=[...boxes].sort((a,b)=>volume(b)-volume(a));let result=[];
 for(const box of sorted){let next=[box.clone()];for(const previous of result){next=next.flatMap(b=>subtract(b,previous));if(!next.length)break;}result.push(...next);}
 let changed=true;while(changed){changed=false;
  outer:for(let i=0;i<result.length;i++)for(let j=i+1;j<result.length;j++)for(const axis of axes){
   const a=result[i],b=result[j];if(!axes.filter(v=>v!==axis).every(v=>Math.abs(a.min[v]-b.min[v])<epsilon&&Math.abs(a.max[v]-b.max[v])<epsilon))continue;
   if(Math.abs(a.max[axis]-b.min[axis])>epsilon&&Math.abs(b.max[axis]-a.min[axis])>epsilon)continue;
   a.union(b);result.splice(j,1);changed=true;break outer;
  }
 }return result;
}
export function collisionVolumes(mesh){
 const g=mesh.geometry,solids=mesh.userData.fractureSolids,panel=mesh.userData.breakable,revision=panel?.detachedEnvironment?`${g.index?.version}:${panel.broken.size}`:g.attributes.position.version,old=cache.get(g);
 if(old&&old.solids===solids&&old.revision===revision)return old.boxes;
 let boxes;if(panel?.detachedEnvironment)boxes=panel.pieces.filter(p=>!panel.broken.has(p.id)).map(p=>new Box3(new Vector3(p.bounds.min.x,p.bounds.min.y,-panel.thickness/2),new Vector3(p.bounds.max.x,p.bounds.max.y,panel.thickness/2)));
 else if(solids)boxes=solids.map(s=>new Box3().setFromPoints(s.flat()));
 else{if(!g.boundingBox)g.computeBoundingBox();boxes=[g.boundingBox.clone()];}
 if(boxes.length>1)boxes=unionCollisionBoxes(boxes);cache.set(g,{solids,revision,boxes});return boxes;
}
