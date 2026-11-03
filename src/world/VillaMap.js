import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import {Sky} from 'three/examples/jsm/objects/Sky.js';
import {mergeGeometries} from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {batchVillaPanels,batchVillaProps} from './VillaPanelBatch.js';
import {upgradeVillaMaterials} from './VillaMaterials.js';
import {buildVillaInteriors,buildGalleryWing,SOLSTICE_ROOMS} from './VillaInteriors.js';
import {projectFloorMark,surfaceRevision,removeSurfaceMark} from './SurfaceDecal.js';
import {VillaPanel} from './VillaPanel.js';
import {DebrisPool} from './DebrisPool.js';
import {buildWellnessWing} from './VillaWellness.js';
import {buildPool,cutSlab,addWater} from './VillaWater.js';
import {registerFloorFixture,settleFloorFixtures,rectangularFeet,bindFixtureDecor} from './FloorFixtures.js';
import {TimberFloor} from './TimberFloor.js';
import {supportHeight} from './SupportIndex.js';
import {materialPart} from './MaterialProps.js';
import {BlastScars} from './BlastScars.js';
import {physicalMaterial,blastImpact,propBlastImpact} from './PhysicalMaterials.js';
import {EnvironmentSystem} from '../environment/EnvironmentSystem.js';
import {VISUAL_MATERIALS} from '../environment/MaterialCatalog.js';
import {countertop,bookshelf as buildBookshelf} from '../environment/ConstructionPrefabs.js';
import {LiquidSystem} from '../environment/LiquidSystem.js';
import {accelerateSceneRaycasts} from '../environment/RaycastCache.js';
import {WorldRayQuery} from '../environment/WorldRayQuery.js';
import {createDestructionPipeline} from '../environment/DestructionPipeline.js';

