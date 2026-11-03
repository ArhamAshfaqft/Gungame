import * as THREE from 'three';
import {VillaPanel} from './VillaPanel.js';
import {blastImpact} from './PhysicalMaterials.js';
import {soundEngine} from '../audio/SoundEngine.js';
import {invalidateSupport} from './SupportIndex.js';

// A bounded gameplay model of a timber bay: independently damaged boards and
// underlay, with cross-grain joists that continue to support intact strips.
export class TimberFloor {
 constructor(map,{x,y,z,width,depth,name}){
  Object.assign(this,{map,x,y,z,width,depth,name,joists:[],loadTime:0,checkClock:0});
  const layer=(offset,thickness,strength,boardWidth,label)=>{
   const p=new VillaPanel(map,{x,y:y-offset,z,width,height:depth,kind:'floor',name:label,construction:{thickness,strength,boardWidth,gap:label===name?.0015:0}});
   p.group.rotation.x=-Math.PI/2;p.syncCollision();p.floorAssembly=this;return p;
  };
  this.boards=layer(.0175,.035,150,.2,name);
  this.backing=layer(.050,.018,180,.4,'Timber subfloor');
  this.ceiling=layer(.230,.012,90,.4,'Timber ceiling lining');this.ceiling.mesh.material=map.materials.softWall;this.ceiling.mesh.userData.physicalMaterial='plaster';
  const colors=this.ceiling.mesh.geometry.attributes.color,normals=this.ceiling.mesh.geometry.attributes.normal;
  for(let i=0;i<colors.count;i++)if(Math.abs(normals.getZ(i))<.5)colors.setXYZ(i,.76,.73,.67);
  if(!map.materials.timberBacking){
   const material=map.materials.floorPanel.clone();material.onBeforeCompile=shader=>{
    shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying float vTimberFace;').replace('#include <begin_vertex>','#include <begin_vertex>\nvTimberFace=(modelMatrix*vec4(normal,0.0)).y;');
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying float vTimberFace;').replace('#include <map_fragment>','#include <map_fragment>\nif(vTimberFace < -.95)diffuseColor.rgb=vec3(.78,.76,.72);');
   };material.customProgramCacheKey=()=> 'timber-backing-painted-underside';map.materials.timberBacking=material;
  }
  this.backing.mesh.material=map.materials.timberBacking;
  // Rugs belong only to the finish boards, never to the underlay below a breach.
  map.floorSurfaces.push(this.boards.mesh);
  (map.timberFloors??=[]).push(this);this.onFracture();
 }
 onFracture(){
  if(this.joists.length)return;
  const rows=Math.ceil(this.depth/.65),segments=Math.ceil(this.width/2);
  for(let row=1;row<rows;row++)for(let segment=0;segment<segments;segment++){
   const a=this.width*segment/segments,b=this.width*(segment+1)/segments,localY=this.depth*row/rows;
   const position=this.boards.mesh.localToWorld(new THREE.Vector3((a+b)/2,localY,-.1215));
   const mesh=this.map.box(position.x,position.y,position.z,b-a,.16,.085,'wood');
   this.addJoist(mesh,{row,a,b,localY});
  }
 }
 addJoist(mesh,{row,a,b,localY}){
  const beam={mesh,row,a,b,localY,health:0};mesh.name='Timber floor joist';
  mesh.userData.woodHealth=95;mesh.userData.onMaterialBreak=hit=>this.severJoist(beam,hit.point);
  this.joists.push(beam);return beam;
 }
 severJoist(beam,point){
  const local=this.boards.mesh.worldToLocal(point.clone()),a=Math.max(beam.a,local.x-.14),b=Math.min(beam.b,local.x+.14);
  this.breakJoist(beam,false);
  for(const [start,end] of [[beam.a,a],[b,beam.b]])if(end-start>.04){
   const p=this.boards.mesh.localToWorld(new THREE.Vector3((start+end)/2,beam.localY,-.1215));
   this.addJoist(this.map.box(p.x,p.y,p.z,end-start,.16,.085,'wood'),{row:beam.row,a:start,b:end,localY:beam.localY});
  }
  this.map.emitPanelDebris('floor',point,new THREE.Vector3(0,-1,0),new THREE.Vector2(b-a,.12),beam.mesh.material.color);
  // A second cut can isolate a middle length. Only components still connected
  // to the bay perimeter continue to act as structural supports.
  const row=this.joists.filter(j=>j.row===beam.row&&j.mesh.visible).sort((a,b)=>a.a-b.a),components=[];
  for(const j of row){const last=components.at(-1);if(last&&j.a<=last.at(-1).b+.002)last.push(j);else components.push([j]);}
  for(const group of components)if(group[0].a>.002&&group.at(-1).b<this.width-.002)for(const j of group)this.breakJoist(j);
 }
 transferBlast(source,position,power,radius,visible){
  if(this.transferring)return;
  const layers=[this.boards,this.backing,this.ceiling],index=layers.indexOf(source);if(index<0)return;
  this.transferring=true;
  try{
   // A blast can arrive from either storey. Transfer a reduced impulse through
   // the assembly using the initially exposed skin, never through opaque cover.
   const exposed=point=>{
    const local=source.mesh.worldToLocal(point.clone());
    const cell=source.pieces.reduce((best,p)=>p.center.distanceToSquared(local)<best.center.distanceToSquared(local)?p:best,source.pieces[0]);
    return visible(source.mesh.localToWorld(new THREE.Vector3(cell.center.x,cell.center.y,0)),cell.id);
   };
   for(let i=0;i<layers.length;i++)if(i!==index)layers[i].applyBlast(position,power*Math.pow(.78,Math.abs(index-i)),radius,exposed);
   for(const beam of this.joists){if(!beam.mesh.visible)continue;
    const center=beam.mesh.getWorldPosition(new THREE.Vector3()),distance=center.distanceTo(position);if(distance>radius||!exposed(center))continue;
    beam.health+=blastImpact('wood',distance,power)*.65;
    if(beam.health>=300)this.breakJoist(beam);
   }
  }finally{this.transferring=false;}
 }
 breakJoist(beam,emit=true){
  beam.mesh.userData.renderBatch?.detach(beam.mesh);beam.mesh.visible=false;beam.mesh.userData.isShootable=false;
  const box=beam.mesh.userData.collider,i=this.map.colliders.indexOf(box);if(i>=0)this.map.colliders.splice(i,1);
  if(emit)this.map.emitPanelDebris('floor',beam.mesh.position,new THREE.Vector3(0,-1,0),new THREE.Vector2(beam.b-beam.a,.12),beam.mesh.material.color);
  invalidateSupport(this.map.colliders);
  this.map.shadowsDirty=true;this.map.debris?.wake();
 }
 supported(piece){
  const rows=Math.ceil(this.depth/.65),row=piece.row,px=piece.center.x;
  const beamAt=index=>index===0||index===rows||this.joists.some(b=>b.row===index&&px>=b.a&&px<=b.b&&b.mesh.visible);
  return Number(beamAt(row))+Number(beamAt(row+1));
 }
 update(dt,position,state={}){
  this.loadSound=Math.max(0,(this.loadSound||0)-dt);
  if(!this.joists.length)return;
  if(!this.boards.broken.size&&!this.backing.broken.size&&!this.ceiling.broken.size&&this.joists.every(b=>b.mesh.visible))return;
  this.checkClock+=dt;if(this.checkClock<.15)return;const elapsed=this.checkClock;this.checkClock=0;
  const local=this.boards.mesh.worldToLocal(position.clone()),standing=Math.abs(position.y-this.y-(state.height||1.65))<.35;
  for(const panel of [this.boards,this.backing,this.ceiling]){
   let changed=false;
   for(const p of panel.pieces){if(panel.broken.has(p.id))continue;const supports=this.supported(p);
    const loaded=panel!==this.ceiling&&standing&&Math.hypot(local.x-p.center.x,local.y-p.center.y)<.3&&(panel.health.get(p.id)||0)>panel.toughness*.35;
    if(supports===0||supports===1&&loaded){if(loaded&&!p.loadTime&&!this.loadSound){soundEngine.playWoodHit();this.loadSound=.8;}p.loadTime=(p.loadTime||0)+elapsed*((state.speed||0)>3?1.6:1);if(supports===0||p.loadTime>.45){panel.removePiece(p,new THREE.Vector3(0,-1,0));changed=true;}}
    else p.loadTime=0;
   }
   if(changed)panel.refreshCollision();
  }
 }
}
