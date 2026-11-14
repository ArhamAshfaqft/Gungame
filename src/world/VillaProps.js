import * as T from 'three';
import {mergeGeometries} from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {RoundedBoxGeometry} from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

const colorGeometry=(g,color)=>{const c=new T.Color(color),a=new Float32Array(g.attributes.position.count*3);for(let i=0;i<a.length;i+=3){a[i]=c.r;a[i+1]=c.g;a[i+2]=c.b;}g.setAttribute('color',new T.BufferAttribute(a,3));return g;};
function merge(parts){const g=mergeGeometries(parts,false);for(const p of parts)p.dispose();return g;}
function box(w,h,d,x,y,z,color){return colorGeometry(new T.BoxGeometry(w,h,d).translate(x,y,z),color);}
function lathe(profile,r,h,segments=12){return new T.LatheGeometry(profile.map(([x,y])=>new T.Vector2(x*r,(y-.5)*h)),segments);}
function replace(mesh,geometry){const old=mesh.geometry;if(old.type==='BoxGeometry'){geometry.type='BoxGeometry';geometry.parameters={...geometry.parameters,...old.parameters};}old.dispose();mesh.geometry=geometry;geometry.computeBoundingBox();geometry.computeBoundingSphere();}
function furnitureUV(g){g.parameters??={};g.parameters.surfaceUvScale=1;const p=g.attributes.position,n=g.attributes.normal,uv=g.attributes.uv;for(let i=0;i<p.count;i++)uv.setXY(i,Math.abs(n.getX(i))>.5?p.getZ(i):p.getX(i),Math.abs(n.getY(i))>.5?p.getZ(i):p.getY(i));}
function chamferBox(w,h,d,r){
 const shape=new T.Shape(),points=[[-w/2+r,-h/2],[w/2-r,-h/2],[w/2,-h/2+r],[w/2,h/2-r],[w/2-r,h/2],[-w/2+r,h/2],[-w/2,h/2-r],[-w/2,-h/2+r]];
 points.forEach(([x,y],i)=>i?shape.lineTo(x,y):shape.moveTo(x,y));shape.closePath();
 const g=new T.ExtrudeGeometry(shape,{depth:d,bevelEnabled:false,steps:1});g.translate(0,0,-d/2);return g;
}
function bookGeometry(w,h,d,color){
 const parts=[box(w*.78,h*.94,d*.88,0,0,-d*.02,0xd5ccb5),
  colorGeometry(new T.PlaneGeometry(d,h).rotateY(-Math.PI/2).translate(-w/2,0,0),color),
  colorGeometry(new T.PlaneGeometry(d,h).rotateY(Math.PI/2).translate(w/2,0,0),color)];
 const levels=[-.5,-.36,-.34,.28,.30,.5];
 for(let i=0;i<levels.length-1;i++)parts.push(colorGeometry(new T.PlaneGeometry(w,(levels[i+1]-levels[i])*h).translate(0,(levels[i+1]+levels[i])*h/2,d/2),i===1||i===3?0xad9768:color));
 const geometry=merge(parts);geometry.parameters={bookFinish:{width:w,height:h,depth:d,coverColor:new T.Color(color).getHex()}};return geometry;
}
function storageGeometry(w,h,d,color){
 const turn=d>w,ww=turn?d:w,dd=turn?w:d;
 const parts=[box(ww,h-.04,dd-.045,0,.02,-.0225,color),box(ww*.94,.04,dd*.88,0,-h/2+.02,0,0x292c28)];
 const count=Math.max(1,Math.round(ww/.6)),cell=ww/count;
 for(let i=0;i<count;i++){
  const x=-ww/2+cell*(i+.5);
  parts.push(box(cell-.015,h-.10,.025,x,.02,dd/2-.035,color));
  const drawers=h<1.15?2:1;
  for(let row=0;row<drawers;row++){
   if(drawers>1)parts.push(box(cell-.03,.006,.002,x,-h*.04,dd/2-.021,0x302c25));
   parts.push(box(.018,Math.min(.18,h*.16),.015,x+cell*.32,drawers===1?0:h*(row?-.25:.22),dd/2-.008,0x8d9189));
  }
 }
 const geometry=merge(parts);if(turn)geometry.rotateY(Math.PI/2);return geometry;
}
export function polishVillaProps(map){
 const m=map.materials;
 m.propModel=new T.MeshStandardMaterial({color:0xffffff,vertexColors:true,roughness:.64});
 // Painted surfaces and fine-grained veneer are wood in the damage system.
 const original=[];map.scene.traverse(o=>{if(o.isMesh&&!o.userData.breakable)original.push(o);});
 for(const mesh of original){
  const p=mesh.geometry.parameters;if(!p)continue;
  const name=mesh.name;
  if(name==='Plant pot'){
   const r=p.radiusTop,h=p.height;
   const shell=colorGeometry(lathe([[0,0],[.7,0],[1,.92],[1,1],[.87,1],[.75,.18],[0,.18]],r,h,10),0x625c4f);
   const soil=colorGeometry(new T.CylinderGeometry(r*.84,r*.84,.008,12).translate(0,h*.38,0),0x302b21);
   replace(mesh,merge([shell,soil]));mesh.material=m.propModel;continue;
  }
  if(mesh.material===m.screen&&p.width>.5&&p.height>.3){
   if(!m.monitorDisplay){
    const size=128,data=new Uint8Array(size*size*4);
    for(let y=0;y<size;y++)for(let x=0;x<size;x++){
     let color=[21,38,46];if(x>7&&x<121&&y>9&&y<119)color=x<35?[40,57,65]:[62,79,83];
     if(y>109&&x>7&&x<121)color=[92,112,118];
     if(x>43&&x<111&&y>25&&y<99&&(y%14<3))color=[125,155,158];
     const i=(y*size+x)*4;data.set([...color,255],i);
    }
    const texture=new T.DataTexture(data,size,size);texture.colorSpace=T.SRGBColorSpace;texture.needsUpdate=true;
    m.monitorDisplay=new T.MeshStandardMaterial({map:texture,roughness:.5,emissive:0x152b32,emissiveIntensity:.35});
   }
   const uv=mesh.geometry.attributes.uv,pos=mesh.geometry.attributes.position;for(let i=0;i<uv.count;i++)uv.setXY(i,pos.getX(i)/p.width+.5,pos.getY(i)/p.height+.5);
   mesh.material=m.monitorDisplay;mesh.name='Monitor display';continue;
  }
  if(name==='Bound book'){
   const palette=[0x763c35,0x304952,0x68715a,0xa27b43,0x4b4855,0x465b4b,0x8c6550,0xc5b795],index=Math.abs(Math.round(mesh.position.x*731+mesh.position.y*379+mesh.position.z*151))%palette.length;
   replace(mesh,bookGeometry(p.width,p.height,p.depth,palette[index]));mesh.material=m.propModel;continue;
  }
  if(name==='Cabinet door'||name.startsWith('Cabinet ')||name.startsWith('Bookshelf ')){
   const parent=mesh.parent,white=mesh.material===m.white,metal=mesh.userData.physicalMaterial==='metal';
   if(!white&&!metal){const finish=parent.position.y>6?'furnitureWalnut':parent.position.x>0?'furnitureOak':'furnitureWalnut';mesh.material=m[finish];furnitureUV(mesh.geometry);}
   if(name==='Cabinet door'){
    replace(mesh,chamferBox(p.width,p.height,p.depth,.008));furnitureUV(mesh.geometry);
   }
   continue;
  }
  if(p.width&&p.height){
   if(name==='Bed platform'){mesh.material=m.furnitureWalnut;furnitureUV(mesh.geometry);continue;}
   if(mesh.userData.physicalMaterial==='cloth'&&p.height<.15&&p.width>1.5&&p.depth>1){replace(mesh,new RoundedBoxGeometry(p.width,p.height,p.depth,1,.035));continue;}

   if(name==='Villa table top'){
    replace(mesh,new RoundedBoxGeometry(p.width,p.height,p.depth,1,.025));furnitureUV(mesh.geometry);
    mesh.material=m[p.width>2?'furnitureWalnut':'furnitureOak'];continue;
   }
   if(mesh.material===m.wood&&p.height>.65&&p.height<2.8&&Math.min(p.width,p.depth)>.4&&(Math.max(p.width,p.depth)>1.2||mesh.position.y>6.8)){
    replace(mesh,storageGeometry(p.width,p.height,p.depth,0x70543e));mesh.material=m.propModel;mesh.name='Detailed storage cabinet';continue;
   }
   if(mesh.material===m.black&&p.width>.5&&p.height<.08&&p.depth>.15){
    const w=p.width,h=p.height,d=p.depth,parts=[box(w,h*.7,d,0,-h*.15,0,0x242b2d)];
    for(let row=0;row<4;row++)for(let col=0;col<12;col++)parts.push(box(w*.063,h*.3,d*.14,(col-5.5)*w*.078,h*.35,(row-1.5)*d*.21,0x555e60));
    parts.push(box(w*.32,h*.3,d*.12,0,h*.35,d*.42,0x555e60));
    replace(mesh,merge(parts));mesh.material=m.propModel;mesh.name='Keyboard with keycaps';continue;
   }
   if(mesh.material===m.black&&p.width>.6&&p.height>.3&&p.depth<.1){
    replace(mesh,merge([box(p.width,p.height,p.depth,0,0,0,0x252c2f),box(p.width*.08,p.height*.22,p.depth*.75,0,-p.height*.58,-p.depth*.2,0x747d7c),box(p.width*.38,.015,.16,0,-p.height*.7,-.03,0x30383a)]));mesh.material=m.propModel;mesh.name='Monitor with pedestal';continue;
   }
   if(mesh.material===m.white&&p.height>.1&&p.height<.35&&p.width>.6&&p.depth>.3){replace(mesh,new RoundedBoxGeometry(p.width,p.height,p.depth,1,Math.min(.08,p.height*.3)));continue;}
  }
  if(p.radiusTop===undefined||mesh.material!==m.white)continue;
  const r=p.radiusTop,h=p.height;
  if(Math.abs(r-.19)<.001&&Math.abs(h-.4)<.001){
   const g=lathe([[0,0],[.62,0],[.7,.045],[.58,.1],[.14,.15],[.12,.43],[1,.44],[.78,.94],[.78,.98],[0,1]],r,h);
   const positions=g.attributes.position,c=[];for(let i=0;i<positions.count;i++){const color=new T.Color(positions.getY(i)>-h*.06?0xe2d8bf:0x777366);c.push(color.r,color.g,color.b);}g.setAttribute('color',new T.Float32BufferAttribute(c,3));replace(mesh,g);mesh.material=m.propModel;mesh.name='Bedside lamp';
  }else if(Math.abs(r-.07)<.001&&Math.abs(h-.12)<.001){
   const cup=colorGeometry(lathe([[0,0],[.72,0],[.9,.06],[1,.92],[.98,1],[.85,1],[.82,.14],[0,.14]],r,h),0xe5e0d2);
   const handle=colorGeometry(new T.TorusGeometry(r*.43,r*.12,4,8).translate(r*.95,0,0),0xe5e0d2);
   replace(mesh,merge([cup,handle]));mesh.material=m.propModel;mesh.name='Hollow ceramic cup';
  }else if(h<.035&&r>=.1&&r<=.23){
   replace(mesh,lathe([[0,.12],[.65,.12],[1,.8],[1,1],[.64,.4],[0,.4]],r,h,10));mesh.name='Rimmed ceramic plate';
  }else if(name==='Ceramic vase'){
   replace(mesh,lathe([[0,0],[.55,0],[.9,.12],[1,.45],[.92,.75],[.6,1],[0,1]],r,h));
  }
 }
}
