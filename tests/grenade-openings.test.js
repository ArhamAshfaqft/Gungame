import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {VillaPanel} from '../src/world/VillaPanel.js';
import {puncturePanel} from '../src/world/PanelPuncture.js';
import {sweepSphere} from '../src/weapons/CombatQueries.js';
import {predictGrenade,advanceGrenade,GRENADE_RADIUS} from '../src/weapons/GrenadeFlight.js';
const v=(x=0,y=0,z=0)=>new T.Vector3(x,y,z);
function fixture(door,rotation=0){
 const material=new T.MeshStandardMaterial(),map={scene:new T.Scene(),colliders:[],panels:[],materials:{woodPanel:material,metal:material},emitPanelDebris(){}};
 const panel=new VillaPanel(map,{x:0,y:0,z:0,width:2,height:2.8,kind:'wood',door,rotation});map.scene.updateMatrixWorld(true);return{map,panel};
}
for(const door of [false,true])for(const rotation of [0,.7])test(`grenade clearance follows a punctured ${door?'door':'wall'} rotated ${rotation}`,()=>{
 const {panel,map}=fixture(door,rotation),world=p=>panel.mesh.localToWorld(p.clone()),direction=v(0,0,-1).transformDirection(panel.mesh.matrixWorld);
 const crossing=(x=1,reverse=false)=>sweepSphere(world(v(x,1.4,reverse?-1:1)),world(v(x,1.4,reverse?1:-1)),GRENADE_RADIUS,map.colliders);
 assert.ok(crossing(),'intact material blocks');
 assert.ok(puncturePanel(panel,world(v(1,1.4,panel.thickness/2)),direction,1500,{radius:.25}));
 assert.equal(crossing(),null,'wide visible channel clears the sphere');assert.equal(crossing(1,true),null,'channel also clears from the reverse side');
 assert.ok(crossing(1.23),'sphere clips the hole rim even if its centre fits');
 assert.ok(crossing(.5),'adjacent wood stays solid');
 // Cached collision must follow subsequent changes to the displayed channel.
 assert.ok(puncturePanel(panel,world(v(.5,1.4,panel.thickness/2)),direction,1500,{radius:.02}));
 assert.ok(crossing(.5),'a bullet-sized hole cannot fit a grenade');
});
test('actual fixed-step flight and prediction both pass a real door opening',()=>{
 const {map,panel}=fixture(true);
 puncturePanel(panel,v(1,1.4,panel.thickness/2),v(0,0,-1),1500,{radius:.25});
 const launch={position:v(1,1.45,1),velocity:v(0,0,-11)},prediction=predictGrenade(launch,.3,{colliders:map.colliders},{firstContactOnly:true});
 assert.equal(prediction.firstImpact,null);assert.ok(prediction.position.z<-2);
 for(const rate of [30,60,144]){
  const p={position:launch.position.clone(),velocity:launch.velocity.clone()};let contacts=0;
  for(let i=0;i<rate;i++)advanceGrenade(p,.3/rate,{colliders:map.colliders,onBounce:()=>contacts++});
  assert.equal(contacts,0);assert.ok(p.position.distanceTo(prediction.position)<1e-8);
 }
});
