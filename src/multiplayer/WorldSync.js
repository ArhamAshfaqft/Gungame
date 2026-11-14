import * as T from 'three';
import {invalidateSupport} from '../world/SupportIndex.js';
import {WorldPresentation} from './WorldPresentation.js';

function packGeometry(g){return{attributes:Object.fromEntries(Object.entries(g.attributes).filter(([k])=>['position','normal','uv','color'].includes(k)).map(([k,a])=>[k,{array:Array.from(a.array),size:a.itemSize}])),index:g.index?Array.from(g.index.array):null,groups:g.groups,draw:{...g.drawRange,count:Number.isFinite(g.drawRange.count)?g.drawRange.count:null}};}
function unpackGeometry(data){const g=new T.BufferGeometry();for(const [key,a] of Object.entries(data.attributes))g.setAttribute(key,new T.Float32BufferAttribute(a.array,a.size));if(data.index)g.setIndex(data.index);g.groups=data.groups||[];g.setDrawRange(data.draw?.start||0,data.draw?.count??Infinity);g.computeBoundingBox();g.computeBoundingSphere();return g;}
export class WorldSync{
 constructor(scene,map,room=map){this.scene=scene;this.map=map;this.room=room;this.meshes=new Map();this.seen=new Map();this.latest=new Map();this.next=0;if(room.doorMesh&&room.doorBox)room.doorBox.supportMesh=room.doorMesh;for(const pane of room.glassPanes||[])if(pane.userData.collider)pane.userData.collider.supportMesh=pane;this.register();this.layout=this.next;for(const [id,m] of this.meshes)this.seen.set(id,this.signature(m));}
 register(){this.scene.updateMatrixWorld(true);this.scene.traverse(m=>{if(!m.isMesh||(!m.userData.isShootable&&!m.userData.breakable&&!m.userData.netWorldId))return;if(m.userData.fractureBatch||m.userData.propBatch)return;if(!m.userData.netWorldId)m.userData.netWorldId=String(this.next++);this.meshes.set(m.userData.netWorldId,m);});}
 signature(m,copyMatrix=true){return{geometry:m.geometry,position:m.geometry.attributes.position.version,index:m.geometry.index?.version,visible:m.visible,matrix:copyMatrix?m.matrixWorld.clone():m.matrixWorld,open:m.userData.breakable?.openAmount,opened:m.userData.breakable?.open??(m===this.room.doorMesh?this.room.door.open:undefined)};}
 collect(){
  this.register();const changes=[];
  for(const [id,m] of this.meshes){const old=this.seen.get(id),now=this.signature(m,false),geometryChanged=!old||old.geometry!==now.geometry||old.position!==now.position||old.index!==now.index;
   if(old&&!geometryChanged&&old.visible===now.visible&&old.matrix.equals(now.matrix)&&old.open===now.open&&old.opened===now.opened)continue;
   const panel=m.userData.breakable,material=Array.isArray(m.material)?m.material[0]:m.material;
   const entry={id,visible:m.visible,matrix:now.matrix.toArray(),shootable:!!m.userData.isShootable};
   if(m.userData.breakableLight)entry.lights=m.userData.breakableLight.lights.map(light=>light.intensity);
   if(m===this.room.doorMesh)entry.trainingDoor={open:this.room.door.open,openAmount:this.room.door.openAmount,destroyed:this.room.door.destroyed,hinge:this.room.doorHinge.matrixWorld.toArray()};
   if(geometryChanged)entry.geometry=packGeometry(m.geometry);
   if(geometryChanged)entry.fractured=!!m.userData.fractureSolids;
   if(old?.visible&&!now.visible){
    const surface=m.userData.physicalMaterial||m.userData.surface||panel?.kind;
    const kind=surface==='glass'||surface==='ceramic'||m.userData.breakableLight?'glassBreak':panel?.isDoor?'doorBreak':null;
    if(kind)entry.effect={kind,id:m.userData.damageRoot?.uuid||id,position:new T.Vector3().setFromMatrixPosition(m.matrixWorld).toArray()};
   }
   if(!entry.effect&&old&&old.opened!==now.opened&&now.visible&&(panel?.isDoor||m===this.room.doorMesh))entry.effect={kind:'doorOpen',id,position:new T.Vector3().setFromMatrixPosition(m.matrixWorld).toArray()};
   if(!old)entry.create={color:material.color?.getHex()??0xaaaaaa,surface:m.userData.physicalMaterial||m.userData.surface||'wood',name:m.name};
   if(panel?.pieces){
    entry.panelMotion={destroyed:panel.destroyed,detached:!!panel.detachedEnvironment,open:panel.open,openAmount:panel.openAmount,group:panel.group.matrixWorld.toArray()};
    if(geometryChanged)entry.panel={broken:[...panel.broken],ranges:panel.pieces.map(p=>[p.start,p.count]),facePieces:m.userData.fractureFacePieces||null,...entry.panelMotion};
   }
   entry.boxes=this.map.colliders.filter(b=>b.supportMesh===m||b.villaPanel?.mesh===m).map(b=>({min:b.min.toArray(),max:b.max.toArray(),door:b.doorGroup?{bounds:[b.doorBounds.min.toArray(),b.doorBounds.max.toArray()],matrix:b.doorGroup.matrixWorld.toArray()}:null}));
   changes.push(entry);const latest={...this.latest.get(id),...entry};delete latest.effect;this.latest.set(id,latest);now.matrix=now.matrix.clone();this.seen.set(id,now);
  }return changes;
 }
 snapshot(){this.collect();return [...this.latest.values()];}
 apply(entries,{interpolate=false,onEffect=null}={}){
  let structural=false;this.presentation??=new WorldPresentation(this.room);
  for(const entry of entries){let m=this.meshes.get(entry.id);
   if(!m){if(!entry.create||!entry.geometry)continue;m=new T.Mesh(new T.BufferGeometry(),new T.MeshStandardMaterial({color:entry.create.color,vertexColors:!!entry.geometry.attributes.color}));m.name=entry.create.name;m.castShadow=m.receiveShadow=true;m.userData={netWorldId:entry.id,surface:entry.create.surface,physicalMaterial:entry.create.surface};this.scene.add(m);this.meshes.set(entry.id,m);}
   const panel=m.userData.breakable,state=entry.panelMotion||entry.panel;
   if(entry.fractured!==undefined)m.userData.networkFractured=entry.fractured;
   if(entry.effect)onEffect?.(entry.effect);
   const object=entry.trainingDoor?this.room.doorHinge:state&&panel?panel.group:m;
   const smooth=interpolate&&!entry.geometry&&entry.visible&&m.visible&&!state?.destroyed&&!entry.trainingDoor?.destroyed;
   const from=smooth?this.presentation.capture(object):null;this.presentation.cancel(object);
   structural ||= !!(entry.geometry||entry.create||entry.lights||entry.visible!==m.visible);
   if(entry.lights&&m.userData.breakableLight)entry.lights.forEach((intensity,i)=>{if(m.userData.breakableLight.lights[i])m.userData.breakableLight.lights[i].intensity=intensity;});
   if(entry.trainingDoor&&this.room.doorMesh){Object.assign(this.room.door,{open:entry.trainingDoor.open,openAmount:entry.trainingDoor.openAmount,destroyed:entry.trainingDoor.destroyed});const hinge=new T.Matrix4().fromArray(entry.trainingDoor.hinge);hinge.decompose(this.room.doorHinge.position,this.room.doorHinge.quaternion,this.room.doorHinge.scale);this.room.doorHinge.updateMatrixWorld(true);}
   m.userData.renderBatch?.detach(m);m.userData.motionBatch?.detach(m);panel?.renderBatch?.detach(panel);
   if(entry.panel&&panel){
    for(const id of entry.panel.broken)if(!panel.broken.has(id))panel.removePiece(panel.pieces[id],new T.Vector3(0,-1,0));
    panel.broken=new Set(entry.panel.broken);
   }
   if(state&&panel){
    panel.destroyed=state.destroyed;panel.detachedEnvironment=!!state.detached;panel.open=state.open;panel.openAmount=state.openAmount;
    const group=new T.Matrix4().fromArray(state.group);if(panel.group.parent)group.premultiply(panel.group.parent.matrixWorld.clone().invert());group.decompose(panel.group.position,panel.group.quaternion,panel.group.scale);panel.group.updateMatrixWorld(true);
   }
   if(entry.geometry){const old=m.geometry;m.geometry=unpackGeometry(entry.geometry);old.dispose();if(panel){for(const cached of panel.punctureGeometry?.values()||[])cached.geometry.dispose();panel.punctureGeometry=null;panel.punctureSolids=null;}}
   if(entry.panel&&panel){entry.panel.ranges.forEach(([start,count],i)=>Object.assign(panel.pieces[i],{start,count}));if(entry.panel.facePieces)m.userData.fractureFacePieces=entry.panel.facePieces;}
   const local=new T.Matrix4().fromArray(entry.matrix);if(m.parent)local.premultiply(m.parent.matrixWorld.clone().invert());local.decompose(m.position,m.quaternion,m.scale);m.visible=entry.visible;m.userData.isShootable=entry.shootable;m.updateMatrixWorld(true);
   const boxes=this.map.colliders;for(let i=boxes.length-1;i>=0;i--)if(boxes[i].supportMesh===m||boxes[i].villaPanel?.mesh===m)boxes.splice(i,1);
   for(const data of entry.boxes||[]){const b=new T.Box3(new T.Vector3().fromArray(data.min),new T.Vector3().fromArray(data.max));b.supportMesh=m;if(data.door){b.doorBounds=new T.Box3(new T.Vector3().fromArray(data.door.bounds[0]),new T.Vector3().fromArray(data.door.bounds[1]));b.doorGroup=new T.Group();b.doorGroup.matrixAutoUpdate=false;b.doorGroup.matrix.fromArray(data.door.matrix);b.doorGroup.matrix.decompose(b.doorGroup.position,b.doorGroup.quaternion,b.doorGroup.scale);b.doorGroup.updateMatrixWorld(true);}boxes.push(b);}
   if(smooth)this.presentation.retarget(object,m,from);
  }
  if(entries.length){invalidateSupport(this.map.colliders);if(structural||!interpolate){this.map.shadowsDirty=true;this.room.shadowsDirty=true;}if(structural)this.map.debris?.wake();}
 }
}
