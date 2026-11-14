import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {planVault} from '../src/player/VaultTraversal.js';
import {VillaPanel} from '../src/world/VillaPanel.js';
import {attachMuzzleFlash,updateMuzzleFlash} from '../src/models/MuzzleFlash.js';

test('window vault clears a sill, but rejects intact glass and low headroom',()=>{
 const box=(x,y,z,w,h,d)=>new T.Box3(new T.Vector3(x-w/2,y,z-d/2),new T.Vector3(x+w/2,y+h,z+d/2));
 const sill=box(0,0,-.7,2,1,.22),lintel=box(0,2.5,-.7,2,.6,.22),p=new T.Vector3(0,1.65,0);
 const vault=planVault(p,1.65,0,[sill,lintel]);assert.ok(vault);assert.ok(vault.at(1).z<-.7-.45);
 assert.equal(planVault(p,1.65,0,[sill,lintel,box(0,1,-.7,2,1.5,.03)]),null);
 assert.equal(planVault(p,1.65,0,[sill,box(0,1.8,-.7,2,1,.22)]),null);
 assert.equal(planVault(p,1.65,Math.PI,[sill,lintel]),null);
});

test('running approaches can vault a wide window at a slight angle',()=>{
 const sill=new T.Box3(new T.Vector3(-3,0,-.81),new T.Vector3(3,.65,-.59));
 const lintel=new T.Box3(new T.Vector3(-3,2.85,-.81),new T.Vector3(3,3.2,-.59));
 const p=new T.Vector3(0,1.65,.7),vault=planVault(p,1.65,.18,[sill,lintel],7.2);
 assert.ok(vault,'angle and running approach are accepted');
 const end=vault.at(1);p.z+=10;
 assert.deepEqual(vault.at(1),end,'route remains anchored to takeoff');
 assert.ok(end.z<-.81-.43);assert.ok(vault.duration<.65);
});

test('door handle loses support locally, without needing to destroy the whole leaf',()=>{
 const wood=new T.MeshStandardMaterial(),metal=new T.MeshStandardMaterial();let debris=0;
 const map={scene:new T.Scene(),materials:{woodPanel:wood,metal},colliders:[],panels:[],emitPanelDebris(){debris++;}};
 const panel=new VillaPanel(map,{x:0,y:0,z:0,width:1.35,height:2.3,door:true});
 panel.syncHandle();assert.equal(panel.handle.visible,true);
 for(const piece of panel.pieces)if(piece.bounds.distanceToPoint(new T.Vector2(panel.handle.position.x,1.05))<.13)panel.removePiece(piece,new T.Vector3());
 panel.syncHandle();assert.equal(panel.handle.visible,false);assert.ok(panel.broken.size<panel.pieces.length);
 const count=debris;panel.syncHandle();assert.equal(debris,count,'handle drops only once');
});

test('muzzle flashes sit ahead of the barrel and disappear within milliseconds',()=>{
 const model=new T.Group();model.add(new T.Mesh(new T.BoxGeometry(.04,.04,.5)));
 const sprite=attachMuzzleFlash(model,'assault');assert.ok(sprite.position.z<-.25);
 updateMuzzleFlash(model,.005,true);assert.equal(sprite.visible,true);
 updateMuzzleFlash(model,.04,true);assert.equal(sprite.visible,false);
 updateMuzzleFlash(model,0,false);assert.equal(sprite.visible,false);
});
