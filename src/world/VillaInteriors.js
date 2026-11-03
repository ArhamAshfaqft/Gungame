import {addWater} from './VillaWater.js';
import * as THREE from 'three';
import {materialPart} from './MaterialProps.js';
import {cabinet as buildCabinet,brittleContainer} from '../environment/ConstructionPrefabs.js';
const V=(x,y,z)=>new THREE.Vector3(x,y,z);
// Room bounds are also used by callouts and the route tests. Every floor has a
// different partition arrangement; the two stairs remain the shared landmarks.
export const SOLSTICE_ROOMS=[
 [3.4,-23,-14,-10,2,'Wellness pavilion'],
 [0,-14,-2.7,1,11,'Garage workshop'],[0,-14,-8.5,-11,1,'Wine vault'],[0,-8.5,-2.7,-11,1,'Tasting cellar'],
 [0,2.7,10.4,4,11,'Laundry'],[0,2.7,10.4,-3,4,'Mechanical room'],[0,2.7,10.4,-11,-3,'Communications'],[0,14,24,-10,2,'Storage annex'],
 [3.4,-14,-2.7,2.5,11,'Hearth salon'],[3.4,-14,-2.7,-11,2.5,'Dining room'],[3.4,2.7,10.4,-1.5,11,'Library lounge'],[3.4,2.7,10.4,-11,-1.5,'Kitchen & pantry'],
 [3.4,14,24,-3,2,'Sculpture gallery'],[3.4,14,24,-10,-3,'Winter garden'],
 [6.8,-14,-2.7,0,11,'Primary suite'],[6.8,-14,-2.7,-11,0,'Private study'],[6.8,2.7,10.4,4,11,'Guest suite'],[6.8,2.7,10.4,-2,4,'Dressing lounge'],[6.8,2.7,10.4,-11,-2,'Spa bathroom'],[6.8,14,24,-10,2,'Roof garden'],
];

