export function footstepSurface(map,m){
 if(m.isWading)return 'water';const feet=m.position.y-m.currentHeight;
 if(map.rugSpecs?.some(r=>Math.abs(r.y-feet)<.12&&Math.abs(r.x-m.position.x)<r.w/2&&Math.abs(r.z-m.position.z)<r.d/2))return 'carpet';
 let top=-Infinity,surface='stone';for(const b of map.colliders){if(b.doorGroup||b.max.y>feet+.1||b.max.y<feet-.25||m.position.x<b.min.x||m.position.x>b.max.x||m.position.z<b.min.z||m.position.z>b.max.z||b.max.y<top)continue;top=b.max.y;surface=b.supportMesh?.userData.physicalMaterial||b.supportMesh?.userData.surface||'stone';}
 return ['wood','metal','cloth'].includes(surface)?surface==='cloth'?'carpet':surface:'stone';
}
export function remoteFootstepMix(kind,surface,position,listener){
 if(!listener)return{volume:0,pan:0,frequency:1200};const dx=position.x-listener.position.x,dy=position.y-listener.position.y,dz=position.z-listener.position.z,d=Math.hypot(dx,dy,dz),range=kind==='sprint'?32:kind==='walk'?12:kind==='crouch'?7:24;
 const base={sprint:.8,run:.5,walk:.17,crouch:.07,crouchRun:.22}[kind]??.5;
 return{volume:d>=range?0:base/(1+(d/4.5)**2)*Math.min(1,(range-d)/4)*(Math.abs(dy)>2?.5:1),pan:Math.max(-.95,Math.min(.95,(dx*Math.cos(listener.yaw)-dz*Math.sin(listener.yaw))/Math.max(.1,d))),frequency:{wood:950,metal:2800,carpet:500,water:2200,stone:1850}[surface]||1500};
}
