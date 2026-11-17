import * as T from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {extractArmGeometry} from './SwatRig.js';

export const RED_TEAM=0;
const nameOf=name=>name.replace(/^mixamorig[:_]?/i,'').replace(/_\d+$/,'');
let sourcePromise;
const geometryCache=new Map();

function restMatrices(rig){
 const matrices=new Map([[rig.object,new T.Matrix4()]]);
 rig.object.traverse(node=>{
  if(node===rig.object)return;
  const rest=rig.rest.get(node),local=rest?new T.Matrix4().compose(rest.position,rest.quaternion,node.scale):node.matrix.clone();
  matrices.set(node,matrices.get(node.parent).clone().multiply(local));
 });
 return matrices;
}

// Rebind the supplied appearance to our existing skeleton in its rest pose.
// Live bones, clips, weapon constraints, colliders and network state never change.
export function buildTeamSkin(source,rig){
 source.updateMatrixWorld(true);
 const meshes=[];source.traverse(node=>{if(node.isSkinnedMesh)meshes.push(node);});
 if(!meshes.length)throw Error('Red team model has no skinned character');
 const box=new T.Box3().setFromObject(source,true),size=box.getSize(new T.Vector3());
 const target=restMatrices(rig),bones=Object.values(rig.bones),lookup=new Map(bones.map((b,i)=>[nameOf(b.name),i]));
 const head=target.get(rig.bones.Head).elements[13],feet=Math.min(...['LeftFoot','RightFoot'].map(n=>target.get(rig.bones[n]).elements[13]));
 const height=head-feet+.16,scale=height/size.y;
 const normalize=new T.Matrix4().makeScale(scale,scale,scale);
 normalize.setPosition(-(box.min.x+box.max.x)*.5*scale,-box.min.y*scale,-(box.min.z+box.max.z)*.5*scale);
 const parts=[];
 for(const mesh of meshes){
  mesh.skeleton.update();
  const geometry=mesh.geometry.clone(),position=geometry.attributes.position,indices=geometry.attributes.skinIndex,weights=geometry.attributes.skinWeight;
  const transfers=mesh.skeleton.bones.map(bone=>{
   let match=bone;while(match&&!lookup.has(nameOf(match.name)))match=match.parent;
   const index=lookup.get(nameOf(match?.name||'Hips'))??lookup.get('Hips');
   const rigid=matrix=>{const position=new T.Vector3(),rotation=new T.Quaternion();matrix.decompose(position,rotation,new T.Vector3());return new T.Matrix4().compose(position,rotation,new T.Vector3(1,1,1));};
   const sourceRest=rigid(normalize.clone().multiply(bone.matrixWorld));
   return {index,matrix:rigid(target.get(bones[index])).multiply(sourceRest.invert())};
  });
  const point=new T.Vector3(),result=new T.Vector3(),sample=new T.Vector3();
  for(let i=0;i<position.count;i++){
   mesh.getVertexPosition(i,point);point.applyMatrix4(mesh.matrixWorld).applyMatrix4(normalize);result.set(0,0,0);
   for(let k=0;k<4;k++){
    const transfer=transfers[indices.getComponent(i,k)];
    result.addScaledVector(sample.copy(point).applyMatrix4(transfer.matrix),weights.getComponent(i,k));
    indices.setComponent(i,k,transfer.index);
   }
   position.setXYZ(i,result.x,result.y,result.z);
  }
  position.needsUpdate=indices.needsUpdate=true;geometry.computeVertexNormals();geometry.computeBoundingBox();geometry.computeBoundingSphere();
  parts.push({geometry,material:mesh.material,name:mesh.name});
 }
 return {parts,boneNames:bones.map(b=>nameOf(b.name)),inverses:bones.map(b=>target.get(b).clone().invert())};
}

function skinKey(rig){return `${rig.armsOnly?'arms':'body'}:${Object.keys(rig.bones).join(',')}`;}

export async function setRigTeam(rig,team){
 if(!rig)return;
 const state=rig.teamAppearance??={originals:[],requested:null};
 if(!state.originals.length)rig.object.traverse(mesh=>{if(mesh.isSkinnedMesh&&!mesh.userData.teamSkin)state.originals.push({mesh,visible:mesh.visible});});
 state.requested=team;
 if(team!==RED_TEAM){for(const {mesh,visible}of state.originals)mesh.visible=visible;if(state.group)state.group.visible=false;return;}
 if(!state.group){
  if(!state.loading)state.loading=(async()=>{
   sourcePromise??=new GLTFLoader().loadAsync('/assets/operators/red-team.glb').catch(error=>{sourcePromise=null;throw error;});
   const source=(await sourcePromise).scene,key=skinKey(rig);
   let prepared=geometryCache.get(key);if(!prepared){prepared=buildTeamSkin(source,rig);geometryCache.set(key,prepared);}
   const bones=prepared.boneNames.map(name=>rig.bones[name]),skeleton=new T.Skeleton(bones,prepared.inverses.map(m=>m.clone()));
   const group=new T.Group();group.name='Red_team_appearance';
   const aimTarget=state.originals.some(({mesh})=>mesh.userData.isAimTarget);
   for(const part of prepared.parts){
    let mesh=new T.SkinnedMesh(part.geometry,part.material);mesh.bind(skeleton,new T.Matrix4());
    if(rig.armsOnly){mesh.geometry=extractArmGeometry(mesh);if(!mesh.geometry.index.count)continue;}
    mesh.name='Red_'+part.name;mesh.userData={teamSkin:true,isAimTarget:aimTarget,isShootable:false};mesh.castShadow=false;mesh.receiveShadow=!rig.armsOnly;mesh.frustumCulled=!rig.armsOnly;
    mesh.boundingSphere=mesh.geometry.boundingSphere.clone();mesh.boundingSphere.radius*=1.5;
    group.add(mesh);
   }
   group.visible=false;rig.object.add(group);state.group=group;
  })().catch(error=>{state.loading=null;console.warn('Red team appearance unavailable; retaining current model.',error);});
  await state.loading;
 }
 if(state.requested===RED_TEAM&&state.group){for(const {mesh}of state.originals)mesh.visible=false;state.group.visible=true;rig.object.updateMatrixWorld(true);}
}
