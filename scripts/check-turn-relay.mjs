import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const base=process.env.GAME_TEST_URL||'http://127.0.0.1:5194/';
const endpoint=process.env.ICE_TEST_URL||'https://gungame-761.pages.dev/api/ice-servers';
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--disable-background-timer-throttling','--disable-renderer-backgrounding']});
try{
 const pages=[],errors=[];
 for(let i=0;i<2;i++){
  const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'}),ice=await response.json();
  assert.equal(response.status,200);assert.equal(ice.relayAvailable,true,'Production must issue TURN credentials');
  const context=await browser.newContext({viewport:{width:1000,height:750}}),page=await context.newPage();pages.push(page);page.on('pageerror',e=>errors.push(e.message));
  // Expiring test credentials remain in memory, never in artifacts or logs.
  await page.route('**/api/ice-servers',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(ice)}));
  await page.addInitScript(()=>{
   localStorage.setItem('fast-snipe.graphics',JSON.stringify({preset:'low'}));window.__relayTestPeers=[];
   const Native=window.RTCPeerConnection;window.RTCPeerConnection=class extends Native{constructor(config,constraints){super({...config,iceTransportPolicy:'relay'},constraints);window.__relayTestPeers.push(this);}};
  });
  await page.goto(`${base}?map=villa&multiplayer=1&transport=browser`);
  await page.waitForFunction(()=>window.__fastSnipe?.networkWorld&&!window.__fastSnipe.graphicsWarming,null,{timeout:120000});
  await page.locator('#mp-name').fill(i?'Relay guest':'Relay host');await page.locator('#mp-side').selectOption(i?'blue':'red');
 }
 await pages[0].locator('#mp-create').click();await pages[0].waitForFunction(()=>window.__fastSnipe.multiplayer?.connected,null,{timeout:45000});
 const code=await pages[0].evaluate(()=>window.__fastSnipe.multiplayer.code);
 await pages[1].locator('#mp-code').fill(code);await pages[1].locator('#mp-join').click();
 await pages[1].waitForFunction(()=>window.__fastSnipe.multiplayer?.connected,null,{timeout:90000});
 for(const page of pages)await page.waitForFunction(()=>window.__fastSnipe.multiplayer?.remotes.size===1,null,{timeout:45000});
 const routes=[];
 for(const page of pages)routes.push(await page.evaluate(async()=>{
  const pc=window.__relayTestPeers.find(pc=>pc.connectionState==='connected');if(!pc)return null;
  const stats=await pc.getStats(),transport=[...stats.values()].find(s=>s.type==='transport'&&s.selectedCandidatePairId),pair=transport&&stats.get(transport.selectedCandidatePairId),local=pair&&stats.get(pair.localCandidateId),remote=pair&&stats.get(pair.remoteCandidateId);
  return{connectionState:pc.connectionState,local:local?.candidateType,remote:remote?.candidateType,protocol:local?.protocol,bytesSent:pair?.bytesSent,bytesReceived:pair?.bytesReceived};
 }));
 assert.ok(routes.every(r=>r?.local==='relay'&&r?.remote==='relay'&&r.bytesSent>0&&r.bytesReceived>0));assert.deepEqual(errors,[]);
 console.log(JSON.stringify({result:'PASS',productionCredentials:true,forcedRelay:true,worldSync:true,routes,errors}));
}finally{await browser.close();}
