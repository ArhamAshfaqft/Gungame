import * as THREE from 'three';

export const POOL_GAP=[-11.75,-4.25,-23.25,-16.75];
export function cutSlab(map,[a,b,c,d],y,h,material,[l,r,n,f]=POOL_GAP){
 for(const [x0,x1,z0,z1] of [[a,l,c,d],[r,b,c,d],[l,r,c,n],[l,r,f,d]])if(x1>x0&&z1>z0)map.box((x0+x1)/2,y,(z0+z1)/2,x1-x0,h,z1-z0,material);
}
export function addWater(map,x,y,z,w,d,options={}){
 if(!map.waterNormal){
  const n=64,data=new Uint8Array(n*n*4);
  for(let j=0;j<n;j++)for(let i=0;i<n;i++){const k=(j*n+i)*4;data[k]=128+Math.round(26*Math.cos(i/n*Math.PI*8+j/n*Math.PI*4));data[k+1]=128+Math.round(26*Math.sin(j/n*Math.PI*10-i/n*Math.PI*4));data[k+2]=250;data[k+3]=255;}
  map.waterNormal=new THREE.DataTexture(data,n,n);map.waterNormal.wrapS=map.waterNormal.wrapT=THREE.RepeatWrapping;map.waterNormal.repeat.set(3,3);map.waterNormal.needsUpdate=true;
 }
 const material=new THREE.MeshPhysicalMaterial({color:0x46898c,normalMap:map.waterNormal,normalScale:new THREE.Vector2(.22,.22),roughness:.08,metalness:0,clearcoat:1,ior:1.33,transparent:true,opacity:.35,depthWrite:false,side:THREE.DoubleSide});
 const mesh=new THREE.Mesh(new THREE.PlaneGeometry(w,d,24,24),material);mesh.rotation.x=-Math.PI/2;mesh.position.set(x,y,z);mesh.name='Animated water surface';mesh.userData.water=true;map.scene.add(mesh);const body=map.liquids?.add(mesh,options);if(body){const area={minX:x-w/2,maxX:x+w/2,minZ:z-d/2,maxZ:z+d/2,surface:y,bottom:body.bottom};body.gameplayArea=area;(map.waterAreas??=[]).push(area);map.colliders.waterAreas=map.waterAreas;}return mesh;
}
export function buildPool(map){
 cutSlab(map,[-13,-3,-24.5,-15.5],3.39,.16,'wood');
 map.box(-8,2.08,-20,7.5,.2,6.5,'bathTile');
 for(const x of [-11.8,-4.2])map.box(x,2.74,-20,.16,1.32,6.65,'stone');
 for(const z of [-23.3,-16.7])map.box(-8,2.74,z,7.7,1.32,.16,'stone');
 for(let i=0;i<6;i++)map.box(-8,3.2-i*.2-.1,-17.02-i*.3,2,.2,.32,'bathTile');
 addWater(map,-8,3.4,-20,7.48,6.48,{bottom:2.18});
 map.colliders.waterAreas=map.waterAreas;
 for(const x of [-10.8,-5.2])for(const z of [-22.5,-17.5]){const light=new THREE.PointLight(0x6bb4cd,1.2,2);light.position.set(x,2.6,z);map.scene.add(light);map.roomLights.push(light);}
}
