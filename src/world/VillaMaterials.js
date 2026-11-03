import * as THREE from 'three';

// Deterministic, tileable material maps. Bump/roughness are generated separately
// from albedo so the lighting responds to grain, joints and fabric weave.
function maps(kind,base,size=256){
 const color=new Uint8Array(size*size*4),bump=new Uint8Array(size*size*4),rough=new Uint8Array(size*size*4);
 let seed=731;const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  const noise=rand()-.5,u=x/size,v=y/size;let grain=0,height=.55,r=.8;
  if(kind==='oak'||kind==='walnut'){
   const board=Math.floor(x/32),joint=x%32<1||((y+board*83)%256)<2;
   grain=Math.sin(x*2.4+Math.sin(y*.025)*4)*4+Math.sin(x*11+y*.01)*2+(board%3-1)*8+noise*8;
   if(joint)grain-=35;height=joint?.15:.55+Math.sin(x*2.4)*.06;r=.55+noise*.1;
  }else if(kind==='travertine'){
   const joint=x%128<1||y%64<1;grain=Math.sin(y*.7+Math.sin(x*.04))*3+noise*13-(joint?30:0);height=joint?.1:.5+noise*.13;r=.72;
  }else if(kind==='marble'){
   const vein=Math.abs(Math.sin(u*10+Math.sin(v*9)*2+Math.sin(u*31+v*12)*.2));grain=(vein<.1?-32:0)+noise*5;height=.5;r=.3+noise*.04;
  }else if(kind==='terrazzo'){
   const chip=rand()>.94;grain=noise*8+(chip?(rand()-.5)*90:0);height=.5;r=.63;
  }else if(kind==='fabric'){
   grain=(x%3===0?-10:0)+(y%3===0?-6:0)+noise*10;height=.5+(x%3===0?-.2:0)+(y%3===0?-.1:0);r=.95;
  }else if(kind==='rug'){
   const border=x<12||x>size-13||y<12||y>size-13;grain=(border?25:0)+Math.sin(x*1.6)*3+noise*16;height=.5+noise*.3;r=1;
  }else if(kind==='brick'){
   const row=Math.floor(y/32),joint=(x+(row%2)*32)%64<2||y%32<2;grain=joint?-50:noise*25+Math.sin(row*6)*10;height=joint?.08:.5+noise*.08;
  }else{grain=noise*6+Math.sin(u*38)*Math.cos(v*41)*1.4;height=.5+noise*.1;r=.87;}
  const i=(y*size+x)*4;for(let c=0;c<3;c++){color[i+c]=THREE.MathUtils.clamp(base[c]+grain,0,255);bump[i+c]=THREE.MathUtils.clamp(height*255,0,255);rough[i+c]=r*255;}color[i+3]=bump[i+3]=rough[i+3]=255;
 }
 const tex=(data,srgb=false)=>{const t=new THREE.DataTexture(data,size,size);if(srgb)t.colorSpace=THREE.SRGBColorSpace;t.wrapS=t.wrapT=THREE.RepeatWrapping;t.magFilter=THREE.LinearFilter;t.minFilter=THREE.LinearMipmapLinearFilter;t.generateMipmaps=true;t.anisotropy=4;t.needsUpdate=true;return t;};
 return{map:tex(color,true),bumpMap:tex(bump),roughnessMap:tex(rough)};
}
export function upgradeVillaMaterials(map){
 const m=map.materials;
 const make=(name,kind,color,extra={})=>{m[name]=new THREE.MeshStandardMaterial({...maps(kind,color),color:0xffffff,roughness:1,bumpScale:.025,...extra});return m[name];};
 for(const name of ['plaster','softWall']){const old=m[name];old.dispose();make(name,'plaster',[209,204,191],{vertexColors:name==='softWall'});}
 m.stone.dispose();make('stone','travertine',[170,159,135]);m.tile.dispose();make('tile','terrazzo',[176,174,159],{bumpScale:.008});
 make('oakFloor','oak',[137,105,67],{bumpScale:.012});make('walnut','walnut',[91,61,40],{bumpScale:.012});
 make('marble','marble',[184,180,163],{bumpScale:.002,metalness:.05});make('brick','brick',[112,69,49],{bumpScale:.055});
 make('linen','fabric',[167,154,132],{bumpScale:.018});make('leather','fabric',[81,52,36],{bumpScale:.009});
 make('rug','rug',[71,78,74],{bumpScale:.02});make('blueRug','rug',[43,65,73],{bumpScale:.02});
 make('epoxy','terrazzo',[92,102,99],{bumpScale:.006});make('bathTile','marble',[106,125,121],{bumpScale:.003});
 make('floorPanel','oak',[137,105,67],{vertexColors:true,bumpScale:.012});
 m.wood.dispose();make('wood','walnut',[107,76,46],{bumpScale:.02});m.woodPanel.dispose();make('woodPanel','oak',[120,86,51],{vertexColors:true});
 make('curtain','fabric',[169,162,144],{side:THREE.DoubleSide});
 for(const name of ['wood','woodPanel','walnut','oakFloor','floorPanel'])m[name].userData.surface='wood';
 m.metal.color.setHex(0x202b2b);m.steel.roughness=.32;m.steel.metalness=.8;
 m.fabric.dispose();make('fabric','fabric',[183,174,153],{bumpScale:.02});
 m.ochre.dispose();make('ochre','fabric',[139,96,54],{bumpScale:.018});
 m.glass.opacity=.15;m.glass.color.setHex(0xc8ddd9);
 for(const [name,color] of [['sageWall',0x899b8b],['blueWall',0x586f72],['sandWall',0xc4b293],['wineWall',0x8a6b51]]){m[name]=m.softWall.clone();m[name].color.setHex(color);}
 m.glowWarm=new THREE.MeshBasicMaterial({color:0xffe2ac});m.glowCool=new THREE.MeshBasicMaterial({color:0xb3dedf});
 m.glowAmber=new THREE.MeshBasicMaterial({color:0xcf7331});
 map.materials=m;
 installPhotographedMaps(map);
}

function installPhotographedMaps(map){
 if(typeof document==='undefined')return;
 const loader=new THREE.TextureLoader();const directory='/assets/textures/solstice/',pending=[];
 const load=(asset,names)=>{
  for(const [channel,property] of [['diff','map'],['normal','normalMap'],['rough','roughnessMap']]){
   pending.push(new Promise(resolve=>loader.load(`${directory}${asset}_${channel}.jpg`,texture=>{
    texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.anisotropy=4;if(channel==='diff')texture.colorSpace=THREE.SRGBColorSpace;
    for(const name of names){const material=map.materials[name];material[property]=texture;
     if(asset==='white_plaster_02'&&channel==='diff'){
      // Painted plaster preserves fine photographed variation without making a
      // maintained residence read as raw, stained masonry.
      material.onBeforeCompile=shader=>{shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>','#include <map_fragment>\ndiffuseColor.rgb=mix(diffuseColor.rgb,diffuse,0.78);');};
      material.customProgramCacheKey=()=> 'solstice-painted-plaster';
     }
     if(channel==='normal'){material.bumpMap=null;material.normalScale.setScalar(asset==='wood_floor'?.55:.12);}material.needsUpdate=true;}
    resolve();
   },undefined,error=>{console.warn(`Photographed material unavailable: ${asset}/${channel}; retaining procedural finish.`,error);resolve();})));
  }
 };
 load('wood_floor',['oakFloor','floorPanel']);
 load('white_plaster_02',['plaster','softWall','sageWall','blueWall','sandWall','wineWall']);
 map.materialsReady=Promise.all(pending);
}
