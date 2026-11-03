import * as THREE from 'three';
import {invalidateSupport} from './SupportIndex.js';
import {syncDamagedCollision} from './MaterialProps.js';

function detachFixture(f){f.object.traverse(mesh=>mesh.userData.renderBatch?.detach(mesh));for(const mesh of f.meshes)if(mesh.userData.contactShadow)mesh.userData.contactShadow.visible=false;}
function moveCollision(map,f){
 f.object.updateMatrixWorld(true);for(const mesh of f.meshes)if(mesh.visible&&mesh.userData.collider){if(mesh.userData.fractureSolids)syncDamagedCollision(mesh,map.colliders);else mesh.userData.collider.setFromObject(mesh);}
 if(map.colliders)invalidateSupport(map.colliders);map.shadowsDirty=true;
}

export function registerFloorFixture(map,object,meshes,feet){
 (map.floorFixtures??=[]).push({object,meshes,feet,baseY:object.position.y,velocity:0,falling:false});
}
export function settleFloorFixtures(map,dt){
 if(map.environment){map.environment.update(dt);return;}
 map.fixtureClock=(map.fixtureClock||0)+dt;const check=map.fixtureClock>=.2;if(check)map.fixtureClock=0;
 for(const f of map.floorFixtures||[]){
  if(f.meshes.every(m=>!m.visible))continue;
  const legs=f.object.userData.supportParts;
  if(legs&&!f.collapsed&&legs.filter(m=>m.visible).length<2){f.collapsed=true;f.collapseRemaining=f.object.userData.supportDrop;detachFixture(f);}
  if(f.collapseRemaining>0){f.velocity-=14*Math.min(dt,.05);const drop=Math.min(f.collapseRemaining,-f.velocity*Math.min(dt,.05));f.object.position.y-=drop;f.floorOffset=(f.floorOffset||0)+drop;f.collapseRemaining-=drop;if(f.collapseRemaining<.001){f.collapseRemaining=0;f.velocity=0;}moveCollision(map,f);continue;}
  if(!f.falling&&!check)continue;
  if(!f.falling&&!map.timberFloors?.some(t=>Math.abs(t.y-f.baseY)<.12&&(t.boards.broken.size||t.backing.broken.size)&&f.object.position.x>=t.x-.6&&f.object.position.x<=t.x+t.width+.6&&f.object.position.z>=t.z-t.depth-.6&&f.object.position.z<=t.z+.6))continue;
  f.object.updateWorldMatrix(true,true);let support=0;
  const offset=f.floorOffset||0;
  for(const foot of f.feet){const p=f.object.localToWorld(foot.clone());support=Math.max(support,map.rubbleFloor(p,f.object.position.y+offset+.02));}
  if(!f.falling&&support>=f.object.position.y+offset-.12)continue;
  if(!f.falling){f.falling=true;detachFixture(f);}
  f.velocity-=14*Math.min(dt,.05);f.object.position.y=Math.max(support-offset,f.object.position.y+f.velocity*Math.min(dt,.05));moveCollision(map,f);
  if(f.object.position.y<=support-offset+.001){f.falling=false;f.baseY=support;f.velocity=0;}
 }
}
export function bindFixtureDecor(map){
 const supports=(map.floorFixtures||[]).flatMap(f=>f.meshes).filter(m=>m.userData.collider);
 for(const mesh of map.decor){
  if(mesh.userData.decorOwner)continue;mesh.updateWorldMatrix(true,false);
  const bounds=new THREE.Box3().setFromObject(mesh),center=bounds.getCenter(new THREE.Vector3());
  const support=supports.find(owner=>{const b=owner.userData.collider;return bounds.min.y>=b.max.y-.03&&bounds.min.y<=b.max.y+.08&&center.x>=b.min.x&&center.x<=b.max.x&&center.z>=b.min.z&&center.z<=b.max.z;});
  if(support)mesh.userData.decorOwner=support;
 }
}
export const rectangularFeet=(w,d)=>[-1,1].flatMap(a=>[-1,1].map(b=>new THREE.Vector3(a*w/2,0,b*d/2)));