export function buildVillaInteriors(m){
 const b=(...a)=>m.box(...a),d=(x,y,z,w,h,depth,mat='wood')=>b(x,y,z,w,h,depth,mat,false,true);
 const prop=(x,y,z,w,h,depth,mat='wood')=>b(x,y,z,w,h,depth,mat,true);
 const cyl=(...a)=>m.cylinder(...a);
 const wall=(axis,coord,a,z,y,open,name)=>m.wall(axis,coord,a,z,y,open.map(o=>({...o,name})), 'plaster',true);
 const doorway=(at,width=1.5,kind='door')=>({at,width,height:2.35,kind});
 const rug=(x,y,z,w,depth,mat='rug')=>m.rug(x,y,z,w,depth,mat);
 const books=(x,y,z,count=8,alongX=true)=>{for(let i=0;i<count;i++){const p=(i-count/2)*.085;const obj=d(x+(alongX?p:0),y+.13+(i%3)*.012,z+(alongX?0:p),alongX?.065:.19,.26+(i%3)*.025,alongX?.19:.065,['red','navy','linen','ochre','walnut'][i%5]);materialPart(obj,'paper');obj.name='Bound book';if(i%5===0)obj.rotation.z=.1;}};
 const vase=(x,y,z,r=.13)=>{const body=cyl(x,y+r*.65,z,r,r*1.3,'white'),neck=cyl(x,y+r*1.6,z,r*.55,r*.7,'white');body.name='Ceramic vase';body.userData.damageParts=[body,neck];neck.userData.damageRoot=body;body.userData.thickness=.006;neck.userData.thickness=.006;};
 const cups=(x,y,z)=>{cyl(x,y+.06,z,.07,.12,'white');cyl(x+.25,y+.02,z,.12,.025,'white');};
 const bottles=(x,y,z,count=3)=>{for(let i=0;i<count;i++){const body=cyl(x+i*.18,y+.15,z,.055,.3,'leaf'),neck=cyl(x+i*.18,y+.34,z,.025,.1,'metal'),label=d(x+i*.18,y+.16,z+.057,.07,.1,.01,'linen');body.name='Glass bottle';body.userData.damageParts=[body,neck,label];for(const part of [body,neck,label])materialPart(part,'glass',{damageRoot:body,thickness:.003});}};
 const cabinet=(x,y,z,w,h,depth,mat='walnut',front=1)=>{
  return buildCabinet(m,{x,y,z,width:w,height:h,depth,material:mat,front,wallMounted:y-(m.levels.filter(level=>level<=y+.01).at(-1)||0)>.8});
 };
 const pendant=(x,y,z,r=.26,color='metal')=>{cyl(x,y+.32,z,.009,.6,'metal');cyl(x,y,z,r,.18,color);cyl(x,y-.096,z,r*.82,.012,'glowWarm');};
 const tableSettings=(x,y,z)=>{for(let i=0;i<3;i++)for(const side of [-1,1]){const xx=x+(i-1)*1.25,zz=z+side*.57;cyl(xx,y+.02,zz,.21,.025,'white');cyl(xx,y+.04,zz,.14,.018,'white');d(xx+.27,y+.03,zz,.018,.02,.3,'steel');cups(xx-.28,y+.02,zz);}vase(x,y,z,.11);};
 const pillows=(x,y,z,rot=0)=>{for(const off of [-1.3,1.3]){const mesh=d(x+off,y+.8,z,.54,.5,.18,off<0?'linen':'ochre');mesh.rotation.set(.13,rot,off*.09);}};
 const screen=(x,y,z,w=1.2)=>{d(x,y,z,w,w*.57,.045,'black');d(x,y,z+.025,w-.05,w*.57-.05,.006,'screen');};
 const frame=(x,y,z,w,h)=>m.art(x,y,z,w,h);
 const pipe=(a,c,r=.04,mat='steel')=>{const mid=a.clone().add(c).multiplyScalar(.5),dir=c.clone().sub(a);const mesh=cyl(mid.x,mid.y,mid.z,r,dir.length(),mat);mesh.quaternion.setFromUnitVectors(V(0,1,0),dir.normalize());};
 // Interior circulation: three distinct floor plans, broad arches alternate with doors.
 for(const y of [0,3.4,6.8]){
  const leftSplit=y===0?1:y===3.4?2.5:0,rightSplit=y===0?4:y===3.4?-1.5:4;
  for(const x of [-2.7,2.7])wall('x',x,-11,11,y,[doorway(-9.4,1.5,y===3.4?'open':'door'),doorway(7,1.6)],x<0?'West hall':'East hall');
  wall('z',leftSplit,-14,-2.7,y,[doorway(y===3.4?-5:-7.5,y===3.4?2.5:1.5,y===3.4?'open':'door')],'West connecting doorway');
  wall('z',rightSplit,2.7,10.5,y,y===3.4?[doorway(4.4,2.3,'open'),doorway(9.7,1.4,'open')]:[doorway(6.5)],'East connecting doorway');
  if(y===0){wall('x',-8.5,-11,1,y,[doorway(-1.2,1.4)],'Wine vault door');wall('z',-3,2.7,10.5,y,[doorway(4.8)],'Communications door');}
  if(y===6.8)wall('z',-2,2.7,10.5,y,[doorway(6.3)],'Bathroom door');
  // The service stair sits in its own narrow circulation bay.
  if(y!==3.4)wall('x',10.5,-11,11,y,[doorway(-9.5,1.6,'open'),doorway(2.1,1.8,'open'),doorway(8,1.6,'open')],'Service passage');
  const signs=y===0?['WORKSHOP','LAUNDRY']:y===3.4?['SALON','LIBRARY']:['PRIMARY','GUEST'];
  m.sign(signs[0],-2.52,y+2.15,8.4,Math.PI/2);m.sign(signs[1],2.52,y+2.15,8.4,-Math.PI/2);
  rug(0,y,6,2.2,6,y===0?'rug':'blueRug');
  // A low console breaks the long entry sightline without obstructing the stairs.
  cabinet(-2.32,y,4.5,.62,.85,1.7);vase(-2.32,y+.85,4.5);frame(1.25,y+1.9,10.82,1.5,.9);
  for(const z of [3,8])m.lamp(0,y+2.95,z);
 }
 // SALON: travertine hearth, walnut media wall, linen seating and a sunlit reading nook.
 {
 const y=3.4; rug(-8.7,y,6.6,7,5.9,'blueRug');m.sofaFacing(-9,y,8.2,3.8,-9,3);pillows(-9,y,8.55);m.sofaFacing(-5,y,5.6,2.5,-8.5,5.4);
 m.table(-8.5,y,5.4,2.7,1.25,.43);books(-8.9,y+.51,5.4,4);cups(-8,y+.49,5.45);
 prop(-13.55,y+1.3,8.4,.65,2.6,3.6,'stone');prop(-13.16,y+.65,8.4,.13,.72,2.25,'black');
 d(-13.07,y+.55,8.4,.015,.22,1.6,'glowAmber');for(let z=7.8;z<9.1;z+=.3)d(-13,y+.42,z,.14,.1,.25,'walnut');
 for(const z of [3,7])m.plant(-12.65,y,z,.4);
 cabinet(-9,y,3,5.3,.45,.7);for(let i=0;i<11;i++)d(-11.7+i*.54,y+1.68,2.66,.055,2.5,.09,'walnut');screen(-9,y+1.65,2.74,2.35);
 m.chairFacing(-4.3,y,9.2,-5.4,9.1);m.table(-5.4,y,9.1,.7,.7,.55);vase(-5.4,y+.63,9.1,.1);
 pendant(-8.5,y+2.6,5.4,.6);m.lamp(-10,y+2.97,5);frame(-5,y+2.05,10.82,1.3,.75);
 }
 // DINING: long table, paired pendants, crockery dresser and a textured feature wall.
 {
 const y=3.4; rug(-8.2,y,-3.8,6.5,7.2);m.table(-8.2,y,-3.4,4.6,1.8,.8);tableSettings(-8.2,y+.87,-3.4);
 for(const x of [-9.7,-8.2,-6.7])for(const z of [-4.75,-2.05])m.chairFacing(x,y,z,x,-3.4);
 for(const x of [-9.2,-7.2])pendant(x,y+2.52,-3.4,.32);m.lamp(-7,y+2.97,-5.5);
 cabinet(-8,y,-10.28,6.4,.95,.7);for(const x of [-10,-8,-6]){vase(x,y+1,-10.2,.15);frame(x,y+2.1,-10.82,1.2,.75);}
 m.bookshelf(-13.45,y,-8.5,2.3,Math.PI/2);m.bookshelf(-13.45,y,-.5,2.3,Math.PI/2);bottles(-10,y+.95,-10.2,4);
 m.plant(-4,y,-9,.5);m.table(-4.1,y,.5,.85,.85,.8);vase(-4.1,y+.88,.5,.18);
 }
 // LIBRARY: freestanding double bookshelf makes two close-range lanes, study corner.
 {
 const y=3.4;m.bookshelf(9.8,y,4.8,2,-Math.PI/2);m.bookshelf(9.8,y,9.8,1,-Math.PI/2);m.bookshelf(6.5,y,1.1,3.6,0);
 rug(6.4,y,6.6,5.3,5);m.chairFacing(5.1,y,7,6.1,5.8);m.chairFacing(7.1,y,6.9,6.1,5.8);m.table(6.1,y,5.8,1.6,1,.48);for(let row=0;row<8;row++)for(let col=0;col<8;col++)d(6.1+(col-3.5)*.07,y+.548,5.8+(row-3.5)*.07,.07,.012,.07,(row+col)%2?'walnut':'white');for(const side of [-1,1])for(let i=0;i<6;i++)cyl(6.1+(i-2.5)*.07,y+.58,5.8+side*.19,.019,.05,side<0?'white':'black');
 m.table(3.5,y,1.9,1.4,.9,.78);screen(3.5,y+1.1,1.63,.7);m.chairFacing(3.5,y,3,3.5,1.9);m.plant(8.9,y,2.8,.4);
 m.lamp(6,y+2.97,5);pendant(6.1,y+2.55,5.8,.4);frame(8,y+2.1,10.82,1.4,1);
 }
 // KITCHEN: individual fronts, island shelves, range hood and walk-in pantry.
 {
 const y=3.4;cabinet(5.75,y,-10.1,3.7,.88,1.2,'white');prop(5.75,y+.94,-10.1,3.8,.12,1.35,'marble');
 for(const x of [4.3,5.6,6.9])cabinet(x,y+1.8,-10.5,1.12,.85,.65,'walnut');
 cabinet(6.5,y,-5.3,3.6,.95,1.5,'walnut');prop(6.5,y+1.02,-5.3,3.8,.12,1.7,'marble');
 for(const x of [5.25,6.5,7.75]){m.chairFacing(x,y,-3.5,x,-5.3);pendant(x,y+2.5,-5.3,.2);}
 for(const x of [5.7,6.35])for(const z of [-10.2,-9.75])cyl(x,y+1.012,z,.16,.018,'black');
 prop(6,y+2.45,-9.9,1.6,.25,.9,'steel');d(6,y+2.8,-10.2,.6,.7,.5,'steel');
 prop(3.8,y+1.22,-7.5,1.2,2.44,1.3,'steel');for(const h of [.8,1.7])d(4.35,y+h,-6.81,.03,.55,.03,'black');
 prop(7.4,y+1.09,-5.3,.7,.04,.4,'wood');bottles(7.4,y+1.08,-5.2,3);cups(5.4,y+1.08,-5.3);vase(6.6,y+1.08,-5.3,.12);
 wall('x',7.9,-11,-8,y,[],'Pantry rear enclosure');wall('z',-8,7.9,10.5,y,[doorway(8.9,1.5,'open')],'Pantry entrance');for(let h=.4;h<2.6;h+=.5){prop(10.15,y+h,-9.5,.5,.07,1.9,'wood');bottles(10.03,y+h+.035,-10,1);bottles(10.03,y+h+.035,-9.4,1);}
 m.lamp(6,y+2.97,-7.7);frame(5,y+2.0,-1.65,1.4,.7);
 }
 // PRIMARY: asymmetrical suite, slatted headboard and separate dressing nook.
 {
 const y=6.8;m.bedroom(-8,y,6.7);rug(-8,y,6.5,6,5.2);
 for(let x=-10.8;x<-5.2;x+=.18)d(x,y+1.5,4.92,.055,2.6,.07,'walnut');
 prop(-13.2,y+.45,8.2,.8,.9,3,'walnut');m.chairFacing(-11.5,y,9.3,-13.2,8.2);vase(-13.2,y+.94,8.2,.12);
 wall('z',2,-14,-9.6,y,[doorway(-11.4,1.25,'open')],'Dressing nook');cabinet(-12,y,.4,3.5,2.65,.6,'walnut');
 pendant(-6.1,y+2.45,5.7,.16);m.lamp(-8,y+2.97,7.4);frame(-4.2,y+1.9,10.82,1.3,.8);
 }
 // STUDY: angled-looking desk arrangement, records wall, leather chairs and globe.
 {
 const y=6.8;m.study(-7.5,y,-5.5);rug(-7.8,y,-5,6.4,6.5,'blueRug');books(-8.3,y+.88,-5.4,5);cups(-6.5,y+.86,-5.2);
 cabinet(-6.8,y,-10.25,4.5,.7,.8);for(const x of [-8.4,-7.5,-6.6,-5.7])d(x,y+1,-10.2,.38,.42,.4,'linen');
 m.chairFacing(-4.5,y,-2.2,-5.8,-2.2);m.table(-5.8,y,-2.2,.8,.8,.55);vase(-5.8,y+.62,-2.2,.17);
 m.lamp(-7.7,y+2.97,-5.6);pendant(-7.5,y+2.55,-5.5,.45);m.sign('PRIVATE ARCHIVE',-11.5,y+2.2,-10.82,0);
 }
 // GUEST / DRESSING / SPA have different footprints instead of another four-square floor.
 {
 const y=6.8;m.bedroom(6.5,y,8,true);prop(3.35,y+.28,9.2,.7,.56,1.8,'walnut');prop(3.35,y+.86,9.2,.52,.6,.65,'navy');d(3.35,y+1.19,9.2,.25,.06,.08,'metal');rug(6.3,y,7.8,5.4,4);m.lamp(6.6,y+2.97,7);
 // Seating stays against the west wall; a continuous central route joins both doors.
 m.sofaFacing(3.55,y,1,2.3,4.8,1);m.table(4.8,y,1,.65,1.1,.48);cabinet(9.9,y,-.9,.45,2.5,1.4,'walnut');m.plant(3.35,y,3.25,.25);m.lamp(6.6,y+2.97,1);
 const tubBase=materialPart(prop(6.5,y+.08,-8,3,.16,1.6,'white'),'ceramic');tubBase.name='Bathtub base';const tubWalls=[];for(const x of [5.06,7.94])tubWalls.push(materialPart(prop(x,y+.42,-8,.12,.68,1.6,'white'),'ceramic'));for(const z of [-8.74,-7.26])tubWalls.push(materialPart(prop(6.5,y+.42,z,2.8,.68,.12,'white'),'ceramic'));for(const wall of tubWalls)wall.name='Bathtub shell';brittleContainer([tubBase,...tubWalls],new THREE.Box3(V(5.12,y+.155,-8.68),V(7.88,y+.76,-7.32)));addWater(m,6.5,y+.57,-8,2.75,1.3,{bottom:y+.16,floor:y,walls:tubWalls});
 cabinet(4,y,-3,2.1,.9,.75,'walnut');prop(4,y+.97,-3,2.2,.12,.85,'marble');cyl(4,y+1.06,-3,.29,.08,'white');
 d(4,y+1.9,-2.16,2,1.2,.025,'steel');pipe(V(4.5,y+1,-3),V(4.5,y+1.3,-3),.02);
 m.panel(8.6,y,-6.8,2.3,2.5,-Math.PI/2,'glass',false,'Walk-in shower');prop(9.5,y+.04,-8,1.7,.08,3,'bathTile');
 for(let i=0;i<3;i++)materialPart(d(6.8+i*.22,y+.79,-7.26,.18,.06,.55,'linen'),'cloth',{looseItem:true,supportOwner:tubWalls[3]});bottles(9.7,y+.12,-9,3);m.lamp(6,y+2.97,-6.6);
 }
 // BASEMENT: service spaces with genuine machinery, cable routes, packed shelves and wine racks.
 {
 m.basement();
 for(const z of [-9,-7.5,-6,-4.5]){const rack=cabinet(-13.4,0,z,.7,2.6,1,'walnut');for(let h=.25;h<2.5;h+=.4){const shelf=prop(-13.22,h-.085,z,.54,.02,.96,'walnut');m.environment?.support(shelf,[rack]);for(let i=0;i<3;i++){const bottle=cyl(-12.99,h,z-.3+i*.3,.075,.28,'leaf');bottle.rotation.z=Math.PI/2;materialPart(bottle,'glass',{thickness:.003,supportOwner:shelf});bottle.name='Glass bottle';}}}
 m.table(-5.3,0,-5.2,2.2,1.1,1);bottles(-5.8,1.08,-5.2,4);for(const x of [-6,-4.6])m.chairFacing(x,0,-3.8,x,-5.2);
 wall('z',8.95,2.7,10.5,0,[doorway(8.9,1.5,'open')],'Laundry closet');
 for(const x of [3.5,5.4,7.3]){cabinet(x,0,10.1,1.7,1,.8,'white');d(x,1.04,10.1,1.65,.08,.9,'marble');}
 for(const x of [4.3,6.5]){prop(x,1.1,0,1.1,2.2,1.15,'steel');cyl(x,2.35,0,.35,.3,'steel');pipe(V(x,2.5,0),V(x,2.7,-2),.08);}
 for(const x of [4.6,6.4,8.2]){prop(x,1.2,-9.7,1.4,2.7,.8,'metal');for(let h=.3;h<2.3;h+=.28){d(x,h,-9.26,1.2,.17,.04,'black');for(let i=0;i<4;i++)d(x-.4+i*.13,h,-9.23,.035,.025,.01,'glowCool');}}
 for(const y of [.8,1.3])pipe(V(3,y,-2.8),V(8,y,-2.8),.04);
 for(const x of [-10,8]){pipe(V(x,2.95,-10),V(x,2.95,10),.06);}
 for(const [x,z] of [[-8,6],[-10,-5],[-5,-5],[6,7],[6,0],[6,-7]])m.lamp(x,2.93,z);
 // Pegboard, drills, workbench drawers, hazard stripes and oil stains in the garage.
 prop(-12.6,.93,1,1.8,.1,2,'wood');cabinet(-12.6,0,1,1.7,.88,1.8,'metal');
 d(-13.78,1.8,0,.05,1.2,3,'darkStone');for(let i=0;i<7;i++){d(-13.7,1.7, -.9+i*.3,.08,.4,.06,'steel');d(-13.65,1.53,-.9+i*.3,.09,.1,.1,'red');}
 for(let z=3;z<8;z+=.4)for(const x of [-10.1,-5.9])d(x,.01,z,.12,.02,.22,'ochre');
 }
 // Window dressings, sockets, baseboards and switches create detail at player height.
 for(const p of [...m.panels]){
  if(p.kind==='glass'&&p.height>1.5&&p.group.position.y>3){
   p.group.updateMatrixWorld(true);for(const side of [0,p.width]){const pos=p.group.localToWorld(V(side+.1,p.height/2,0));const curtain=d(pos.x,pos.y,pos.z,.22,p.height+.1,.16,'curtain');curtain.rotation.y=p.group.rotation.y;}
  }
  if(p.isDoor){const pos=p.group.localToWorld(V(p.width+.17,1.1,.08));d(pos.x,pos.y,pos.z,.08,.12,.025,'white');}
 }
}

