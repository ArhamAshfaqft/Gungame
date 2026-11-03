import * as THREE from 'three';
import {createFracturedPanel,timberCells} from './FractureGeometry.js';
import {soundEngine} from '../audio/SoundEngine.js';
import {physicalMaterial,blastImpact,penetrationResponse,projectileEnergy} from './PhysicalMaterials.js';
import {puncturePanel} from './PanelPuncture.js';
import {invalidateSupport} from './SupportIndex.js';
import {syncDamagedCollision} from './MaterialProps.js';
import {dirtyShadowRegion} from '../environment/ShadowCache.js';

// Independent fracture cells retain their own collision, so an actual breach opens
// a walking/throwing route instead of only painting a hole on a solid wall.
export class VillaPanel {
 constructor(map,{x,y,z,width,height,rotation=0,kind='wood',door=false,name='Panel',construction=null}){
  Object.assign(this,{map,width,height,kind,isDoor:door,name,damage:0,destroyed:false,open:false,openAmount:0,baseRotation:rotation});
  this.group=new THREE.Group();this.group.position.set(x,y,z);this.group.rotation.y=rotation;map.scene.add(this.group);
  this.construction=construction;this.thickness=construction?.thickness??(kind==='glass'?.025:kind==='plaster'?.18:kind==='floor'?.2:.065);
  const material=map.materials[kind==='glass'?'glass':kind==='plaster'?'softWall':kind==='floor'?'floorPanel':'woodPanel'];
  // Timber breaks along narrow, longer board sections rather than wall-sized chips.
  const cells=construction?timberCells(width,height,construction.boardWidth):null;
  if(construction?.gap)for(const cell of cells)for(const point of cell.polygon)point.x+=point.x<cell.center.x?construction.gap/2:-construction.gap/2;
  const panel=createFracturedPanel(width,height,this.thickness,material,Math.min(kind==='floor'?24:12,Math.max(3,Math.ceil(width/(kind==='floor'?.22:.4)))),Math.max(4,Math.ceil(height/(kind==='floor'?.9:.4))),cells);
  if(kind!=='wood'){const colors=panel.mesh.geometry.attributes.color,normals=panel.mesh.geometry.attributes.normal;for(let i=0;i<colors.count;i++)if(Math.abs(normals.getZ(i))<.5)colors.setXYZ(i,...(kind==='glass'?[.72,.88,.9]:kind==='floor'?[.5,.36,.22]:[.76,.73,.67]));}
  if(kind==='glass'){
   // Internal fracture-cell faces made intact glazing look cracked. A single
   // double-sided skin is enough until the pane shatters as a whole.
   const g=panel.mesh.geometry;for(let i=0;i<g.index.count;i+=3)if(g.attributes.normal.getZ(g.index.getX(i))<.9)g.index.array.fill(0,i,i+3);
  }
  const uv=panel.mesh.geometry.attributes.uv,positions=panel.mesh.geometry.attributes.position;for(let i=0;i<uv.count;i++)uv.setXY(i,positions.getX(i)/2,positions.getY(i)/2);
  this.mesh=panel.mesh;this.mesh.name=name;this.pieces=panel.pieces;this.broken=new Set();this.health=new Map();this.boxes=new Map();
  this.bulletPatches=new Map();this.bulletPeak=new Map();
  this.mesh.castShadow=kind!=='glass';this.mesh.receiveShadow=true;this.mesh.userData={isShootable:true,surface:kind==='plaster'?'concrete':kind==='floor'?'wood':kind,breakable:this};this.group.add(this.mesh);
  this.mesh.userData.physicalMaterial=kind==='floor'?'wood':kind;this.mesh.userData.thickness=this.thickness;
  this.group.updateMatrixWorld(true);
  for(const piece of this.pieces){const b=piece.bounds;const box=new THREE.Box3(new THREE.Vector3(b.min.x,b.min.y,-(this.thickness/2)),new THREE.Vector3(b.max.x,b.max.y,this.thickness/2)).applyMatrix4(this.mesh.matrixWorld);box.villaPanel=this;box.pieceId=piece.id;this.boxes.set(piece.id,box);}
  this.collisionBoxes=[];this.refreshCollision();
  if(door){const handle=new THREE.Mesh(new THREE.BoxGeometry(.15,.035,.055),map.materials.metal);handle.position.set(width-.17,1.05,.09);this.group.add(handle);this.handle=handle;}
  map.panels.push(this);
 }
 get toughness(){return this.construction?.strength??physicalMaterial(this.mesh).fracture*(this.kind==='floor'?4/3:this.kind==='wood'?(this.isDoor?5/6:11/9):1);}
 blastDamage(position,center,power){
  const delta=center.clone().sub(position),distance=delta.length(),normal=new THREE.Vector3(0,0,1).transformDirection(this.mesh.matrixWorld);
  return blastImpact(physicalMaterial(this.mesh),distance,power,normal.dot(delta.normalize()));
 }
 exposeFrame(){
  if(this.frame||this.kind!=='plaster'||this.height<2.6||this.width<.7)return;
  this.frame=[];
  const add=(x,y,w,h)=>{
   const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,.11),this.map.materials.wood||this.map.materials.woodPanel);
   mesh.position.set(x,y,0);mesh.castShadow=true;mesh.receiveShadow=true;mesh.name='Exposed partition framing';this.group.add(mesh);mesh.updateWorldMatrix(true,false);
   const collider=new THREE.Box3().setFromObject(mesh);mesh.userData={isShootable:true,surface:'wood',woodHealth:180,collider};collider.supportMesh=mesh;this.map.colliders.push(collider);this.frame.push(mesh);
  };
  for(let x=.6;x<this.width-.15;x+=.6)add(x,this.height/2,.055,this.height);
  for(const y of [.04,this.height-.04])add(this.width/2,y,this.width,.08);
 }
 removePiece(piece,direction){
  if(this.broken.has(piece.id))return;
  this.broken.add(piece.id);this.mesh.geometry.index.array.fill(0,piece.start,piece.start+piece.count);this.mesh.geometry.index.needsUpdate=true;this.renderBatch?.removePiece(this,piece);
  this.punctureGeometry?.get(piece.id)?.geometry.dispose();this.punctureGeometry?.delete(piece.id);this.punctureSolids?.delete(piece.id);
  const box=this.boxes.get(piece.id),i=this.map.colliders.indexOf(box);if(i>=0)this.map.colliders.splice(i,1);
  const center=this.mesh.localToWorld(new THREE.Vector3(piece.center.x,piece.center.y,0));
  this.map.emitPanelDebris(this.kind,center,direction,piece.bounds.getSize(new THREE.Vector2()),this.mesh.material.color);
  dirtyShadowRegion(this.map,this.mesh,this.boxes.get(piece.id));
  this.floorAssembly?.onFracture(this);
 }
 syncCollision(){
  this.group.updateWorldMatrix(true,true);
  for(const p of this.pieces){const b=p.bounds;this.boxes.get(p.id).set(new THREE.Vector3(b.min.x,b.min.y,-(this.thickness/2)),new THREE.Vector3(b.max.x,b.max.y,this.thickness/2)).applyMatrix4(this.mesh.matrixWorld);}
  this.refreshCollision();
 }
 refreshCollision(){
  if(this.detachedEnvironment){syncDamagedCollision(this.mesh,this.map.colliders);return;}
  invalidateSupport(this.map.colliders);
  for(const box of this.collisionBoxes){const i=this.map.colliders.indexOf(box);if(i>=0)this.map.colliders.splice(i,1);}
  this.collisionBoxes=[];
  if(!this.broken.size){const box=new THREE.Box3().setFromObject(this.mesh).expandByScalar(this.kind==='floor'?.002:.015);box.villaPanel=this;this.collisionBoxes.push(box);}
  else for(const [id,box] of this.boxes)if(!this.broken.has(id))this.collisionBoxes.push(box);
  this.map.colliders.push(...this.collisionBoxes);
  for(const box of this.collisionBoxes)box.supportMesh=this.mesh;
  if(this.isDoor)for(const box of this.collisionBoxes){
   const piece=box.pieceId===undefined?null:this.pieces[box.pieceId];
   box.doorBounds=new THREE.Box3(new THREE.Vector3(piece?piece.bounds.min.x:0,piece?piece.bounds.min.y:0,-.09),new THREE.Vector3(piece?piece.bounds.max.x:this.width,piece?piece.bounds.max.y:this.height,.09));box.doorGroup=this.group;
  }
  if(this.kind==='floor'&&this.broken.size)this.map.debris?.wake();
  this.map.environment?.supportChanged(this.mesh);
 }
 takeBulletHit(hit,damage=34,direction=new THREE.Vector3(0,0,1),impact=null){
  if(this.destroyed)return{penetrates:true,damageMultiplier:.85};
  if(this.kind==='glass'){for(const p of this.pieces)this.removePiece(p,direction);this.destroyed=true;this.refreshCollision();this.mesh.visible=false;this.mesh.userData.isShootable=false;soundEngine.playGlassBreak();
   if(impact){const normal=new THREE.Vector3(0,0,1).transformDirection(this.mesh.matrixWorld);return penetrationResponse(physicalMaterial(this.mesh),this.mesh.userData.thickness,impact.energy??projectileEnergy(impact.slot,impact.distance,impact.multiplier??1),normal.dot(direction));}
   return{penetrates:true,damageMultiplier:.8};}
  const local=this.mesh.worldToLocal(hit.point.clone());
  const piece=Number.isInteger(hit.instanceId)?this.pieces[hit.instanceId]:this.pieces.reduce((best,p)=>p.center.distanceToSquared(local)<best.center.distanceToSquared(local)?p:best,this.pieces[0]);
  if(!piece||this.broken.has(piece.id))return{penetrates:true,damageMultiplier:.85};
  this.damage+=damage;const radius=.035+Math.sqrt(damage/125)*.08;
  for(const p of this.pieces){if(this.broken.has(p.id))continue;const d=Math.hypot((p.center.x-local.x)/radius,(p.center.y-local.y)/(radius*1.25));if(p!==piece&&d>1)continue;
   // Impacts within a fracture cell still have to group locally. Wide shot
   // spread must not pool every hit across that entire cell into one hole.
   let patches=this.bulletPatches.get(p.id);if(!patches){patches=[];this.bulletPatches.set(p.id,patches);}
   const before=this.bulletPeak.get(p.id)||0;
   let patch=patches.find(a=>Math.hypot(a.x-local.x,a.y-local.y)<.1);
   if(!patch){patch={x:local.x,y:local.y,damage:0};patches.push(patch);if(patches.length>12)patches.shift();}
   patch.damage+=damage*(p===piece?1:(1-d)*.25);
   const peak=Math.max(before,...patches.map(a=>a.damage));this.bulletPeak.set(p.id,peak);
   const hp=(this.health.get(p.id)||0)+peak-before;this.health.set(p.id,hp);if(hp>=this.toughness)this.removePiece(p,direction);
  }
  if(this.broken.size)this.exposeFrame();
  if(this.broken.size===this.pieces.length){this.destroyed=true;this.mesh.visible=false;this.mesh.userData.isShootable=false;if(this.handle)this.handle.visible=false;soundEngine.playDoorBreak();}
  else if(this.kind==='plaster')soundEngine.playImpact(hit.point);else soundEngine.playWoodHit();
  this.refreshCollision();
  if(impact){const normal=new THREE.Vector3(0,0,1).transformDirection(this.mesh.matrixWorld),energy=impact.energy??projectileEnergy(impact.slot,impact.distance,impact.multiplier??1),response=penetrationResponse(physicalMaterial(this.mesh),this.mesh.userData.thickness,energy,normal.dot(direction));
   if(response.penetrates&&(this.mesh.userData.physicalMaterial==='wood'||this.construction&&this.mesh.userData.physicalMaterial==='plaster')&&!this.broken.has(piece.id))puncturePanel(this,hit.point,direction,energy);
   else if(this.mesh.userData.physicalMaterial==='wood'&&!this.broken.has(piece.id)){
    const stress=(this.health.get(piece.id)||0)/this.toughness;
    if(stress>=.35)puncturePanel(this,hit.point,direction,energy,{depth:this.mesh.userData.thickness*Math.min(.85,stress),radius:.009+.01*stress});
   }
   return response;
  }
  return{penetrates:false};
 }
 applyBlast(position,power,radius,visible=()=>true){
  if(this.destroyed)return;
  if(this.kind==='glass'){this.takeBulletHit({point:position},power,new THREE.Vector3(0,0,1));return;}
  const direction=this.group.getWorldPosition(new THREE.Vector3()).sub(position).normalize();let changed=false;
  for(const p of this.pieces){if(this.broken.has(p.id))continue;const center=this.mesh.localToWorld(new THREE.Vector3(p.center.x,p.center.y,0));const delta=center.clone().sub(position),distance=delta.length();if(distance>radius||!visible(center,p.id))continue;
   // Fragmentation damages exposed skins locally; a room-wide blast does not act
   // like a breaching charge. Off-axis hits and distant cells receive much less.
   const damage=this.blastDamage(position,center,power),health=(this.health.get(p.id)||0)+damage;
   this.health.set(p.id,health);if(health>=this.toughness){this.removePiece(p,delta);changed=true;}
  }
  if(changed){this.exposeFrame();this.refreshCollision();if(this.broken.size===this.pieces.length){this.destroyed=true;this.mesh.visible=false;this.mesh.userData.isShootable=false;if(this.handle)this.handle.visible=false;}soundEngine.playDoorBreak();}
  this.floorAssembly?.transferBlast(this,position,power,radius,visible);
 }
 toggle(position,paired=false){if(this.destroyed||this.detachedEnvironment)return;if(!this.open){this.swingSign=position?((position.clone().sub(this.group.position).applyAxisAngle(new THREE.Vector3(0,1,0),-this.baseRotation).z>=0)?1:-1):-1;}this.open=!this.open;if(this.partner&&!paired&&this.partner.open!==this.open)this.partner.toggle(position,true);soundEngine.playDoorOpen();}
 update(dt){if(!this.isDoor||this.destroyed||this.detachedEnvironment)return;const old=this.openAmount;this.openAmount=THREE.MathUtils.damp(old,this.open?1:0,8,dt);if(Math.abs(old-this.openAmount)<.00001)return;this.group.rotation.y=this.baseRotation+(this.swingSign??-1)*this.openAmount*1.65;this.group.updateMatrixWorld(true);for(const p of this.pieces){if(this.broken.has(p.id))continue;const b=p.bounds;this.boxes.get(p.id).set(new THREE.Vector3(b.min.x,b.min.y,-(this.thickness/2)),new THREE.Vector3(b.max.x,b.max.y,this.thickness/2)).applyMatrix4(this.mesh.matrixWorld);}this.refreshCollision();this.map.shadowsDirty=true;}
}
