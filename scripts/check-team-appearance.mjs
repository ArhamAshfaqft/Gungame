import {Server} from '@colyseus/core';
import {WebSocketTransport} from '@colyseus/ws-transport';
import {chromium} from 'playwright';
import * as T from 'three';
import assert from 'node:assert/strict';
import {PrivateRoom} from '../server/PrivateRoom.js';
const transport=new WebSocketTransport(),server=new Server({transport,gracefullyShutdown:false});server.define('private',PrivateRoom);await server.listen(0,'127.0.0.1');const address='http://127.0.0.1:'+transport.server.address().port;
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows']});const pages=[],errors=[];
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function focus(page){await page.bringToFront();await page.evaluate(()=>document.exitPointerLock());await wait(80);await page.locator('#btn-play').click();}
try{
 for(let i=0;i<2;i++){const context=await browser.newContext({viewport:{width:1200,height:800}}),page=await context.newPage();pages.push(page);page.on('pageerror',e=>errors.push(e.message));await page.addInitScript(()=>localStorage.setItem('fast-snipe.graphics',JSON.stringify({preset:'low'})));await page.goto('http://127.0.0.1:5194/?map=villa&multiplayer=1&transport=server');await page.waitForFunction(()=>window.__fastSnipe&&!window.__fastSnipe.graphicsWarming,null,{timeout:120000});await page.locator('#mp-name').fill(i?'Guest':'Host');await page.locator('#mp-side').selectOption(i?'blue':'red');await page.locator('#mp-address').fill(address);}
 await pages[0].locator('#mp-create').click();await pages[0].waitForFunction(()=>window.__fastSnipe.multiplayer?.connected,null,{timeout:120000});const code=await pages[0].evaluate(()=>window.__fastSnipe.multiplayer.code);await pages[1].locator('#mp-code').fill(code);await pages[1].locator('#mp-join').click();await pages[1].waitForFunction(()=>window.__fastSnipe.multiplayer?.connected,null,{timeout:120000});

 for(const page of pages)await page.waitForFunction(()=>{
  const g=window.__fastSnipe,n=g.multiplayer;
  if(!n?.own||n.remotes.size!==1)return false;
  const red=n.own.team===0?g.thirdPerson:[...n.remotes.values()].find(r=>r.view.team===0)?.view;
  return red?.rig?.teamAppearance?.group?.visible&&(n.own.team!==0||g.weapon.armsRig?.teamAppearance?.group?.visible);
 },null,{timeout:120000});
 const report=[];
 for(const page of pages)report.push(await page.evaluate(()=>{
  const g=window.__fastSnipe,n=g.multiplayer;
  const view=v=>({team:v.team,red:!!v.rig.teamAppearance?.group?.visible,original:v.rig.teamAppearance?.originals.some(x=>x.mesh.visible),parts:v.rig.teamAppearance?.group?.children.length||0,animator:v.rig.animator.constructor.name});
  return{own:view(g.thirdPerson),remote:view([...n.remotes.values()][0].view),armsRed:!!g.weapon.armsRig.teamAppearance?.group?.visible};
 }));
 assert.equal(report[0].own.team,0);assert.equal(report[0].own.red,true);assert.equal(report[0].own.original,false);assert.equal(report[0].armsRed,true);
 assert.equal(report[0].remote.team,1);assert.equal(report[0].remote.red,false);assert.equal(report[0].remote.original,true);
 assert.equal(report[1].remote.team,0);assert.equal(report[1].remote.red,true);assert.equal(report[1].own.red,false);
 assert.ok(report.every(x=>x.own.animator==='ShooterAnimator'&&x.remote.animator==='ShooterAnimator'));
 assert.deepEqual(errors,[]);console.log(JSON.stringify({result:'PASS',report,errors}));
}finally{await browser.close();await wait(80);await server.gracefullyShutdown(false);}
