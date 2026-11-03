import * as T from 'three';
import {chipBox,punctureProp} from '../world/SurfaceGeometry.js';
import {severSlenderWood} from '../world/MaterialProps.js';
import {dentMetal} from '../world/MetalDeformation.js';
import {projectSurfaceMark,projectFloorMark,surfaceRevision} from '../world/SurfaceDecal.js';

const STATE=['fractureSolids','surfaceCuts','projectileHoles','jointCuts','woodAnchors','metalPrepared','metalDents'];
export const geometryRevision=mesh=>`${mesh.geometry.uuid}:${mesh.geometry.attributes.position.version}:${mesh.geometry.index?.version||0}:${mesh.visible}`;
export function packGeometry(g,keys=['position','normal','uv','color']){const attributes={};for(const key of keys)if(g.attributes[key]){const a=g.attributes[key];attributes[key]={array:a.array.slice(),itemSize:a.itemSize,normalized:a.normalized};}return{attributes,index:g.index?.array.slice()||null,type:g.type,parameters:g.parameters?{...g.parameters}:null,groups:g.groups.map(v=>({...v})),drawRange:{...g.drawRange}};}
export function unpackGeometry(data){const g=new T.BufferGeometry();for(const [key,a] of Object.entries(data.attributes))g.setAttribute(key,new T.BufferAttribute(a.array,a.itemSize,a.normalized));if(data.index)g.setIndex(new T.BufferAttribute(data.index,1));g.type=data.type;if(data.parameters)g.parameters=data.parameters;g.groups=data.groups||[];if(data.drawRange)g.setDrawRange(data.drawRange.start,data.drawRange.count);g.computeBoundingBox();g.computeBoundingSphere();return g;}
function packState(userData){const out={};for(const key of STATE){const value=userData[key];if(value===undefined)continue;out[key]=key==='fractureSolids'?value.map(s=>s.map(f=>f.map(v=>v.toArray()))):key==='projectileHoles'?value.map(v=>v.toArray()):value;}return out;}
function unpackState(data){const out={...data};if(out.fractureSolids)out.fractureSolids=out.fractureSolids.map(s=>s.map(f=>f.map(v=>new T.Vector3().fromArray(v))));if(out.projectileHoles)out.projectileHoles=out.projectileHoles.map(v=>new T.Vector3().fromArray(v));return out;}
export function operation(kind,mesh,args=[]){return{kind,mesh,args};}
export function markOperation(entry){return{kind:entry.floorOverlay?'floorMark':'mark',mesh:entry.mesh,entry};}
export function runOperation(op){const {mesh,args}=op;switch(op.kind){case'chip':return chipBox(mesh,...args);case'puncture':return punctureProp(mesh,...args);case'sever':return severSlenderWood(mesh,...args,op.colliders||[]);case'dent':return dentMetal(mesh,...args);case'mark':case'floorMark':return mesh.visible&&!op.entry.removed&&(op.kind==='floorMark'?projectFloorMark(op.entry):projectSurfaceMark(op.entry));default:throw Error(`Unknown geometry operation ${op.kind}`);}}
export function packOperation(op){const {mesh}=op;mesh.updateWorldMatrix(true,false);return{kind:op.kind,geometry:packGeometry(mesh.geometry),state:packState(mesh.userData),material:{physicalMaterial:mesh.userData.physicalMaterial,surface:mesh.userData.surface,construction:mesh.userData.construction,grainAxis:mesh.userData.grainAxis},args:op.args?.map(a=>a?.isVector3?a.toArray():a),matrix:mesh.matrixWorld.toArray(),mark:op.entry?{local:op.entry.local.toArray(),rotation:op.entry.rotation.toArray(),size:op.entry.size.toArray()}:null};}
export function computeOperation(data){
 const mesh=new T.Mesh(unpackGeometry(data.geometry),new T.MeshStandardMaterial());mesh.userData={...data.material,...unpackState(data.state)};mesh.matrixAutoUpdate=false;mesh.matrix.fromArray(data.matrix);mesh.updateMatrixWorld(true);const geometry=mesh.geometry,pv=geometry.attributes.position.version;
 let op;if(data.kind==='mark'||data.kind==='floorMark'){const decal=new T.Mesh(new T.BufferGeometry(),new T.MeshStandardMaterial());op=markOperation({mesh,decal,local:new T.Vector3().fromArray(data.mark.local),rotation:new T.Quaternion().fromArray(data.mark.rotation),size:new T.Vector3().fromArray(data.mark.size),floorOverlay:data.kind==='floorMark'});}
 else op=operation(data.kind,mesh,data.args.map(a=>Array.isArray(a)?new T.Vector3().fromArray(a):a));
 const value=runOperation(op);if(op.entry)return{value,geometry:packGeometry(op.entry.decal.geometry)};
 return{value,geometry:mesh.geometry!==geometry||mesh.geometry.attributes.position.version!==pv?packGeometry(mesh.geometry):null,state:packState(mesh.userData),visible:mesh.visible,isShootable:mesh.userData.isShootable};
}
export function applyOperation(op,result){
 const {mesh}=op;if(!mesh.visible||op.entry?.removed)return false;
 if(op.entry){
  const entry=op.entry,motion=entry.decal.userData.motionBatch;motion?.detach(entry.decal);entry.decal.geometry.dispose();entry.decal.geometry=unpackGeometry(result.geometry);entry.decal.position.set(0,0,0);entry.decal.quaternion.identity();entry.decal.scale.set(1,1,1);mesh.add(entry.decal);entry.revision=surfaceRevision(mesh);entry.sourceIndex=mesh.geometry.index;entry.sourcePositions=mesh.geometry.attributes.position;if(result.value&&motion)motion.add(entry.decal);return result.value;
 }
 if(result.geometry){mesh.userData.renderBatch?.detach(mesh);mesh.userData.motionBatch?.detach(mesh);mesh.geometry.dispose();mesh.geometry=unpackGeometry(result.geometry);}
 Object.assign(mesh.userData,unpackState(result.state));mesh.visible=result.visible;if(result.isShootable!==undefined)mesh.userData.isShootable=result.isShootable;return result.value;
}
export function transfers(value,list=[]){if(ArrayBuffer.isView(value)){if(!list.includes(value.buffer))list.push(value.buffer);}else if(value&&typeof value==='object')for(const v of Object.values(value))transfers(v,list);return list;}