const V=(x,y,z)=>new THREE.Vector3(x,y,z);
export const VILLA_LEVELS=[0,3.4,6.8];
export const VILLA_ROOMS=SOLSTICE_ROOMS;
function texture(kind){
 const n=128,data=new Uint8Array(n*n*4);let seed=91;
 for(let y=0;y<n;y++)for(let x=0;x<n;x++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;const noise=(seed>>>24)/255;
 const grain=kind==='wood'?Math.sin(x*.44+Math.sin(y*.08)*1.8)*9:kind==='stone'?(x%42<2||y%24<2?-25:0):kind==='tile'?(x%64<2||y%64<2?-35:0):0;
 const base=kind==='wood'?[124,85,51]:kind==='stone'?[173,164,145]:kind==='tile'?[198,195,184]:[209,205,193];const i=(y*n+x)*4;for(let c=0;c<3;c++)data[i+c]=base[c]+grain+(noise-.5)*12;data[i+3]=255;}
 const t=new THREE.DataTexture(data,n,n);t.colorSpace=THREE.SRGBColorSpace;t.wrapS=t.wrapT=THREE.RepeatWrapping;t.needsUpdate=true;return t;
}
export class VillaMap{
 constructor(scene){
  Object.assign(this,{scene,colliders:[],jumpPads:[],panels:[],levels:VILLA_LEVELS,shadowsDirty:true,canInteract:false,glassPanes:[],activeDoor:null,name:'VILLA SOLSTICE',id:'villa'});
  this.destruction=createDestructionPipeline(this);
  this.spawn=V(5,0,30);this.spawnYaw=0;this.botSpawns=[V(-8,0,5),V(-7,3.4,5),V(6,3.4,-5),V(-7,6.8,-5),V(7,6.8,5)];
  this.materials={};const mat=(name,color,roughness=.8,extra={})=>this.materials[name]=new THREE.MeshStandardMaterial({color,roughness,...extra});
  mat('plaster',0xf0eadb,.93,{map:texture('plaster')});mat('stone',0xe2d5bc,.9,{map:texture('stone')});mat('concrete',0x9c9c91,.95);mat('darkStone',0x383b37,.88);mat('wood',0xc9a376,.65,{map:texture('wood')});mat('woodPanel',0xd7b58d,.8,{map:texture('wood'),vertexColors:true});mat('softWall',0xe3d7c0,.92,{vertexColors:true});
  mat('metal',0x292d2a,.45,{metalness:.65});mat('steel',0xa1a8a2,.34,{metalness:.75});mat('glass',0x9fc9bd,.16,{transparent:true,opacity:.23,side:THREE.DoubleSide,depthWrite:false,vertexColors:true});mat('tile',0xf2ede1,.65,{map:texture('tile')});mat('fabric',0xc6bda7,.97);mat('ochre',0x976c3d,.95);mat('navy',0x344c51,.92);mat('white',0xede9dd,.65);mat('black',0x171c1c,.5);mat('grass',0x61724b,1);mat('leaf',0x465d39,.95);mat('leafLight',0x6d794d,.95);mat('earth',0x82775c,1);mat('water',0x3c9398,.16,{metalness:.4,transparent:true,opacity:.83});mat('red',0x7b3e32,.8);mat('screen',0x315762,.45,{emissive:0x21424a,emissiveIntensity:.45});
  for(const n of ['wood','woodPanel'])this.materials[n].userData.surface='wood';for(const n of ['metal','steel'])this.materials[n].userData.surface='metal';this.materials.glass.userData.surface='glass';
  upgradeVillaMaterials(this);
  this.debris=new DebrisPool(scene,new THREE.CylinderGeometry(1,.8,1,5),mat('debris',0xffffff,.95),1024,{groundHeight:(point,ceiling)=>this.rubbleFloor(point,ceiling),supportOwner:()=>this.lastSupportMesh,supportRevision:()=>`${this.colliders.supportRevision||0}:${this.colliders.length}`,supportInterval:.05,supportTravel:.12});
  this.blastDust=new DebrisPool(scene,new THREE.IcosahedronGeometry(1,1),new THREE.MeshBasicMaterial({color:0xc5bbae,transparent:true,opacity:.12}),64);
  this.blastScars=new BlastScars();
  this.environment=new EnvironmentSystem(this);
  this.liquids=new LiquidSystem(this);
  this.seatingSpecs=[];this.decor=[];this.wallSpecs=[];this.artRequests=[];this.artMounts=[];this.floorSurfaces=[];this.floorOverlays=[];this.rugSpecs=[];this.roomLights=[];this.lighting();this.site();this.shell();buildVillaInteriors(this);buildGalleryWing(this);buildWellnessWing(this);this.garden();this.finishArchitecture();this.roomFinishes();this.mountArtwork();this.projectRugs();bindFixtureDecor(this);this.environment.observeScene();this.contactShadows();this.batchDecor();batchVillaPanels(this);batchVillaProps(this);accelerateSceneRaycasts(this.scene);
 }
 box(x,y,z,w,h,d,material='plaster',solid=true,decor=false,options={}){
  if(material==='marble'&&h<.2&&!options.unlayered)return countertop(this,{x,y,z,width:w,height:h,depth:d,material});
  const geometry=['fabric','ochre','linen','leather'].includes(material)&&h>.4&&Math.max(w,d)>.4?new RoundedBoxGeometry(w,h,d,2,Math.min(.06,h*.25)):new THREE.BoxGeometry(w,h,d),uv=geometry.attributes.uv,p=geometry.attributes.position,n=geometry.attributes.normal;
  for(let i=0;i<uv.count;i++)uv.setXY(i,(Math.abs(n.getX(i))>.5?p.getZ(i):p.getX(i))/2,(Math.abs(n.getY(i))>.5?p.getZ(i):p.getY(i))/2);
  const mesh=new THREE.Mesh(geometry,this.materials[material]);mesh.position.set(x,y,z);mesh.castShadow=true;mesh.receiveShadow=true;mesh.userData.isShootable=true;this.scene.add(mesh);
  const type=VISUAL_MATERIALS[material];
  if(type)materialPart(mesh,type);
  if(type==='cloth'&&!solid&&Math.max(w,h,d)<1)mesh.userData.looseItem=true;
  if(solid){const box=new THREE.Box3().setFromObject(mesh);box.supportMesh=mesh;mesh.userData.collider=box;this.colliders.push(box);}
  if(decor)this.decor.push(mesh);return mesh;
 }
 cylinder(x,y,z,r,h,material='metal',decor=true){const mesh=new THREE.Mesh(new THREE.CylinderGeometry(r,r,h,12),this.materials[material]);mesh.position.set(x,y,z);mesh.castShadow=true;mesh.receiveShadow=true;materialPart(mesh,material==='white'?'ceramic':VISUAL_MATERIALS[material]||'concrete');if(material==='white')mesh.userData.looseItem=true;this.scene.add(mesh);if(decor)this.decor.push(mesh);return mesh;}
 panel(x,y,z,width,height,rotation=0,kind='wood',door=false,name='Panel'){
  const p=new VillaPanel(this,{x,y,z,width,height,rotation,kind,door,name});p.baseRotation=rotation;return p;
 }
 // Walls are built around openings, never concealed solid boxes behind doors/windows.
 wall(axis,coord,from,to,base,openings=[],material='plaster',soft=false){
  openings=openings.map(o=>o.kind==='door'?{...o,width:o.width<2?Math.max(1.35,o.width>1.6?1.45:1.35):o.width,height:Math.min(o.height||2.3,2.3)}:{...o});
  this.wallSpecs.push({axis,coord,from,to,base,openings:openings.map(o=>({...o}))});
  const height=3.17,rotation=axis==='x'?Math.PI/2:0;
  const solid=(a,b,low,high)=>{if(b-a<.01||high-low<.01)return;const center=(a+b)/2;
   if(soft&&high-low>.3){
    const count=Math.max(1,Math.ceil((b-a)/2.8));
    for(let i=0;i<count;i++){const start=a+(b-a)*i/count,width=(b-a)/count;this.panel(axis==='x'?coord:start,base+low,axis==='x'?start:coord,width,high-low,axis==='x'?-Math.PI/2:0,'plaster',false,'Soft plaster wall');}
    return;
   }
   this.box(axis==='x'?coord:center,base+(high+low)/2,axis==='x'?center:coord,axis==='x'?.22:b-a,high-low,axis==='x'?b-a:.22,material);
  };
  // Side-wall panels use a -90 degree basis so their local +X follows world +Z.
  const panelAt=(opening)=>{const center=opening.at,w=opening.width,low=opening.sill||0,h=opening.height||2.3;
   const x=axis==='x'?coord:center-w/2,z=axis==='x'?center-w/2:coord,rot=axis==='x'?-Math.PI/2:0;
   if(opening.kind==='door'&&w>=2){
    const left=this.panel(x,base+low,z,w/2,h,rot,'wood',true,opening.name||'Door');
    const right=this.panel(axis==='x'?x:x+w,base+low,axis==='x'?z+w:z,w/2,h,rot+Math.PI,'wood',true,opening.name||'Door');left.partner=right;right.partner=left;
   }else if(opening.kind!=='open')this.panel(x,base+low,z,w,h,rot,opening.kind==='glass'?'glass':'wood',opening.kind==='door',opening.name||'Door');
   for(const offset of [-w/2,w/2]){
    const trim=this.box(axis==='x'?coord:center+offset,base+low+h/2,axis==='x'?center+offset:coord,axis==='x'?.28:.07,h+.12,axis==='x'?.07:.28,'metal',false,true);trim.name='Door frame';
    trim.userData.wallAttachment=[.3,h/2,h-.3].map(yy=>V(axis==='x'?coord:center+offset+Math.sign(offset)*.12,base+low+yy,axis==='x'?center+offset+Math.sign(offset)*.12:coord));
   }
   const lintel=this.box(axis==='x'?coord:center,base+low+h+.04,axis==='x'?center:coord,axis==='x'?.28:w+.14,.08,axis==='x'?w+.14:.28,'metal',false,true);lintel.name='Door frame';lintel.userData.wallAttachment=[V(axis==='x'?coord:center,base+low+h+.17,axis==='x'?center:coord)];
  };
  let cursor=from;for(const o of [...openings].sort((a,b)=>a.at-b.at)){const a=o.at-o.width/2,b=o.at+o.width/2;solid(cursor,a,0,height);solid(a,b,0,o.sill||0);solid(a,b,(o.sill||0)+(o.height||2.3),height);panelAt(o);cursor=b;}solid(cursor,to,0,height);
 }
 floor(y){
  const zones=[[-11,-7,-8.8,-4.8,'Archive breach floor'],[4,8,4.5,8.5,'Lounge breach floor'],[-10,-6,4,7,'Suite breach floor']];
  const gaps=[[-1.3,1.3,-8,-1],[10.45,12.55,-8,-1],[-11,-9,-8.8,-6.8]];
  const cuts=[...gaps,...zones];let rectangles=[[-14,14,-11,11]];
  for(const [x0,x1,z0,z1] of cuts){const next=[];for(const [a,b,c,d] of rectangles){const l=Math.max(a,x0),r=Math.min(b,x1),near=Math.max(c,z0),far=Math.min(d,z1);if(l>=r||near>=far){next.push([a,b,c,d]);continue;}if(a<l)next.push([a,l,c,d]);if(r<b)next.push([r,b,c,d]);if(c<near)next.push([l,r,c,near]);if(far<d)next.push([l,r,far,d]);}rectangles=next;}
  for(const [a,b,c,d] of rectangles){
   const floorMat=y===6.8?'oakFloor':a>2.4&&d<-1?'tile':a<-2?'oakFloor':'stone',timber=floorMat==='oakFloor';
   const slab=this.box((a+b)/2,y-.12-(timber?.018:0),(c+d)/2,b-a,.24,d-c,'concrete');
   const finish=this.box((a+b)/2,timber?y-.009:y+.002,(c+d)/2,b-a,timber?.018:.004,d-c,floorMat,timber,true);
   if(timber){finish.name='Timber floor finish over concrete';finish.userData.thickness=.018;finish.userData.construction='finish';finish.userData.grainAxis='z';}
   this.floorSurfaces.push(timber?finish:slab);
  }
  new TimberFloor(this,{x:-11,y,z:-6.8,width:2,depth:2,name:y===3.4?'Cellar floor hatch':'Study floor hatch'});
  // Broad timber floor zones sit over actual slab openings, with no hidden backing.
  for(const [a,b,c,d,name] of zones){let pieces=[[a,b,c,d]];for(const [x0,x1,z0,z1] of gaps){const next=[];for(const [l,r,n,f] of pieces){if(x0>=r||x1<=l||z0>=f||z1<=n){next.push([l,r,n,f]);continue;}if(l<x0)next.push([l,x0,n,f]);if(x1<r)next.push([x1,r,n,f]);if(n<z0)next.push([Math.max(l,x0),Math.min(r,x1),n,z0]);if(z1<f)next.push([Math.max(l,x0),Math.min(r,x1),z1,f]);}pieces=next;}
   for(const [l,r,n,f] of pieces){new TimberFloor(this,{x:l,y,z:f,width:r-l,depth:f-n,name});}
  }
 }
 stairs(x,base,z,length=7,width=2.4,rise=3.4,name='Staircase'){
  for(let i=0;i<20;i++){const h=(i+1)*rise/20;this.box(x,base+h-.13,z+length/2-(i+.5)*length/20,width,.26,length/20,'stone',false,true);}
  const box=new THREE.Box3(V(x-width/2,base,z-length/2),V(x+width/2,base+rise,z+length/2));box.ramp={position:V(x,base,z),rotation:0,width,length,height:rise,thickness:.26};box.stairName=name;this.colliders.push(box);
  // Slim sloping handrails and regularly spaced balusters.
  for(const side of [-1,1]){for(let i=0;i<=10;i++){const zz=z+length/2-i*length/10,yy=base+i*rise/10;this.box(x+side*(width/2-.05),yy+.5,zz,.04,1,.04,'metal',false,true);}
   const rail=this.box(x+side*(width/2-.05),base+rise/2+1,z,.055,.055,Math.hypot(length,rise),'metal',false);rail.rotation.x=Math.atan(rise/length);this.decor.push(rail);}
 }
 lighting(){
  const sky=new Sky();sky.scale.setScalar(400);sky.material.uniforms.turbidity.value=4;sky.material.uniforms.rayleigh.value=1.8;sky.material.uniforms.sunPosition.value.set(-35,42,26).normalize();this.scene.add(sky);this.scene.background=new THREE.Color(0xc8d6d6);this.scene.fog=new THREE.Fog(0xc8d6d6,85,180);
  this.scene.add(new THREE.HemisphereLight(0xc1d7ed,0x675344,.85));this.scene.add(new THREE.AmbientLight(0xffffff,.08));
  const sun=new THREE.DirectionalLight(0xffdfac,3.6);sun.position.set(-35,42,26);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-45,right:45,top:45,bottom:-45,near:1,far:120});sun.shadow.bias=-.00035;sun.shadow.normalBias=.012;this.scene.add(sun);
 }
 lamp(x,y,z){
  this.box(x,y+.08,z,.24,.08,.24,'metal',false,true);
  const light=new THREE.PointLight(0xffd4a0,17,8,2);light.position.set(x,y-.08,z);this.scene.add(light);this.roomLights.push(light);
  if((Math.abs(x+10)<.1&&y>6&&y<7)||(Math.abs(x-6)<.1&&y>6&&y<7)){const spot=new THREE.SpotLight(0xffd4a0,24,8,1.25,.7,2);spot.position.set(x,y-.1,z);spot.target.position.set(x,y-3,z);spot.castShadow=true;spot.shadow.mapSize.set(512,512);spot.shadow.bias=-.0003;this.scene.add(spot,spot.target);light.intensity=6;light.userData.linkedSpot=spot;}
  const bulb=new THREE.Mesh(new THREE.SphereGeometry(.09,8,6),new THREE.MeshBasicMaterial({color:0xffe6b8}));bulb.position.set(x,y-.05,z);bulb.userData={isShootable:true,surface:'glass',breakableLight:{lights:light.userData.linkedSpot?[light,light.userData.linkedSpot]:[light],broken:false}};this.scene.add(bulb);
 }
 site(){
  this.box(0,-.16,0,100,.3,100,'earth');this.box(0,-.015,22,50,.06,24,'concrete');
  for(const x of [-25,31]){this.box(x,2.85,-13,.35,5.7,44,'stone');this.box(x,1.15,22,.35,2.3,26,'stone');}this.box(3,2.85,-35,56,5.7,.35,'stone');this.box(3,1.15,35,56,2.3,.35,'stone');
  // Terraced garden sits level with the main floor; the front retains a lower garage court.
  cutSlab(this,[-22,22,-33,-11],1.58,3.16,'earth');cutSlab(this,[-17,17,-29,-11],3.32,.16,'stone');
  this.box(-21,1.58,-1,6,3.16,20,'earth');this.box(27,1.58,-1,6,3.16,20,'earth');
  this.stairs(0,0,16.5,7,4.8,3.4,'Front approach');this.box(0,3.28,12,5,.24,2.3,'stone');
  this.stairs(-16.5,0,10.1,7,2.5,3.4,'Garden stair');this.box(-16.5,3.28,-1.675,2.5,.24,16.65,'stone');
  this.stairs(16.5,0,10.1,7,2.5,3.4,'Service approach');this.box(16.5,3.28,4.325,2.5,.24,4.65,'stone');
  // Side entries meet a landing instead of opening onto the gap beside a flight.
  for(const side of [-1,1]){
   this.box(side*15.25,3.28,5,2.5,.24,3.2,'stone');
   this.box(side*17.8,3.9,5,.08,1,3.2,'metal');this.box(side*14.55,3.9,6.65,1.1,1,.08,'metal');
  }
  for(let i=0;i<8;i++)this.box(7,0.025,20+i*1.5,2.8,.055,.7,'stone',false,true);
 }
 shell(){
  this.box(0,-.1,0,28,.2,22,'concrete');this.floor(3.4);this.floor(6.8);
  // Guard the open sides, leaving the top and bottom landings unobstructed.
  // Side-room entries meet the rear landing instead of the middle of a flight.
  for(const y of [3.4,6.8])for(const [x,width] of [[0,2.6],[11.5,2.1]])for(const side of [-1,1]){
   const xx=x+side*width/2;
   for(const h of [.12,1.08])this.box(xx,y+h,-4.5,.05,.05,7,'metal',false,true);
   for(let z=-8;z<=-1;z+=.5)this.box(xx,y+.55,z,.035,1.1,.035,'metal',false,true);
   const guard=new THREE.Box3(V(xx-.035,y,-8),V(xx+.035,y+1.1,-1));guard.stairGuard=true;this.colliders.push(guard);
  }
  // The upper floor has no ascending flight beyond this edge. Close its front
  // lip so the only descent starts at the supported rear landing.
  for(const [x,w] of [[0,2.6],[11.5,2.1]]){
   for(const h of [.12,1.08])this.box(x,6.8+h,-1,w,.05,.05,'metal',false,true);
   for(let xx=x-w/2;xx<=x+w/2;xx+=.35)this.box(xx,7.35,-1,.035,1.1,.035,'metal',false,true);
   const guard=new THREE.Box3(V(x-w/2,6.8,-1.035),V(x+w/2,7.9,-.965));guard.stairGuard=true;this.colliders.push(guard);
  }
  // Roof above stair openings closes the structure and creates deep eaves.
  this.box(0,10.1,0,29,.24,23,'plaster');
  for(const y of [0,3.4,6.8]){
   const front=y===0?[{at:-8,width:5.6,height:2.7,kind:'open'},{at:0,width:1.6,kind:'door',name:'Basement entry'},{at:8,width:3.8,height:1.1,sill:1,kind:'glass'}]:[{at:-8,width:7,height:2.2,sill:.65,kind:'glass'},{at:0,width:1.7,height:2.5,kind:'door',name:y===3.4?'Main entrance':'Balcony door'},{at:8,width:7,height:2.2,sill:.65,kind:'glass'}];
   this.wall('z',11,-14,14,y,front,y===0?'darkStone':'plaster',y>0);
   this.wall('z',-11,-14,14,y,y===0?[]:[{at:-8,width:5,height:2.5,sill:y===0?.5:.1,kind:'glass'},{at:0,width:1.8,height:2.5,kind:'door',name:'Terrace access'},{at:7,width:4,height:2.1,sill:.7,kind:'glass'}],y===0?'concrete':'stone');
   for(const x of [-14,14])this.wall('x',x,-11,11,y,[{at:x===14?-9.3:-5,width:x===14?2.4:y===3.4?2.2:3,height:x===14||y===3.4?2.5:1.9,sill:x===14||y===3.4?0:.8,kind:x===14?(y===3.4?'open':'door'):y===3.4?'open':'glass',name:'Gallery connection'},{at:5,width:2.4,height:2.4,kind:y===3.4?'door':'glass',sill:y===3.4?0:.4,name:'Side entry'}],x<0?'stone':'plaster',y>0);
   if(y<6.8){this.stairs(0,y,-4.5,7,2.4,3.4,'Main staircase');this.stairs(11.5,y,-4.5,7,2.0,3.4,'Service staircase');}
   // Structural piers read as the permanent skeleton, soft infill stays separately destructible.
   for(const x of [-14,-2.7,2.7,14])for(const z of [-11,11])this.box(x,y+1.56,z,.32,3.12,.32,'stone');
  }
  // Cantilevered front balcony, continuous parapet and timber soffit.
  this.box(0,6.63,12.2,28.8,.3,2.6,'plaster');this.box(0,6.43,12.2,28,.08,2.4,'wood',false,true);
  for(const z of [13.4]){this.box(0,7.25,z,28,.07,.07,'metal',false,true);this.box(0,7.73,z,28,.06,.06,'metal',false,true);for(let x=-13.8;x<=14;x+=1.4)this.box(x,7.15,z,.035,1.1,.035,'metal',false,true);}
  for(const x of [-14,14])this.box(x,7.15,12.2,.08,1.1,2.6,'metal');
  for(let x=-13.3;x<-10.6;x+=.32)this.box(x,8.45,11.28,.12,3,.35,'wood',false,true);
  this.box(0,6.63,-12.2,28.8,.3,2.6,'plaster');
  for(const y of [7.25,7.73])this.box(0,y,-13.4,28,.06,.06,'metal',false,true);
  for(let x=-13.8;x<=14;x+=1.4)this.box(x,7.15,-13.4,.035,1.1,.035,'metal',false,true);
  for(const x of [-14,14])this.box(x,7.15,-12.2,.08,1.1,2.6,'metal');
  for(const z of [-13.4,13.4]){const guard=new THREE.Box3(V(-14,6.8,z-.04),V(14,7.85,z+.04));guard.balconyGuard=true;this.colliders.push(guard);}
  this.box(0,10.38,0,30,.25,24,'darkStone');
  for(const y of [3.2,6.6])this.box(0,y,11.2,28.8,.18,.45,'darkStone',false,true);
 }
 chairFacing(x,y,z,tx,tz){const seat=this.chair(x,y,z,Math.atan2(tx-x,tz-z));this.seatingSpecs.push({type:'chair',x,y,z,tx,tz,object:seat.parent});return seat;}
 sofaFacing(x,y,z,w,tx,tz){const object=this.sofa(x,y,z,w,Math.atan2(tx-x,tz-z));this.seatingSpecs.push({type:'sofa',x,y,z,tx,tz,object});return object;}
 sofa(x,y,z,w,rotation){const group=new THREE.Group();this.scene.add(group);const part=(a,b,c,ww,h,d,mat)=>{const m=this.box(a,b,c,ww,h,d,mat,true);this.scene.remove(m);group.add(m);return m;};
  const meshes=[part(0,.28,0,w,.45,1,'fabric'),part(0,.73,-.42,w,.7,.22,'fabric')];for(const side of [-1,1])meshes.push(part(side*(w/2-.12),.55,0,.24,.7,1.1,'fabric'));
  for(const a of [-1,1])for(const c of [-1,1]){const leg=this.box(a*(w/2-.2),.03,c*.33,.08,.06,.08,'metal',false,true);leg.removeFromParent();group.add(leg);leg.userData.decorOwner=meshes[0];}
  for(let i=0;i<Math.floor(w);i++)meshes.push(part(-w/2+.55+i,.55,.04,.88,.17,.8,'fabric'));
  group.position.set(x,y,z);group.rotation.y=rotation;group.updateMatrixWorld(true);for(const m of meshes)m.userData.collider.setFromObject(m);registerFloorFixture(this,group,meshes,rectangularFeet(w-.4,.66));return group;
 }
 table(x,y,z,w,d,h){
  const group=new THREE.Group();group.position.set(x,y,z);this.scene.add(group);
  const top=this.box(0,h,0,w,.12,d,'wood');top.removeFromParent();group.add(top);
  for(const a of [-1,1])for(const b of [-1,1]){const leg=this.box(a*(w/2-.18),h/2,b*(d/2-.15),.08,h,.08,'metal',false,true);leg.removeFromParent();group.add(leg);leg.userData.decorOwner=top;}
  const tray=this.box(Math.min(.4,Math.max(0,w/2-.23)),h+.08,0,.4,.06,.28,'ochre',false,true);tray.removeFromParent();group.add(tray);tray.userData.decorOwner=top;
  group.updateMatrixWorld(true);top.userData.collider.setFromObject(top);registerFloorFixture(this,group,[top],rectangularFeet(w-.36,d-.3));return top;
 }
 chair(x,y,z,rot=0){
  const group=new THREE.Group();group.position.set(x,y,z);group.rotation.y=rot;this.scene.add(group);const solids=[];
  const part=(a,b,c,w,h,d,mat,solid)=>{const mesh=this.box(a,b,c,w,h,d,mat,solid,!solid);mesh.removeFromParent();group.add(mesh);if(solid)solids.push(mesh);return mesh;};
  const seat=part(0,.46,0,.62,.12,.6,'ochre',true);part(0,.84,-.27,.62,.72,.08,'ochre',true);
  const legs=[];for(const a of [-1,1])for(const b of [-1,1]){const leg=part(a*.24,.22,b*.23,.04,.44,.04,'walnut',false);leg.userData.woodHealth=65;leg.userData.supportLeg=true;legs.push(leg);}group.userData.supportParts=legs;group.userData.supportDrop=.4;
  group.updateMatrixWorld(true);for(const mesh of solids)mesh.userData.collider.setFromObject(mesh);registerFloorFixture(this,group,solids,rectangularFeet(.48,.46));return seat;
 }
 bedroom(x,y,z,guest=false){
  this.box(x,y+.25,z,guest?2:2.4,.5,2.9,'wood');materialPart(this.box(x,y+.58,z,guest?1.96:2.36,.28,2.85,'white'),'cloth');materialPart(this.box(x,y+.76,z+.4,guest?2:2.4,.12,1.8,guest?'navy':'ochre',false,true),'cloth');
  this.box(x,y+.85,z-1.5,guest?2.8:3.4,1.5,.18,'fabric');for(const a of [-1,1]){materialPart(this.box(x+a*.55,y+.79,z-.9,.85,.14,.55,'white',false,true),'cloth');this.box(x+a*1.9,y+.37,z-1,.75,.74,.7,'wood');this.cylinder(x+a*1.9,y+.95,z-1,.19,.4,'white');}
  this.art(x,y+2.25,10.84,2.4,.9);this.box(x>0?13.4:-13.4,y+1.3,z-2.5,.85,2.6,3.6,'wood');this.plant(x-3,y,z+2,.4);
 }
 study(x,y,z){this.table(x,y,z,3,1.3,.8);this.chairFacing(x,y,z-1.1,x,z);this.box(x,y+1.15,z,.95,.6,.05,'black',false,true);this.box(x,y+1.16,z+.032,.85,.49,.015,'screen',false,true);this.box(x,y+.88,z+.3,.65,.04,.23,'black',false,true);this.bookshelf(-13.4,y,-6,5,Math.PI/2);this.art(x,y+2.1,-10.84,2.7,1.2,Math.PI);this.plant(-4,y,-9,.4);}
 bookshelf(x,y,z,w,rot=0){
  return buildBookshelf(this,{x,y,z,width:w,rotation:rot});
 }
 basement(){
  // Low-profile vehicle built as cover, workbench, tool wall and storage.
  this.box(-8,.65,5,2.3,.8,4.8,'navy');this.box(-8,1.22,4.8,2,.8,2.4,'navy');this.box(-8,1.4,6.05,1.8,.5,.04,'black',false,true);
  for(const x of [-9.15,-6.85])for(const z of [3.5,6.5]){const wheel=this.cylinder(x,.42,z,.4,.22,'black');wheel.rotation.z=Math.PI/2;}
  this.table(-12,0,0,2.8,1,.95);for(let i=0;i<6;i++)this.box(-13.45,.25+i*.3,-5,1, .08,6,'wood');
  for(let i=0;i<9;i++)for(let j=0;j<3;j++)this.cylinder(-13.2+j*.26,.35+(i%3)*.35,-7+Math.floor(i/3)*1.1,.09,.26,'red');
  for(const x of [5,7.2]){this.box(x,.55,7,1.8,1.1,1.4,'white');this.cylinder(x,.61,7.74,.36,.06,'black').rotation.x=Math.PI/2;}
  this.box(13,.9,5,1.2,1.8,3.5,'steel');this.box(6,1,-7,2,2,1.2,'metal');for(let i=0;i<6;i++)this.box(6, .3+i*.3,-6.35,1.7,.07,.04,'screen',false,true);
  for(const x of [7.5,9.2])for(const z of [-7,-4])this.box(x,.5,z,1.25,1,1.2,'wood');
  for(const z of [-8,-5])this.cylinder(13.5,2.8,z,.12,6,'steel').rotation.x=Math.PI/2;
 }
 plant(x,y,z,r=.4){
  const pot=this.cylinder(x,y+r*.55,z,r*.62,r*1.1,'darkStone');
  for(let i=0;i<11;i++){
   const angle=i*2.399,length=r*(1.5+(i%4)*.28),width=r*(.26+(i%3)*.05),positions=[],uv=[];
   for(let j=0;j<8;j++){const t=j/7,half=Math.sin(Math.PI*t)*width;for(const side of [-1,1]){positions.push(side*half,t*length,Math.sin(t*Math.PI)*length*.2);uv.push(side<0?0:1,t);}}
   const indices=[];for(let j=0;j<7;j++){const a=j*2;indices.push(a,a+1,a+2,a+1,a+3,a+2);}
   const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geometry.setIndex(indices);geometry.computeVertexNormals();
   const material=this.materials[i%3?'leaf':'leafLight'];material.side=THREE.DoubleSide;
   const leaf=new THREE.Mesh(geometry,material);leaf.position.set(x+Math.sin(angle)*r*.1,y+r*.9,z+Math.cos(angle)*r*.1);leaf.quaternion.setFromUnitVectors(V(0,1,0),V(Math.sin(angle)*.6,.8,Math.cos(angle)*.6).normalize());leaf.rotateY(angle);leaf.castShadow=true;this.scene.add(leaf);this.decor.push(leaf);
  }
 }
 art(x,y,z,w,h,rotation=0){
  this.artRequests.push({x,y,z,w,h,rotation});
 }
 mountArtwork(){
  for(const request of this.artRequests){
   let {x,y,z,w,h}=request;
   // Prefer internal partitions when an exterior wall is mostly glazing.
   if(Math.abs(z)>10&&x<14&&Math.abs(x)>2.4){const level=Math.floor(y/3.4)*3.4;if(level===3.4)z=x<0?(z>0?2.64:2.36):-1.36;else if(level===6.8)z=x<0?(z>0?.14:-.14):4.14;}
   const candidates=[];
   for(const wall of this.wallSpecs){
    if(wall.axis!=='z'||Math.abs(wall.coord-z)>.3||y-h/2<wall.base+.2||y+h/2>wall.base+3.05)continue;
    let spans=[[wall.from,wall.to]];
    for(const o of wall.openings){if(y-h/2>wall.base+(o.sill||0)+(o.height||2.3)+.18||y+h/2<wall.base+(o.sill||0)-.18)continue;
     const a=o.at-o.width/2-.22,b=o.at+o.width/2+.22;
     spans=spans.flatMap(([l,r])=>b<=l||a>=r?[[l,r]]:[[l,Math.max(l,a)],[Math.min(r,b),r]].filter(([l,r])=>r>l));
    }
    for(const [l,r] of spans){if(r-l<w+.3)continue;const xx=THREE.MathUtils.clamp(x,l+w/2+.15,r-w/2-.15);
     if(this.artMounts.some(p=>p.wall===wall&&Math.abs(p.x-xx)<(p.w+w)/2+.2&&Math.abs(p.y-y)<(p.h+h)/2+.15))continue;
     candidates.push({wall,x:xx,score:Math.abs(xx-x)});
    }
   }
   candidates.sort((a,b)=>a.score-b.score);const mount=candidates[0];if(!mount)continue;
   const front=z>=mount.wall.coord?1:-1;x=mount.x;z=mount.wall.coord+front*.145;
   this.artMounts.push({...request,x,z,wall:mount.wall});this.paintArtwork(x,y,z,w,h,front);
  }
 }
 paintArtwork(x,y,z,w,h,front){
  this.box(x,y,z,w+.1,h+.1,.04,'metal',false,true);
  if(typeof document==='undefined')return;
  const canvas=document.createElement('canvas');canvas.width=512;canvas.height=320;const c=canvas.getContext('2d');c.fillStyle='#d6c8ad';c.fillRect(0,0,512,320);
  for(let i=0;i<7;i++){c.fillStyle=['#6d7f7c','#343e41','#ad8253','#dccfb5'][i%4];c.beginPath();c.ellipse(60+i*75,150+Math.sin(i*3)*75,70+i*5,100,Math.sin(i),0,Math.PI*2);c.fill();}
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;const mat=new THREE.MeshStandardMaterial({map:texture,roughness:.9,side:THREE.DoubleSide});const picture=new THREE.Mesh(new THREE.PlaneGeometry(w,h),mat);picture.position.set(x,y,z+front*.027);this.scene.add(picture);
 }
 sign(text,x,y,z,rotation=0){if(typeof document==='undefined')return;const canvas=document.createElement('canvas');canvas.width=512;canvas.height=128;const c=canvas.getContext('2d');c.fillStyle='#222b29';c.fillRect(0,0,512,128);c.fillStyle='#e5d5b1';c.font='bold 46px sans-serif';c.textAlign='center';c.fillText(text,256,81);const mesh=new THREE.Mesh(new THREE.PlaneGeometry(1.2,.3),new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(canvas),side:THREE.DoubleSide}));mesh.position.set(x,y,z);mesh.rotation.y=rotation;this.scene.add(mesh);}
 garden(){
  // Pool and timber deck. Water covers a solid shallow basin so there is no invisible fall.
  buildPool(this);
  for(const x of [-13,-2.5]){this.box(x,3.7,-20,.9,.28,3,'white');this.box(x,3.88,-20.9,.9,.15,1,'fabric',false,true);}
  this.box(8,3.46,-18,9,.14,9,'wood');for(const x of [4,12])for(const z of [-14,-22])this.box(x,4.9,z,.14,3,.14,'wood');for(let z=-22;z<=-14;z+=.5)this.box(8,6.5,z,8.5,.16,.16,'wood',false,true);
  this.sofaFacing(8,3.5,-20,4,8,-17.5);this.table(8,3.5,-17.5,2.5,1,.45);this.plant(12.5,3.4,-13.5,.55);
  this.sign('SOLSTICE / 07',12,1.25,25.14,0);this.box(12,1.2,25,3.8,2.4,.25,'stone');
  for(const x of [-22,22])for(const z of [-28,-18,-7,18,28]){if(x===-22&&z===-7)continue;const y=z<8?3.4:0;this.box(x,y+.2,z,2,.4,2,'stone');this.plant(x,y+.4,z,.8);const trunk=this.cylinder(x,y+2.4,z,.12,4,'wood');const crown=new THREE.Mesh(new THREE.IcosahedronGeometry(1.8,1),this.materials.leaf);crown.position.set(x,y+4.6,z);crown.scale.set(1,1.25,1);crown.castShadow=true;this.scene.add(crown);this.decor.push(crown);}
  for(let z=21;z<31;z+=2.3)for(const x of [-17,17])this.plant(x,0,z,.35);
 }
 finishArchitecture(){
  // Deep window reveals, stone piers and brise-soleil break up the facade.
  for(const y of [3.4,6.8])for(const x of [-8,8]){
   this.box(x,y+.58,11.3,7.3,.14,.75,'stone',false,true);
   this.box(x,y+2.95,11.45,7.6,.2,1.2,'plaster',false,true);
   for(const side of [-1,1])this.box(x+side*3.65,y+1.72,11.28,.2,2.65,.65,'darkStone',false,true);
   for(const dz of [-11.3])this.box(x,y+2.95,dz,5.6,.16,.7,'darkStone',false,true);
  }
  this.box(2.02,5.0,11.32,.45,3.2,.65,'stone',false,true);
  this.box(-2.02,5.0,11.32,.45,3.2,.65,'stone',false,true);
  // A timber screen wing and roof pavilion give the residence an asymmetric silhouette.
  this.box(-8,10.62,1,12,.7,22,'plaster');
  for(let z=-10;z<=10;z+=.5)this.box(-14.5,8.45,z,.35,3.2,.13,'wood',false,true);
  for(const x of [5,12])this.box(x,10.9,-6,.12,1.5,.12,'metal',false,true);
  for(let z=-10;z<-2;z+=.5)this.box(8.5,11.7,z,7.4,.12,.12,'wood',false,true);
  // Planters, lawn strips, lounge details and path lights soften the hardscape.
  for(const x of [-20,20])this.box(x<0?x:27,3.19,-10,4.5,.08,30,'grass');
  this.box(0,3.19,-30.5,35,.08,5,'grass');
  for(const x of [-13.5,-2.5])for(const z of [-26,-14])this.plant(x,3.4,z,.4);
  for(const y of [3.4,6.8])for(const z of [2,8]){
   this.box(0,y+3.02,z,2,.04,.08,'white',false,true);
   for(const x of [-2.25,2.25])this.box(x,y+.09,z,.07,.08,.7,'wood',false,true);
  }
  for(const y of [3.4,6.8])for(const x of [-8,8]){
   this.box(x,y+3.03,5,6.8,.08,.12,'wood',false,true);
   for(const side of [-1,1])this.box(x+side*4.5,y+3.03,5,.12,.08,7,'wood',false,true);
   for(const xx of [x-3.6,x+3.6])this.box(xx,y+.1,10.82,.08,.2,.08,'metal',false,true);
  }
  for(const x of [-12,12]){this.box(x,.25,20,2.5,.5,3.8,'stone');for(const z of [19,20.5])this.plant(x,.5,z,.4);}
  for(const x of [-5,5])for(const z of [21,27]){this.box(x,.35,z,.12,.7,.12,'metal',false,true);this.box(x,.7,z,.2,.05,.2,'white',false,true);}
  // Interior wall skirting and vertical panel joints add human-scale detail.
  for(const y of VILLA_LEVELS)for(const x of [-13.82,13.82])this.box(x,y+.055,0,.04,.11,21.4,'wood',false,true);
 }
 roomFinishes(){
  for(const p of this.panels){if(p.kind!=='plaster')continue;const c=p.mesh.localToWorld(V(p.width/2,p.height/2,0)),floor=c.y<3.3?0:c.y<6.7?3.4:6.8;
   if(floor===0)p.mesh.material=this.materials[c.x<0?'wineWall':'blueWall'];
   else if(floor===3.4&&c.x>2.3&&c.x<14)p.mesh.material=this.materials[c.z<-1.5?'sageWall':'blueWall'];
   else if(floor===6.8)p.mesh.material=this.materials[c.x<0?(c.z<0?'blueWall':'sandWall'):(c.z<-2?'sageWall':'softWall')];
  }
 }
 projectFloorOverlay(entry){
  return projectFloorMark(entry);
 }
 rug(x,y,z,w,d,material='rug'){this.rugSpecs.push({x,y,z,w,d,material});}
 projectRugs(){
  this.scene.updateMatrixWorld(true);
  for(const spec of this.rugSpecs)for(const mesh of this.floorSurfaces){const bounds=new THREE.Box3().setFromObject(mesh);if(Math.abs(bounds.max.y-spec.y)>.16||bounds.max.x<spec.x-spec.w/2||bounds.min.x>spec.x+spec.w/2||bounds.max.z<spec.z-spec.d/2||bounds.min.z>spec.z+spec.d/2)continue;
   const material=this.materials[spec.material].clone();material.polygonOffset=true;material.polygonOffsetFactor=-2;
   const decal=new THREE.Mesh(new THREE.BufferGeometry(),material);decal.renderOrder=1;
   const worldRotation=new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI/2,0,0));
   const entry={mesh,decal,local:mesh.worldToLocal(V(spec.x,spec.y,spec.z)),rotation:mesh.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(worldRotation),size:V(spec.w,spec.d,.25),floorOverlay:true};
   if(this.projectFloorOverlay(entry))this.floorOverlays.push(entry);else{removeSurfaceMark(entry);material.dispose();}
  }
 }
 contactShadows(){
  const size=64,data=new Uint8Array(size*size*4);for(let y=0;y<size;y++)for(let x=0;x<size;x++){const r=Math.max(Math.abs((x-31.5)/31.5),Math.abs((y-31.5)/31.5));const i=(y*size+x)*4;data[i]=data[i+1]=data[i+2]=0;data[i+3]=Math.round(Math.pow(Math.max(0,1-r),.45)*65);}
  const t=new THREE.DataTexture(data,size,size);t.needsUpdate=true;t.magFilter=THREE.LinearFilter;
  this.contactMaterial=new THREE.MeshBasicMaterial({map:t,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1});
  this.scene.updateMatrixWorld(true);const props=[];this.scene.traverse(o=>{if(o.isMesh&&o.userData.collider&&!o.userData.staticDetail)props.push(o);});
  for(const obj of props){const bounds=new THREE.Box3().setFromObject(obj),s=bounds.getSize(V());if(s.y>3||s.x*s.z<.4||s.y<.15)continue;const floor=Math.round(bounds.min.y/3.4)*3.4;if(Math.abs(bounds.min.y-floor)>.25)continue;const shadow=new THREE.Mesh(new THREE.PlaneGeometry(s.x+.3,s.z+.3),this.contactMaterial);const c=bounds.getCenter(V());shadow.rotation.x=-Math.PI/2;shadow.position.set(c.x,floor+.009,c.z);this.scene.add(shadow);obj.userData.contactShadow=shadow;}
 }
 batchDecor(){
  // Keep independently damageable source parts, batched until their first hit.
  this.decor=this.decor.filter(mesh=>{if(!mesh.userData.damageablePart)return true;const owner=mesh.userData.decorOwner;if(owner&&mesh.parent!==owner)owner.attach(mesh);return false;});
  const groups=new Map();for(const mesh of this.decor){mesh.updateWorldMatrix(true,false);const owner=mesh.userData.decorOwner,key=mesh.material.uuid+(owner?.uuid||'');if(!groups.has(key))groups.set(key,{material:mesh.material,owner,meshes:[]});groups.get(key).meshes.push(mesh);}
  for(const {material,owner,meshes} of groups.values()){const geometries=meshes.map(m=>{const g=m.geometry.clone().applyMatrix4(m.matrixWorld);g.deleteAttribute('color');if(!g.index)return g;const flat=g.toNonIndexed();g.dispose();return flat;});const merged=mergeGeometries(geometries,false);for(const g of geometries)g.dispose();if(!merged)continue;const mesh=new THREE.Mesh(merged,material);mesh.name='Villa architectural details';mesh.castShadow=true;mesh.receiveShadow=true;mesh.userData={isShootable:false,surface:material.userData.surface||'concrete',staticDetail:true};if(owner){merged.applyMatrix4(owner.matrixWorld.clone().invert());owner.add(mesh);}else this.scene.add(mesh);for(const m of meshes){m.removeFromParent();m.geometry.dispose();}}
  this.decor=[];
 }
 rubbleFloor(point,ceiling=point.y+.01){
  return supportHeight(this,point,ceiling);
 }
 emitPanelDebris(kind,point,direction,size,tint){
  for(let i=0;i<2;i++){
   const color=kind==='wood'||kind==='floor'?new THREE.Color(0x87613d):kind==='glass'?new THREE.Color(0xa3c8cc):(tint||new THREE.Color(0xd2c8b6)).clone();color.multiplyScalar(.7+Math.random()*.25);
   const rotation=new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.random()*2,Math.random()*6,Math.random()*2));
   const shape=new THREE.Matrix4().compose(V(0,0,0),rotation,V(size.x*(.35+Math.random()*.2),kind==='glass'?.008:.015+Math.random()*.025,size.y*(.35+Math.random()*.2)));
   this.debris.spawn(point,direction.clone().multiplyScalar(.8+Math.random()*1.5).add(V(Math.random()-.5,1,Math.random()-.5)),shape,V(3,2,4),kind==='glass'?2.5:Infinity,color);
  }
  if(kind!=='glass')this.blastDust.spawn(point,V((Math.random()-.5)*.6,.3,(Math.random()-.5)*.6),new THREE.Matrix4().makeScale(.12,.08,.12),V(0,.2,0),.7);
 }
 prepareRender(position){
  // Keep a fixed nearest-light budget instead of evaluating every bulb in the
  // building for every material. Bulb damage still controls linked intensities.
  const lights=[...this.roomLights].sort((a,b)=>a.position.distanceToSquared(position)-b.position.distanceToSquared(position));
  const visible=new Set(lights.slice(0,9));for(const light of this.roomLights)light.visible=visible.has(light);
 }
 get door(){return this.activeDoor||{destroyed:true,open:false};}
 update(dt,position,state={}){
  this.waterTime=(this.waterTime||0)+dt;if(this.waterNormal)this.waterNormal.offset.set(this.waterTime*.025,this.waterTime*.017);
  this.floorOverlays=this.floorOverlays.filter(e=>{if(e.removed||!e.mesh.visible){removeSurfaceMark(e);e.decal.material.dispose();return false;}if(!e.pending&&e.revision!==surfaceRevision(e.mesh)){if(this.destruction)this.destruction.refreshMark(e,()=>removeSurfaceMark(e));else if(!this.projectFloorOverlay(e)){removeSurfaceMark(e);e.decal.material.dispose();return false;}}return true;});
  for(const p of this.panels)p.update(dt);for(const floor of this.timberFloors||[])floor.update(dt,position,state);settleFloorFixtures(this,dt);this.liquids.update(dt);this.debris.update(dt);this.blastDust.update(dt);this.blastScars.update();this.activeDoor=null;let distance=2.3;for(const p of this.panels){if(!p.isDoor||p.destroyed||p.detachedEnvironment)continue;const center=p.group.localToWorld(V(p.width/2,1,0)),d=center.distanceTo(position);if(d<distance){distance=d;this.activeDoor=p;}}this.canInteract=!!this.activeDoor;}
 interact(position){this.update(0,position);if(!this.activeDoor)return false;this.activeDoor.toggle(position);return true;}
 damageExplosion(position,radius){
  if(!this.destruction)return VillaMap.prototype.damageExplosionSync.call(this,position,radius);
  this.liquids?.explosion(position,radius);this.destruction.explode(position.clone(),radius);
 }
 damageExplosionSync(position,radius){
  this.liquids?.explosion(position,radius);
  this.scene.updateMatrixWorld(true);
  const objects=[],bounds=new THREE.Box3(),sphere=new THREE.Sphere(position,radius);
  this.scene.traverseVisible(mesh=>{
   if(!mesh.isMesh||!mesh.userData.isShootable||mesh.userData.water||mesh.userData.bot||mesh.userData.fractureBatch||mesh.userData.propBatch||mesh.userData.surface==='glass'&&!mesh.userData.damageablePart)return;
   if(bounds.setFromObject(mesh).intersectsSphere(sphere))objects.push(mesh);
  });
  const ray=new THREE.Raycaster(),visibility=new WorldRayQuery(objects);ray.layers.enableAll();
  const propTargets=[];
  if(this.surfaceDamage)for(const mesh of objects){
   if((!mesh.userData.collider&&!mesh.userData.damageablePart)||mesh.userData.breakable)continue;
   const material=physicalMaterial(mesh);if(!['splinter','dent','brittle','tear','shatter'].includes(material.response))continue;
   mesh.geometry.computeBoundingBox();const local=mesh.worldToLocal(position.clone()),point=mesh.localToWorld(mesh.geometry.boundingBox.clampPoint(local,new THREE.Vector3()));
   const delta=point.clone().sub(position),distance=delta.length();if(distance>radius)continue;
   const strength=propBlastImpact(material,distance,330,mesh.userData.brittleContainer,local);if(strength<(material.response==='shatter'?2:material.response==='dent'?20:mesh.userData.brittleContainer?15:60))continue;
   ray.set(position,delta.clone().normalize());ray.near=.01;ray.far=distance+.02;
   const hits=visibility.intersect(ray),hit=hits.find(h=>h.object===mesh);let transmission=1;const blockers=new Set();
   if(hit)for(const h of hits){
    if(h.object===mesh||h.distance>=hit.distance-.01||blockers.has(h.object))continue;blockers.add(h.object);
    const p=physicalMaterial(h.object),sameAssembly=mesh.userData.assemblyId&&mesh.userData.assemblyId===h.object.userData.assemblyId;
    if(p.response==='tear'||p.response==='shatter')transmission*=.8;
    else if(sameAssembly&&p.response==='splinter'){h.object.geometry.computeBoundingBox();const s=h.object.geometry.boundingBox.getSize(V());if(Math.min(s.x,s.y,s.z)<=.04)transmission*=.6;else transmission=0;}
    else transmission=0;
    if(!transmission)break;
   }
   if(hit&&transmission>0)propTargets.push({hit,direction:delta.normalize(),strength:strength*transmission});
  }
  // Determine exposure before removing anything: a hole made by this explosion
  // must not let the same blast chew through another room behind it.
  const targets=[];
  for(const p of this.panels){if(p.destroyed)continue;const exposed=new Set();let scarPoint=null;
   if(p.kind!=='glass'){
    const local=p.mesh.worldToLocal(position.clone());local.set(THREE.MathUtils.clamp(local.x,.05,p.width-.05),THREE.MathUtils.clamp(local.y,.05,p.height-.05),0);
    const point=p.mesh.localToWorld(local),delta=point.clone().sub(position),distance=delta.length();
    if(distance<Math.min(radius,4.5)){ray.set(position,delta.normalize());ray.near=.04;ray.far=Math.max(.04,distance-.04);if(visibility.intersect(ray).every(hit=>hit.object===p.mesh))scarPoint=point;}
   }
   for(const cell of p.pieces){if(p.broken.has(cell.id))continue;const point=p.mesh.localToWorld(V(cell.center.x,cell.center.y,0)),delta=point.clone().sub(position),distance=delta.length();if(distance>=radius||(p.kind!=='glass'&&p.blastDamage(position,point,330)<p.toughness*.12))continue;
    ray.set(position,delta.normalize());ray.near=.04;ray.far=Math.max(.04,distance-.04);
    if(visibility.intersect(ray).every(hit=>hit.object===p.mesh))exposed.add(cell.id);
   }
   if(exposed.size||scarPoint)targets.push({p,exposed,scarPoint});
  }
  for(const {p,exposed,scarPoint} of targets){
   if(exposed.size)p.applyBlast(position,330,radius,(_point,id)=>exposed.has(id));
   if(scarPoint&&!p.destroyed){
    const point=scarPoint;this.blastScars.add(p,point,position);
    this.blastDust.spawn(point,V(0,.2,0),new THREE.Matrix4().makeScale(.15,.1,.15),V(0,0,0),.6);
   }
  }
  for(const {hit,direction,strength} of propTargets)if(hit.object.visible)this.surfaceDamage.hit(hit,'primary',direction,{distance:0,damage:strength,blast:true,blastOrigin:position});
 }
 location(position){const y=position.y-1.2;if(position.z<-11)return 'Pool terrace';if(position.x<-14&&position.x>=-23&&position.z>=-10&&position.z<=2)return position.y>7.4?'Wellness roof terrace':'1F · Wellness pavilion';if(position.x>24||position.x<-14)return 'Garden approach';if(position.z>11)return 'Arrival court';const floor=y<3.2?0:y<6.6?3.4:6.8;const room=VILLA_ROOMS.find(([f,a,b,c,d])=>f===floor&&position.x>=a&&position.x<=b&&position.z>=c&&position.z<=d);return `${floor===0?'B1':floor===3.4?'1F':'2F'} · ${room?.[5]||'Stair hall'}`;}
}
