import {chromium} from 'playwright';
const b=await chromium.launch({channel:'chrome',headless:true});const p=await b.newPage({viewport:{width:1100,height:800}});const errors=[];p.on('pageerror',e=>errors.push(e.message));await p.goto('http://127.0.0.1:5181/?map=training');await p.waitForFunction(()=>window.__fastSnipe?.thirdPerson?.rig?.animator);
for(const ads of [0,1]){
await p.evaluate(async ads=>{const g=window.__fastSnipe;const T=await import('/node_modules/three/build/three.module.js');const v=g.thirdPerson,r=v.rig;v.enabled=true;g.weapon.thirdPerson=true;g.weapon.activeSlot='assault';g.weapon.isAiming=!!ads;g.weapon.adsProgress=ads;g.movement.isCrouching=true;g.movement.effectiveLean=.85;v.update(0);r.animator.sample('rifleCrouchIdle',0);r.finishAnimatedPose({isCrouching:true,isGrounded:true,lean:.85,adsProgress:ads,isAiming:!!ads});g.poseInspector.toggle();v.camera.position.copy(r.object.position).add(new T.Vector3(-1.5,1.5,2.4));g.poseInspector.controls.target.copy(r.object.position).add(new T.Vector3(0,.9,0));g.poseInspector.controls.update();},ads);
await p.screenshot({path:`E:/Cache/Temp/crouch-peek-${ads}.png`});
console.log(await p.evaluate(()=>({miss:window.__fastSnipe.thirdPerson.rig.supportGripMiss})));
await p.evaluate(()=>window.__fastSnipe.poseInspector.toggle());
}
console.log(errors);await b.close();
