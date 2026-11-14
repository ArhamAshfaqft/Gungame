import {chromium} from 'playwright';
const b=await chromium.launch({channel:'chrome',headless:true});const p=await b.newPage({viewport:{width:1200,height:900}});const errors=[];p.on('pageerror',e=>errors.push(e.message));await p.goto('http://127.0.0.1:5181/?map=training');await p.waitForFunction(()=>window.__fastSnipe?.thirdPerson?.rig?.animator);
for(const slot of ['primary','assault']){
await p.evaluate(async slot=>{const g=window.__fastSnipe,T=await import('/node_modules/three/build/three.module.js');if(g.poseInspector.active)g.poseInspector.toggle();const v=g.thirdPerson;v.enabled=true;g.weapon.thirdPerson=true;g.weapon.activeSlot=slot;v.update(0);v.rig.animator.sample('idle',0);v.rig.finishAnimatedPose({isAiming:true,adsProgress:1});g.poseInspector.toggle();v.camera.position.copy(v.rig.object.position).add(new T.Vector3(-1.1,1.6,1.3));g.poseInspector.controls.target.copy(v.rig.object.position).add(new T.Vector3(0,1.3,0));g.poseInspector.controls.update();},slot);
await p.screenshot({path:`E:/Cache/Temp/arm-twist-fixed-${slot}.png`});
console.log(slot,await p.evaluate(()=>window.__fastSnipe.thirdPerson.rig.supportGripMiss));
}console.log(errors);await b.close();
