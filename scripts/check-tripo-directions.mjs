import {chromium} from 'playwright';import assert from 'node:assert/strict';
const b=await chromium.launch({channel:'chrome',headless:true}),p=await b.newPage({viewport:{width:1200,height:950}}),errors=[];p.on('pageerror',e=>errors.push(e.message));
try{
 await p.goto('http://127.0.0.1:5181/?map=villa');await p.waitForFunction(()=>window.__fastSnipe?.thirdPerson.rig&&!document.querySelector('#btn-play').disabled,{timeout:60000});await p.keyboard.press('KeyH');await p.waitForFunction(()=>window.__fastSnipe.tripoPlayer.enabled);await p.locator('#btn-play').click();await p.keyboard.down('KeyW');await p.waitForTimeout(1400);await p.keyboard.up('KeyW');
 const data=[];for(const peek of ['KeyQ','KeyE'])for(const [direction,keys] of [['forward',['KeyW']],['back',['KeyS']],['left',['KeyA']],['right',['KeyD']],['forward-left',['KeyW','KeyA']],['forward-right',['KeyW','KeyD']],['back-left',['KeyS','KeyA']],['back-right',['KeyS','KeyD']]]){
  for(const key of [...keys,peek])await p.keyboard.down(key);await p.waitForTimeout(450);
  const read=()=>p.evaluate(()=>{const g=window.__fastSnipe,n=g.tripoPlayer,b=n.locomotion.bones;return {speed:g.movement.getSpeed(),lean:g.movement.effectiveLean,legs:['LeftUpLeg','LeftLeg','RightUpLeg','RightLeg'].map(k=>b[k].quaternion.toArray()),clip:g.thirdPerson.rig.animator.current,weight:n.locomotion.directionWeight,selected:n.locomotion.clip,phase:n.actions.Tripo_Run.time,runEnabled:n.actions.Tripo_Run.enabled};});
  const first=await read();await p.waitForTimeout(180);const second=await read();const motion=first.legs.reduce((s,a,i)=>s+a.reduce((n,v,j)=>n+Math.abs(v-second.legs[i][j]),0),0);
  assert.ok(second.speed>.1,direction+' must move');console.log(JSON.stringify({peek,direction,motion,first,second}));assert.ok(motion>.02,direction+' legs must animate during peek');data.push({peek,direction,motion,clip:second.clip,weight:second.weight});
  if(direction==='back'||direction==='right'){
   await p.keyboard.press('KeyP');for(const key of [...keys,peek])await p.keyboard.up(key);
   await p.evaluate(async()=>{const T=await import('/node_modules/three/build/three.module.js'),g=window.__fastSnipe,root=g.thirdPerson.rig.object.position;g.poseInspector.controls.target.copy(root).add(new T.Vector3(0,1.1,0));g.thirdPerson.camera.position.copy(root).add(new T.Vector3(-1,1.5,-2.5));g.poseInspector.controls.update();});await p.waitForTimeout(150);await p.screenshot({path:`E:/Cache/Temp/tripo-${peek}-${direction}.png`});await p.keyboard.press('KeyP');
  }else for(const key of [...keys,peek])await p.keyboard.up(key);
  await p.waitForTimeout(120);
 }
 assert.deepEqual(errors,[]);console.log(JSON.stringify({data,errors},null,2));
}finally{await b.close();}
