import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {SniperWeapon} from '../src/weapons/SniperWeapon.js';
import {WEAPONS,createAmmoStores,environmentalDamage} from '../src/weapons/WeaponProfiles.js';
import {projectileEnergy} from '../src/world/PhysicalMaterials.js';
import {Throwables} from '../src/weapons/Throwables.js';
import {emptyLibrary,validateLibrary} from '../src/studio/PoseLibrary.js';
import {soundEngine} from '../src/audio/SoundEngine.js';

for(const name of ['playAssaultShot','playDraw','playReload','playScopeZoom','playUtility','playDryFire'])soundEngine[name]=()=>{};
class Weapon extends SniperWeapon{
 loadAssets(){}
 performRaycast(){this.shots=(this.shots||0)+1;}
}
function setup(){
 globalThis.window=new EventTarget();globalThis.document=new EventTarget();
 const camera=new T.PerspectiveCamera(85,1,.01,200),scene=new T.Scene(),movement={isLocked:true,isGrounded:true,isDisabled:false,currentFov:85,standHeight:1.65,sprintRecovery:0,pitch:0,yaw:0,position:new T.Vector3(0,1.65,0),velocity:new T.Vector3(),mouseDelta:new T.Vector2(),getSpeed:()=>0,requestWeaponReady(){},resetInput(){}};
 const weapon=new Weapon(scene,camera,movement);weapon.switchWeapon('assault');advance(weapon,.35);return {weapon,movement,scene,camera};
}
function advance(weapon,seconds,fps=60){for(let i=0;i<Math.round(seconds*fps);i++)weapon.update(1/fps);}
function event(type,fields={}){const e=new Event(type);Object.assign(e,fields);window.dispatchEvent(e);}

test('assault rifle has independent ammunition and registered 5.56 penetration between pistol and sniper',()=>{
 const stores=createAmmoStores();assert.deepEqual(stores.assault,{ammo:30,reserve:120,cooldown:0});assert.notEqual(stores.assault,stores.primary);
 assert.ok(projectileEnergy('pistol',10)<projectileEnergy('assault',10));assert.ok(projectileEnergy('assault',10)<projectileEnergy('primary',10));
 assert.equal(environmentalDamage('assault',0),WEAPONS.assault.bodyDamage);assert.ok(environmentalDamage('assault',120)<environmentalDamage('assault',0));
});

test('held mouse fires near 600 RPM across frame rates, release stops, and no bolt cycle starts',()=>{
 for(const fps of [20,60,144]){
  const {weapon}=setup();event('mousedown',{button:0});advance(weapon,1,fps);event('mouseup',{button:0});
  const fired=30-weapon.magAmmo;assert.ok(fired>=10&&fired<=11,`${fps} FPS fired ${fired} rounds`);assert.equal(weapon.boltDelay,0);assert.equal(weapon.boltActive,false);
  advance(weapon,.4,fps);assert.equal(30-weapon.magAmmo,fired,'releasing the trigger stops automatic fire');
 }
});

test('pause, focus loss and switching weapons clear automatic fire',()=>{
 for(const action of ['pause','blur','switch']){
  const {weapon,movement}=setup();event('mousedown',{button:0});advance(weapon,.2);
  if(action==='pause'){movement.isLocked=false;document.dispatchEvent(new Event('pointerlockchange'));}else if(action==='blur')event('blur');else weapon.switchWeapon('pistol');
  assert.equal(weapon.triggerHeld,false);const ammo=weapon.ammoStores.assault.ammo;advance(weapon,.5);assert.equal(weapon.ammoStores.assault.ammo,ammo);
 }
});

test('assault reload respects reserve ammunition and cancellation preserves the partial magazine',()=>{
 const {weapon}=setup();weapon.magAmmo=7;weapon.reload();advance(weapon,.8);assert.equal(weapon.magAmmo,7);
 weapon.switchWeapon('primary');advance(weapon,3);assert.equal(weapon.ammoStores.assault.ammo,7);assert.equal(weapon.ammoStores.assault.reserve,120);
 weapon.switchWeapon('assault');advance(weapon,.3);weapon.reserveAmmo=9;weapon.reload();advance(weapon,2.3);assert.equal(weapon.magAmmo,16);assert.equal(weapon.reserveAmmo,0);
});

test('empty assault magazine reloads automatically and does not fire during the reload',()=>{
 const {weapon}=setup();weapon.magAmmo=1;event('mousedown',{button:0});advance(weapon,.25);assert.equal(weapon.magAmmo,0);assert.equal(weapon.isReloading,true);
 event('mouseup',{button:0});advance(weapon,2.3);assert.equal(weapon.magAmmo,30);assert.equal(weapon.reserveAmmo,90);
});

test('equipping a grenade clears held fire and a live grenade cannot be bypassed with the rifle key',()=>{
 const {weapon,movement,scene,camera}=setup(),equipment=new Throwables(scene,camera,movement,weapon);
 event('mousedown',{button:0});event('keydown',{code:'Digit3',repeat:false});assert.equal(weapon.triggerHeld,false);assert.equal(weapon.grenadeEquipped,true);
 equipment.pullPin();assert.equal(weapon.switchWeapon('assault'),false);assert.equal(weapon.grenadeEquipped,true);
});

test('older saved poses gain independent assault defaults without changing existing weapon edits',()=>{
 const old=emptyLibrary();old.poses['primary:hip'].Left.position=[.02,.01,.03];delete old.poses['assault:hip'];delete old.poses['assault:aim'];delete old.thirdPerson.assault;delete old.thirdPersonGrips.assault;delete old.thirdPersonRightGrips.assault;
 const migrated=validateLibrary(old);assert.deepEqual(migrated.poses['primary:hip'],old.poses['primary:hip']);assert.deepEqual(migrated.poses['assault:hip'],emptyLibrary().poses['assault:hip']);
 migrated.poses['assault:hip'].Left.position[0]=.1;assert.equal(migrated.poses['primary:hip'].Left.position[0],.02);
});
