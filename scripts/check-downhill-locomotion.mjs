import {chromium} from 'playwright';import assert from 'node:assert/strict';
const b=await chromium.launch({channel:'chrome',headless:true}),results=[],errors=[];try{
for(const map of ['training','villa']){
 const p=await b.newPage({viewport:{width:1200,height:950}});p.on('pageerror',e=>errors.push(e.message));await p.goto('http://127.0.0.1:5181/?map='+map);await p.waitForFunction(()=>window.__fastSnipe?.thirdPerson.rig?.animator&&!document.querySelector('#btn-play').disabled,{timeout:60000});await p.locator('#btn-play').click();await p.keyboard.press('KeyV');
 for(const crouch of [false,true]){
 await p.evaluate(async crouch=>{const T=await import('/node_modules/three/build/three.module.js'),g=window.__fastSnipe,m=g.movement,r=g.arena.colliders.find(c=>c.ramp)?.ramp,z=-r.length/2+1;const feet=r.position.y+r.height*(.5-z/r.length);m.isCrouching=crouch;m.currentHeight=crouch?m.crouchHeight:m.standHeight;m.position.set(0,feet+m.currentHeight,z).sub(new T.Vector3(0,r.position.y,0)).applyAxisAngle(new T.Vector3(0,1,0),r.rotation).add(r.position);m.velocity.set(0,0,0);m.isGrounded=true;m.yaw=Math.PI+r.rotation;m.pitch=0;g.weapon.switchWeapon(crouch?'assault':'primary');},crouch);
 await p.keyboard.down('KeyW');
 const data=await p.evaluate(()=>new Promise(resolve=>{const frames=[];let previous=null,motion=0;const sample=()=>{const g=window.__fastSnipe,m=g.movement,r=g.thirdPerson.rig,q=r.bones.LeftLeg.quaternion.clone();if(previous)motion+=previous.angleTo(q);previous=q;frames.push({grounded:m.isGrounded,clip:r.animator.current,speed:m.getSpeed()});if(frames.length<65)requestAnimationFrame(sample);else resolve({airborne:frames.filter(f=>!f.grounded).length,jumpFrames:frames.filter(f=>f.clip==='jump').length,motion,clips:[...new Set(frames.map(f=>f.clip))]});};requestAnimationFrame(sample);}));
 assert.equal(data.airborne,0);assert.equal(data.jumpFrames,0);assert.ok(data.motion>.2);results.push({map,crouch,...data});
 if(!crouch){await p.keyboard.press('KeyP');await p.evaluate(async()=>{const T=await import('/node_modules/three/build/three.module.js'),g=window.__fastSnipe,r=g.thirdPerson.rig;g.poseInspector.controls.target.copy(r.object.position).add(new T.Vector3(0,1,0));g.thirdPerson.camera.position.copy(r.object.position).add(new T.Vector3(2.5,1.6,2.5).applyQuaternion(r.object.quaternion));g.poseInspector.controls.update();});await p.waitForTimeout(200);await p.screenshot({path:`E:/Cache/Temp/downhill-fixed-${map}.png`});await p.keyboard.press('KeyP');}
 await p.keyboard.up('KeyW');await p.waitForTimeout(100);
 }await p.close();
}assert.deepEqual(errors,[]);console.log(JSON.stringify({results,errors}));
}finally{await b.close();}
