import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyLibrary,validateLibrary} from '../src/studio/PoseLibrary.js';
import {ThirdPersonView} from '../src/player/ThirdPersonView.js';
import {expandedRifleClip} from '../src/models/ShooterAnimator.js';

test('shared first-person mode migrates safely and saves per weapon without replacing pose data',()=>{
 const library=emptyLibrary();library.poses['pistol:aim'].Right.position[0]=.03;
 const old=structuredClone(library);delete old.sharedFirstPerson;
 assert.ok(Object.values(validateLibrary(old).sharedFirstPerson).every(value=>value===false));
 library.sharedFirstPerson.assault=true;
 const saved=validateLibrary(JSON.parse(JSON.stringify(library)));
 assert.deepEqual(saved,library);assert.equal(saved.sharedFirstPerson.pistol,false);
 assert.equal(saved.poses['pistol:aim'].Right.position[0],.03);
 assert.throws(()=>validateLibrary({...library,sharedFirstPerson:{assault:'yes'}}));
});
test('game uses one body for linked weapons, restores third-person mode and falls back for unlinked weapons or death',()=>{
 const view=Object.create(ThirdPersonView.prototype);
 Object.assign(view,{rig:{},enabled:false,equipment:{held:null},weapon:{activeSlot:'assault',poseLibrary:{sharedFirstPerson:{assault:true}}},movement:{isDisabled:false}});
 assert.equal(view.usesBodyFirstPerson,true);
 view.enabled=true;assert.equal(view.usesBodyFirstPerson,false);
 view.enabled=false;view.movement.isDisabled=true;assert.equal(view.usesBodyFirstPerson,false);
 view.movement.isDisabled=false;view.weapon.activeSlot='pistol';assert.equal(view.usesBodyFirstPerson,false);
 view.weapon.activeSlot='assault';view.equipment.held={type:'frag'};assert.equal(view.usesBodyFirstPerson,false);
});
test('camera linking preserves Ready and ADS state selection, while hip firing raises the rifle',()=>{
 const available=new Set(['idle','rifleReadyIdle']);
 assert.equal(expandedRifleClip({speed:0,isAiming:false},available),'rifleReadyIdle');
 assert.equal(expandedRifleClip({speed:0,isAiming:false,sharedHolding:true},available),'rifleReadyIdle');
 assert.equal(expandedRifleClip({speed:0,isAiming:false,isFiring:true},available),'idle');
 assert.equal(expandedRifleClip({speed:0,isAiming:true},available),'idle');
});
