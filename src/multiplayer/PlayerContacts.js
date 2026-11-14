// Horizontal capsule contacts; characters never become walkable platforms.
export function resolvePlayerContacts(m,players,id,colliders=[]){
 const roster=Array.isArray(players)?players:[...players],before=m.position.clone(),feet=m.position.y-m.currentHeight;
 for(let pass=0;pass<2;pass++)for(const p of roster){
  if(p.id===id||p.spectator||p.hp<=0)continue;const other=p.movement,position=other.position;
  const x=position.x??position[0],y=position.y??position[1],z=position.z??position[2],height=other.currentHeight||1.65;
  if(feet>=y-.05||m.position.y<=y-height+.05)continue;
  let dx=m.position.x-x,dz=m.position.z-z,d=Math.hypot(dx,dz);if(d>=.9)continue;
  if(d<.00001){dx=String(id)<String(p.id)?-1:1;dz=0;d=1;}
  const nx=dx/d,nz=dz/d,penetration=.9-Math.hypot(m.position.x-x,m.position.z-z);
  m.position.x+=nx*penetration;m.position.z+=nz*penetration;
  const into=m.velocity.x*nx+m.velocity.z*nz;if(into<0){m.velocity.x-=into*nx;m.velocity.z-=into*nz;}
  for(const b of colliders){if(b.max.y<=feet+.08||b.min.y>=m.position.y||b.ramp)continue;if(m.position.x+.45<b.min.x||m.position.x-.45>b.max.x||m.position.z+.45<b.min.z||m.position.z-.45>b.max.z)continue;m.resolveBoxCollision(b,feet,false);}
 }
 if(m.camera){m.camera.position.x+=m.position.x-before.x;m.camera.position.y+=m.position.y-before.y;m.camera.position.z+=m.position.z-before.z;}
}
