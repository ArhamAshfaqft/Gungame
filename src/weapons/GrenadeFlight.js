import * as T from 'three';
import {sweepSphere} from './CombatQueries.js';
import {supportCandidates} from '../world/SupportIndex.js';

export const GRENADE_STEP=1/120,GRENADE_RADIUS=.065;
const queries=new WeakMap();
function candidates(colliders,start,end){
 let q=queries.get(colliders);if(!q){q={map:{colliders},seen:new Set(),boxes:[],point:new T.Vector3()};queries.set(colliders,q);}
 q.seen.clear();q.boxes.length=0;
 for(let x=Math.floor((Math.min(start.x,end.x)-GRENADE_RADIUS)/2);x<=Math.floor((Math.max(start.x,end.x)+GRENADE_RADIUS)/2);x++)
  for(let z=Math.floor((Math.min(start.z,end.z)-GRENADE_RADIUS)/2);z<=Math.floor((Math.max(start.z,end.z)+GRENADE_RADIUS)/2);z++)
   for(const box of supportCandidates(q.map,q.point.set(x*2+1,0,z*2+1)))if(!q.seen.has(box)){q.seen.add(box);q.boxes.push(box);}
 return q.boxes;
}

// Same fixed step for prediction, local grenades and the match host. Prediction
// records glass crossings without mutating doors, windows, water or audio.
export function advanceGrenade(p,delta,{colliders,room,onBounce=()=>{},preview=false,onImpact=null}){
 if(p.resting){
  const s=p.restSupport,m=s?.box.supportMesh||s?.box.villaPanel?.mesh;
  if(s&&(!colliders.includes(s.box)||!s.min.equals(s.box.min)||!s.max.equals(s.box.max)||m&&(!m.visible||m.geometry!==s.geometry||m.geometry.index?.version!==s.index))){p.resting=false;p.restSupport=null;p.flightAccumulator=0;}
  else return;
 }
 p.flightAccumulator=(p.flightAccumulator||0)+delta;
 while(p.flightAccumulator+1e-10>=GRENADE_STEP&&!p.resting){
  p.flightAccumulator=Math.max(0,p.flightAccumulator-GRENADE_STEP);
  const from=p.position.clone();p.velocity.y-=12*GRENADE_STEP;
  const next=p.position.clone().addScaledVector(p.velocity,GRENADE_STEP);
  const ignore=box=>p.previewGlass?.has(box.villaPanel||box);
  let hit=sweepSphere(p.position,next,GRENADE_RADIUS,candidates(colliders,p.position,next),ignore);
  if(hit?.box.villaPanel?.kind==='glass'){
   const panel=hit.box.villaPanel;
   if(preview)(p.previewGlass??=new Set()).add(panel);
   else panel.takeBulletHit({point:p.position.clone().lerp(next,hit.time)},34,p.velocity.clone().normalize());
   p.velocity.multiplyScalar(.75);hit=null;
  }
  if(hit&&room&&hit.box===room.doorBox){
   const point=room.doorMesh.worldToLocal(p.position.clone().lerp(next,hit.time)),center=new T.Vector2(point.x,point.y);
   if(!room.doorPieces.some(piece=>!room.brokenBoards.has(piece.id)&&piece.bounds.distanceToPoint(center)<GRENADE_RADIUS))hit=null;
  }
  if(hit&&room){
   const pane=room.glassPanes?.find(pane=>pane.userData.collider===hit.box);
   if(pane&&!pane.userData.shattered){
    if(preview)(p.previewGlass??=new Set()).add(hit.box);
    else room.shatterGlass(pane,{point:p.position.clone().lerp(next,hit.time)},p.velocity.clone().normalize());
    p.velocity.multiplyScalar(.75);hit=null;
   }
  }
  if(hit){
   p.position.lerp(next,Math.max(0,hit.time-.002)).addScaledVector(hit.normal,.002);
   p.velocity.reflect(hit.normal).multiplyScalar(.48);onImpact?.(p.position,hit.normal);onBounce(p);
   if(hit.normal.y>.5&&p.velocity.length()<.5){p.resting=true;p.velocity.set(0,0,0);const mesh=hit.box.supportMesh||hit.box.villaPanel?.mesh;p.restSupport={box:hit.box,min:hit.box.min.clone(),max:hit.box.max.clone(),geometry:mesh?.geometry,index:mesh?.geometry.index?.version};}
  }else p.position.copy(next);
  if(!preview)room?.liquids?.crossing(from,p.position,'grenade',p.velocity.length());
  if(p.position.y<GRENADE_RADIUS){
   p.position.y=GRENADE_RADIUS;p.velocity.y=Math.abs(p.velocity.y)*.35;p.velocity.x*=.72;p.velocity.z*=.72;
   onImpact?.(p.position,new T.Vector3(0,1,0));onBounce(p);
   if(p.velocity.length()<.5){p.resting=true;p.velocity.set(0,0,0);}
  }
  if(p.mesh){p.mesh.rotation.x+=p.velocity.length()*GRENADE_STEP*2;p.mesh.rotation.z+=GRENADE_STEP*3;}
 }
}

export function predictGrenade(launch,seconds,environment,{firstContactOnly=false}={}){
 const state={position:launch.position.clone(),velocity:launch.velocity.clone(),resting:false},points=[state.position.clone()];
 let firstImpact=null,lastNormal=new T.Vector3(0,1,0);
 const steps=Math.max(0,Math.floor(seconds/GRENADE_STEP));
 for(let i=0;i<steps&&!state.resting;i++){
  advanceGrenade(state,GRENADE_STEP,{...environment,preview:true,onImpact:(position,normal)=>{if(firstContactOnly&&firstImpact)return;lastNormal.copy(normal);firstImpact??={position:position.clone(),normal:normal.clone()};points.push(position.clone());}});
  if(firstContactOnly&&firstImpact)return{points,position:firstImpact.position,normal:firstImpact.normal,firstImpact,resting:false};
  if(i%4===3)points.push(state.position.clone());
 }
 points.push(state.position.clone());
 return{points,position:state.position,normal:lastNormal,firstImpact,resting:state.resting};
}