export function buildGalleryWing(m){
 const b=(...a)=>m.box(...a),d=(x,y,z,w,h,depth,mat='walnut')=>b(x,y,z,w,h,depth,mat,false,true);
 // East annex: workshop below, art gallery and planted conservatory above.
 b(19,-.1,-4,10,.2,12,'concrete');
 for(const y of [3.4,6.8])b(19,y-.12,-4,10,.24,12,'stone');
 for(const y of [0,3.4]){
  m.wall('x',24,-10,2,y,[{at:-6,width:4.8,height:2.4,sill:.35,kind:'glass'},{at:0,width:2.2,height:2.4,kind:y===3.4?'door':'glass'}],'plaster',y===3.4);
  m.wall('z',-10,14,24,y,[{at:19,width:6,height:2.3,sill:.5,kind:'glass'}],'stone');
  m.wall('z',2,14,24,y,[{at:19,width:2.1,height:2.45,kind:'door',name:'Gallery courtyard entry'}],'plaster',true);
 }
 m.wall('z',-3,14,24,3.4,[{at:19,width:3.5,height:2.65,kind:'open'}],'plaster',true);
 b(19,6.68,-4,10.4,.18,12.4,'plaster');
 for(const z of [-9.8,1.8]){d(19,7.72,z,10,.05,.05,'metal');for(let x=14.4;x<24;x+=1.2)d(x,7.2,z,.03,1.05,.03,'metal');}
 d(24,7.72,-4,.05,.05,12,'metal');for(let z=-9.5;z<2;z+=1.2)d(24,7.2,z,.03,1.05,.03,'metal');
 for(const z of [-9.8,1.8]){const guard=new THREE.Box3(V(14,6.8,z-.035),V(24,7.8,z+.035));guard.balconyGuard=true;m.colliders.push(guard);}
 {const guard=new THREE.Box3(V(23.965,6.8,-10),V(24.035,7.8,2));guard.balconyGuard=true;m.colliders.push(guard);}
 // Gallery plinths form a staggered route, not a shooting corridor along one axis.
 for(const [x,z,r] of [[17,-.3,.45],[21.4,.2,.35],[21,-4.8,.45]]){
  b(x,3.85,z,.9,.9,.9,'stone');const sculpture=new THREE.Mesh(new THREE.TorusKnotGeometry(r,.1,48,8),m.materials.steel);sculpture.position.set(x,4.7,z);sculpture.castShadow=true;m.scene.add(sculpture);m.decor.push(sculpture);
 }
 m.art(16,5.3,1.83,1.6,1.1);m.art(22,5.3,1.83,1.7,1.1);m.sign('COLLECTION / 07',19,5.75,1.82,Math.PI);
 for(const [x,z] of [[16,-8],[22,-8],[16,-5.5],[22,-5.5]]){b(x,3.65,z,1.4,.5,1.4,'stone');m.plant(x,3.9,z,.65);}
 m.sofaFacing(19,3.4,-8,3.2,19,-6);m.table(19,3.4,-6,1.6,.8,.45);m.lamp(19,6.3,-.5);m.lamp(19,6.3,-6);
 // Low walls give cover on the accessible roof garden and leave the balcony route clear.
 for(const [x,z] of [[16,-8],[22,-8],[22,0]]){b(x,7.05,z,1.4,.5,1.4,'stone');m.plant(x,7.3,z,.5);}
 m.sofaFacing(18,6.8,-6,2.8,18,-4);m.table(18,6.8,-4,1.6,.8,.45);
 for(const x of [16,19,22]){b(x,.5,-7,1.4,1,1.2,'wood');b(x,1.5,-7,1.1,1,.9,'wood');}
 m.wall('x',21.8,-4,2,0,[{at:-1,width:2,height:2.4,kind:'open'}],'plaster',true);
 m.sign('COLLECTION',14.12,5.55,-9.3,-Math.PI/2);
}
