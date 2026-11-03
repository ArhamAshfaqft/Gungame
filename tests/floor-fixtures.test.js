import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {registerFloorFixture,settleFloorFixtures,rectangularFeet,bindFixtureDecor} from '../src/world/FloorFixtures.js';

test('furniture bridges remaining support, then falls with its collider after floor support is lost',()=>{
 const object=new T.Group();object.position.set(1,3.4,1);
 const top=new T.Mesh(new T.BoxGeometry(1,.1,1),new T.MeshBasicMaterial());top.position.y=.7;object.add(top);object.updateMatrixWorld(true);
 top.userData.collider=new T.Box3().setFromObject(top);let detached=0;top.userData.renderBatch={detach(){detached++;}};
 let supported=true;
 const map={timberFloors:[{x:0,y:3.4,z:3,width:3,depth:3,boards:{broken:new Set([0])},backing:{broken:new Set()}}],rubbleFloor:p=>supported&&p.x<1?3.4:0};
 registerFloorFixture(map,object,[top],rectangularFeet(.8,.8));
 settleFloorFixtures(map,.2);assert.equal(object.position.y,3.4,'remaining feet can bridge a small breach');
 supported=false;for(let i=0;i<160;i++)settleFloorFixtures(map,1/60);
 assert.equal(object.position.y,0);assert.equal(detached,1);assert.ok(Math.abs(top.userData.collider.min.y-.65)<1e-6);assert.equal(map.floorFixtures[0].falling,false);
});

test('tabletop details bind to their supporting furniture, unrelated wall details stay static',()=>{
 const owner=new T.Mesh(new T.BoxGeometry(2,.1,1),new T.MeshBasicMaterial());owner.position.set(0,4,0);owner.updateMatrixWorld(true);owner.userData.collider=new T.Box3().setFromObject(owner);
 const cup=new T.Mesh(new T.BoxGeometry(.1,.2,.1),owner.material);cup.position.set(.3,4.15,0);
 const wallArt=cup.clone();wallArt.position.set(4,5,0);
 const map={floorFixtures:[{meshes:[owner]}],decor:[cup,wallArt]};bindFixtureDecor(map);
 assert.equal(cup.userData.decorOwner,owner);assert.equal(wallArt.userData.decorOwner,undefined);
});
