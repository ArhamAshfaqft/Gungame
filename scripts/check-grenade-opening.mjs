import {chromium} from 'playwright';import assert from 'node:assert/strict';
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>localStorage.setItem('fast-snipe.graphics',JSON.stringify({preset:'low'})));
 await page.goto('http://127.0.0.1:5194/?map=villa');await page.waitForFunction(()=>window.__fastSnipe&&!window.__fastSnipe.graphicsWarming&&!document.querySelector('#camera-toggle').disabled,null,{timeout:120000});await page.locator('#btn-play').click();
 await page.evaluate(async()=>{
  const {VillaPanel}=await import('/src/world/VillaPanel.js'),{puncturePanel}=await import('/src/world/PanelPuncture.js'),T=await import('/node_modules/three/build/three.module.js'),g=window.__fastSnipe,e=g.equipment;
  g.movement.update=()=>{};g.camera.position.set(101,3.55,101);g.camera.quaternion.identity();g.camera.updateMatrixWorld(true);
  const map={scene:g.arena.scene,colliders:e.colliders,panels:[],materials:g.arena.materials,emitPanelDebris(){}};
  const panel=new VillaPanel(map,{x:100,y:2,z:100,width:2,height:2.8,door:true,kind:'wood'});
  puncturePanel(panel,new T.Vector3(101.22,3.52,100+panel.thickness/2),new T.Vector3(0,0,-1),1500,{radius:.25});
  e.select('frag');window.__holeContacts=0;const integrate=e.integrate.bind(e);e.integrate=(p,dt)=>{const z=p.position.z;integrate(p,dt);if(z>=100&&p.position.z<100)window.__holeCrossed=p.position.toArray();};
  const bounce=e.bounceSound.bind(e);e.bounceSound=p=>{if(Math.abs(p.position.z-100)<.2)window.__holeContacts++;bounce(p);};
 });
 await page.waitForTimeout(500);await page.evaluate(()=>window.__fastSnipe.equipment.pullPin());await page.waitForTimeout(450);
 const predicted=await page.evaluate(()=>{const e=window.__fastSnipe.equipment;return{end:e.trajectory.prediction.position.toArray(),first:e.trajectory.prediction.firstImpact?.position.toArray()};});
 await page.evaluate(()=>window.__fastSnipe.equipment.throwSelected('high'));await page.waitForFunction(()=>window.__holeCrossed,null,{timeout:6000});
 const result=await page.evaluate(()=>({crossed:window.__holeCrossed,contacts:window.__holeContacts}));assert.equal(result.contacts,0);assert.ok(predicted.end[2]<100);assert.deepEqual(errors,[]);console.log(JSON.stringify({result:'PASS',predicted,...result,errors}));
}finally{await browser.close();}
