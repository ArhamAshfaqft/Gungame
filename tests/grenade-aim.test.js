import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {advanceGrenade,predictGrenade,GRENADE_STEP} from '../src/weapons/GrenadeFlight.js';
import {GrenadeAimGuide} from '../src/weapons/GrenadeAimGuide.js';
const v=(x=0,y=0,z=0)=>new T.Vector3(x,y,z);
const state=launch=>({position:launch.position.clone(),velocity:launch.velocity.clone(),resting:false});

test('first-contact guide ends at the first drop and contains no bounce continuation',()=>{
 const launch={position:v(0,1.65,0),velocity:v(0,2.2,-11)},environment={colliders:[]};
 const guide=predictGrenade(launch,5,environment,{firstContactOnly:true}),full=predictGrenade(launch,5,environment);
 assert.ok(guide.firstImpact);assert.ok(guide.position.equals(guide.firstImpact.position));assert.ok(guide.points.at(-1).equals(guide.position));
 assert.ok(guide.points.length<full.points.length);assert.ok(guide.position.distanceTo(full.position)>1,'actual bounces continue beyond the guide endpoint');
 const p=state(launch);let first;for(let i=0;i<600&&!first;i++)advanceGrenade(p,GRENADE_STEP,{colliders:[],onImpact:position=>{first??=position.clone();}});
 assert.ok(first.distanceTo(guide.position)<1e-9);
});

test('aim prediction matches actual fixed-step flight across render rates, wall bounces and raised floors',()=>{
 const floor=new T.Box3(v(-10,2,-20),v(10,2.2,5)),wall=new T.Box3(v(-10,0,-4),v(10,8,-3.8));
 for(const colliders of [[],[wall],[floor,wall]])for(const velocity of [v(0,2.2,-11),v(0,.5,-4.5),v(2,8,-10)]){
  const launch={position:v(0,3,0),velocity},seconds=3,prediction=predictGrenade(launch,seconds,{colliders});
  for(const rate of [30,60,144]){const p=state(launch);for(let i=0;i<seconds*rate;i++)advanceGrenade(p,1/rate,{colliders});assert.ok(p.position.distanceTo(prediction.position)<1e-8);assert.equal(p.resting,prediction.resting);}
  assert.ok(launch.position.equals(v(0,3,0))&&launch.velocity.equals(velocity),'prediction never edits launch state');
 }
});

test('preview crosses glass and slows like flight without breaking the real pane',()=>{
 let breaks=0;const panel={kind:'glass',takeBulletHit(){breaks++;}},box=new T.Box3(v(-3,0,-1),v(3,5,-.95));box.villaPanel=panel;
 const launch={position:v(0,1.65,0),velocity:v(0,2.2,-11)},prediction=predictGrenade(launch,1,{colliders:[box]});
 assert.equal(breaks,0);assert.ok(prediction.position.z<-2);assert.equal(box.villaPanel,panel);
 const p=state(launch);advanceGrenade(p,GRENADE_STEP*20,{colliders:[box]});assert.equal(breaks,1);
});

test('cooking changes the fuse endpoint while retaining the same initial path',()=>{
 const launch={position:v(0,1.65,0),velocity:v(0,8,-11)},environment={colliders:[]},full=predictGrenade(launch,5.5,environment),cooked=predictGrenade(launch,.2,environment);
 assert.ok(full.position.distanceTo(cooked.position)>3);assert.equal(cooked.firstImpact,null);assert.equal(cooked.resting,false);assert.ok(full.resting);
 for(let i=0;i<5;i++)assert.ok(full.points[i].equals(cooked.points[i]));
});

test('a grenade resting above ground falls when destruction removes its supporting floor',()=>{
 const floor=new T.Box3(v(-10,2,-10),v(10,2.2,10)),colliders=[floor],p=state({position:v(0,3,0),velocity:v()});
 for(let i=0;i<360;i++)advanceGrenade(p,GRENADE_STEP,{colliders});assert.ok(p.resting);const height=p.position.y;
 colliders.length=0;for(let i=0;i<60;i++)advanceGrenade(p,GRENADE_STEP,{colliders});assert.ok(p.position.y<height-.5,'resting must not freeze a grenade in mid-air after its support breaks');
});

test('arc buffers are reused, have visible pixel width, and keep overlays out of damage and SSAO',()=>{
 const guide=new GrenadeAimGuide(),camera=new T.PerspectiveCamera(),launch={position:v(0,1.65,0),velocity:v(0,2.2,-11)},prediction=predictGrenade(launch,5,{colliders:[]});
 const buffer=guide.geometry.attributes.instanceStart.data;guide.update(prediction,'high',camera);assert.ok(guide.arc.material.linewidth>=3);assert.ok(guide.geometry.instanceCount>2);assert.ok(guide.marker.visible);
 guide.update(prediction,'low',camera);assert.equal(guide.geometry.attributes.instanceStart.data,buffer);assert.equal(guide.mode,'low');
 guide.traverse(o=>{assert.equal(o.userData.ssao,false);assert.ok(!o.userData.isShootable);});assert.equal(guide.arc.material.depthTest,true,'cover must hide the trajectory instead of exposing routes through walls');
});


test('guide keeps every ballistic point unshifted, including its connected marker endpoint',()=>{
 const guide=new GrenadeAimGuide(),camera=new T.PerspectiveCamera(),prediction=predictGrenade({position:v(0,1.65,0),velocity:v(0,2.2,-11)},5,{colliders:[]},{firstContactOnly:true});
 guide.update(prediction,'high',camera);
 assert.ok(guide.marker.position.equals(prediction.position));
 const data=guide.geometry.attributes.instanceStart.data.array;
 for(let i=0;i<prediction.points.length-1;i++)for(let j=0;j<3;j++)assert.ok(Math.abs(data[i*6+j]-prediction.points[i].getComponent(j))<1e-5);
 const offset=(prediction.points.length-2)*6+3;
 assert.ok(v().fromArray(data,offset).distanceTo(guide.marker.position)<1e-5);
});
