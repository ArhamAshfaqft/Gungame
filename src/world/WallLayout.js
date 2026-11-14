// Resolve glazing against the complete floor plan before making its geometry.
// Partitions terminate on solid piers, never in the middle of a single pane.
export function partitionJunctions(wall,walls){
 return walls.filter(other=>other!==wall&&other.axis!==wall.axis
  &&Math.abs(other.base-wall.base)<.05
  &&other.from<=wall.coord+.12&&other.to>=wall.coord-.12
  &&other.coord>wall.from-.01&&other.coord<wall.to+.01).map(other=>other.coord);
}

export function alignedOpenings(wall,walls){
 const junctions=partitionJunctions(wall,walls),out=[];
 for(const opening of wall.openings){
  if(opening.kind!=='glass'){out.push({...opening});continue;}
  let spans=[[opening.at-opening.width/2,opening.at+opening.width/2]];
  for(const at of junctions){const a=at-.22,b=at+.22;
   spans=spans.flatMap(([l,r])=>a>=r||b<=l?[[l,r]]:[[l,Math.max(l,a)],[Math.min(r,b),r]].filter(([x,y])=>y-x>=.65));
  }
  for(const [l,r] of spans)out.push({...opening,at:(l+r)/2,width:r-l});
 }
 return out.sort((a,b)=>a.at-b.at);
}
