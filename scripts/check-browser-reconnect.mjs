import {chromium} from 'playwright';
import assert from 'node:assert/strict';

// Real PeerJS signaling, WebRTC and host worker. The first guest attempt is
// deliberately closed; recovery must retain the same host room and simulation.
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--disable-background-timer-throttling','--disable-renderer-backgrounding']});
try{
 const pages=[],errors=[];
 for(let i=0;i<2;i++){
  const context=await browser.newContext({viewport:{width:1000,height:750}}),page=await context.newPage();pages.push(page);page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>localStorage.setItem('fast-snipe.graphics',JSON.stringify({preset:'low'})));
  await page.goto('http://127.0.0.1:5194/?map=villa&multiplayer=1');
  await page.waitForFunction(()=>window.__fastSnipe?.networkWorld&&!window.__fastSnipe.graphicsWarming,null,{timeout:120000});
 }
 const code=await pages[0].evaluate(async()=>{
  const {connectBrowserRoom}=await import('/src/multiplayer/BrowserRoom.js'),{Peer}=await import('/node_modules/.vite/deps/peerjs.js');
  window.__workers=0;window.__snapshot=null;window.__rtcRoom=await connectBrowserRoom('',{map:'villa',side:'red',name:'Host'},{
   makePeer:(id,config)=>(window.__hostPeer=new Peer(id,config)),
   makeWorker:()=>{window.__workers++;return new Worker('/src/multiplayer/BrowserHost.worker.js',{type:'module'});},guestTimeoutMs:2000
  });
  window.__rtcRoom.onMessage('snapshot',data=>window.__snapshot=data);
  window.__rtcRoom.send('ready',{layout:window.__fastSnipe.networkWorld.layout});return window.__rtcRoom.roomId;
 });
 await pages[1].evaluate(async code=>{
  const {connectBrowserRoom}=await import('/src/multiplayer/BrowserRoom.js'),{Peer}=await import('/node_modules/.vite/deps/peerjs.js');
  window.__attempts=0;window.__snapshot=null;window.__joinAgain=async()=>{
   window.__rtcRoom=await connectBrowserRoom(code,{map:'villa',side:'blue',name:'Guest'},{makePeer:(id,config)=>{
    const peer=new Peer(id,config);if(++window.__attempts===1){const connect=peer.connect.bind(peer);peer.connect=(...args)=>{const connection=connect(...args);queueMicrotask(()=>connection.close());return connection;};}return peer;
   }});
   window.__rtcRoom.onMessage('snapshot',data=>window.__snapshot=data);
   window.__rtcRoom.send('ready',{layout:window.__fastSnipe.networkWorld.layout});
  };await window.__joinAgain();
 },code);
 await pages[1].waitForFunction(()=>window.__snapshot?.players.length===2,null,{timeout:30000});
 assert.equal(await pages[1].evaluate(()=>window.__attempts),2,'the closed first attempt retries automatically');
 const time=await pages[0].evaluate(()=>{const time=window.__snapshot.time;window.__hostPeer.disconnect();return time;});
 await pages[0].waitForFunction(()=>!window.__hostPeer.disconnected&&window.__snapshot.time>2,null,{timeout:15000});
 assert.equal(await pages[0].evaluate(()=>window.__workers),1,'broker reconnect cannot restart the match');
 await pages[1].waitForFunction(t=>window.__snapshot.time>t+1,time,{timeout:10000});
 await pages[1].evaluate(()=>window.__rtcRoom.leave());
 await pages[0].waitForFunction(()=>window.__snapshot.players.length===1,null,{timeout:10000});
 await pages[1].evaluate(()=>window.__joinAgain());
 await pages[1].waitForFunction(()=>window.__snapshot.players.length===2,null,{timeout:30000});
 assert.equal(await pages[0].evaluate(()=>window.__workers),1);assert.deepEqual(errors,[]);
 console.log(JSON.stringify({result:'PASS',automaticRetry:true,brokerReconnect:true,rejoin:true,hostWorkers:1,sameRoom:true,errors}));
 for(const page of pages)await page.evaluate(()=>window.__rtcRoom.leave());
}finally{await browser.close();}
