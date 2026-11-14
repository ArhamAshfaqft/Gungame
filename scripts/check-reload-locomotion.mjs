import {chromium} from 'playwright';import assert from 'node:assert/strict';
const b=await chromium.launch({channel:'chrome',headless:true}),p=await b.newPage({viewport:{width:1200,height:950}}),errors=[];p.on('pageerror',e=>errors.push(e.message));try{
await p.goto('http://127.0.0.1:5181/?map=training');await p.waitForFunction(()=>window.__fastSnipe?.thirdPerson.rig?.animator&&!document.querySelector('#btn-play').disabled);await p.locator('#btn-play').click();await p.keyboard.press('Digit6');await p.keyboard.press('KeyV');await p.waitForTimeout(400);
const results=[];
for(const crouch of [false,true]){if(crouch)await p.keyboard.press('KeyX');for(const keys of [['KeyW'],['KeyS'],['KeyA'],['KeyD'],['KeyW','KeyA'],['KeyW','KeyD'],['KeyS','KeyA'],['KeyS','KeyD']]){
 await p.evaluate(()=>{const w=window.__fastSnipe.weapon;w.cancelReload();w.magAmmo=w.maxMag-1;w.switchTimer=0;});
 for(const k of keys)await p.keyboard.down(k);await p.keyboard.press('KeyR');await p.waitForTimeout(450);
 const read=()=>p.evaluate(()=>{const g=window.__fastSnipe,r=g.thirdPerson.rig;return {reload:g.weapon.isReloading,speed:g.movement.getSpeed(),clip:r.animator.current,gait:r.animator.reloadLocomotion.clip,leg:r.bones.LeftLeg.quaternion.toArray()};});
 const a=await read();await p.waitForTimeout(200);const z=await read();assert.ok(a.reload&&z.reload);assert.equal(z.clip,'reload');assert.ok(z.speed>.15);assert.notDeepEqual(a.leg,z.leg);results.push({crouch,keys,speed:z.speed,gait:z.gait});
 if(keys.length===1&&keys[0]==='KeyW'){
  await p.keyboard.press('KeyP');await p.evaluate(async()=>{const T=await import('/node_modules/three/build/three.module.js'),g=window.__fastSnipe,r=g.thirdPerson.rig;g.poseInspector.controls.target.copy(r.object.position).add(new T.Vector3(0,1,0));g.thirdPerson.camera.position.copy(r.object.position).add(new T.Vector3(-1.8,1.5,2.5).applyQuaternion(r.object.quaternion));g.poseInspector.controls.update();});await p.waitForTimeout(200);await p.screenshot({path:`E:/Cache/Temp/reload-moving-${crouch?'crouch':'stand'}.png`});await p.keyboard.press('KeyP');await p.waitForTimeout(100);
 }
 for(const k of keys)await p.keyboard.up(k);
}}
assert.deepEqual(errors,[]);console.log(JSON.stringify({results,errors}));
}finally{await b.close();}
