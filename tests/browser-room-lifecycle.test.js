import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {connectBrowserRoom} from '../src/multiplayer/BrowserRoom.js';

const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms)),options={map:'villa',side:'red',name:'Test'};
class Events extends EventTarget{
 listeners=new Set();
 addEventListener(type,fn,options){this.listeners.add(fn);super.addEventListener(type,fn,options);}
 removeEventListener(type,fn){this.listeners.delete(fn);super.removeEventListener(type,fn);}
}
class Connection extends EventEmitter{
 sent=[];open=false;
 send(data){this.sent.push(data);this.respond?.(data);}
 close(){this.open=false;this.emit('close');}
}
class FakePeer extends EventEmitter{
 constructor(){super();queueMicrotask(()=>this.emit('open'));}
 destroy(){this.destroyed=true;this.emit('close');}
 reconnect(){this.reconnects=(this.reconnects||0)+1;this.disconnected=false;this.emit('open');}
}
function setup(){
 const events=new Events(),peers=[],workers=[];let iceLoads=0;
 const deps={events,reconnectMs:5,guestTimeoutMs:15,timeoutMs:1000,
  loadIceConfig:async()=>{iceLoads++;return{config:{iceServers:[]},relayAvailable:false};},
  makePeer:()=>{const peer=new FakePeer();peers.push(peer);return peer;},
  makeWorker:()=>{const worker={messages:[],postMessage(data){this.messages.push(data);if(data.kind==='init')queueMicrotask(()=>this.onmessage({data:{initialized:true}}));if(data.kind==='join')queueMicrotask(()=>this.onmessage({data:{id:data.id,type:'accepted',data:{}}}));},terminate(){this.terminated=true;}};workers.push(worker);return worker;}
 };
 return{deps,events,peers,workers,iceLoads:()=>iceLoads};
}

test('broker reconnection retains one host worker, one guest handler and the current match',async()=>{
 const s=setup(),room=await connectBrowserRoom('',options,s.deps),peer=s.peers[0];
 try{
  let failures=0;room.onError(()=>failures++);peer.disconnected=true;peer.emit('disconnected');peer.emit('error',{type:'network',message:'temporary broker interruption'});await wait(20);
  assert.equal(peer.reconnects,1);assert.equal(s.workers.length,1);assert.equal(peer.listenerCount('connection'),1);assert.equal(s.workers[0].terminated,undefined);assert.equal(failures,0);
  const guest=new Connection();peer.emit('connection',guest);guest.open=true;guest.emit('open');guest.emit('data',{type:'hello',data:options});await wait(0);
  assert.equal(s.workers[0].messages.filter(m=>m.kind==='join').length,2,'one host join and one guest join, without duplicate simulations');
  assert.ok(guest.sent.some(m=>m.type==='accepted'));
 }finally{room.leave();}
 assert.equal(s.events.listeners.size,0);assert.ok(s.workers[0].terminated);
});

test('failed guest handshakes expire and release room slots without recreating the host',async()=>{
 const s=setup(),room=await connectBrowserRoom('',options,s.deps),peer=s.peers[0],failed=Array.from({length:3},()=>new Connection());
 try{
  failed.forEach(c=>peer.emit('connection',c));await wait(35);
  assert.ok(failed.every(c=>!c.open));const guest=new Connection();peer.emit('connection',guest);guest.open=true;guest.emit('open');guest.emit('data',{type:'hello',data:options});await wait(0);
  assert.ok(guest.sent.some(m=>m.type==='accepted'),'stale attempts cannot keep a free room full');assert.equal(s.workers.length,1);
 }finally{room.leave();}
});

test('a transient guest join retries using a fresh peer and the same host room',async()=>{
 const s=setup();let attempts=0;
 s.deps.makePeer=()=>{const peer=new FakePeer(),attempt=++attempts;s.peers.push(peer);peer.connect=code=>{assert.match(code,/-ABCDEFG$/);const c=new Connection();if(attempt===1)queueMicrotask(()=>peer.emit('error',{type:'peer-unavailable',message:'offer not found'}));else{c.respond=m=>{if(m.type==='hello')queueMicrotask(()=>{c.emit('data',{type:'identity',data:'guest-id'});c.emit('data',{type:'accepted',data:{}});});};queueMicrotask(()=>{c.open=true;c.emit('open');});}return c;};return peer;};
 const room=await connectBrowserRoom('ABCDEFG',options,s.deps);
 try{assert.equal(attempts,2);assert.equal(room.sessionId,'guest-id');assert.equal(room.roomId,'ABCDEFG');assert.equal(s.iceLoads(),1);assert.ok(s.peers[0].destroyed);assert.equal(s.events.listeners.size,1);}finally{room.leave();}
 assert.equal(s.events.listeners.size,0);
});

test('password and other room rejections are terminal and do not automatically retry',async()=>{
 const s=setup();s.deps.makePeer=()=>{const peer=new FakePeer();s.peers.push(peer);peer.connect=()=>{const c=new Connection();c.respond=()=>queueMicrotask(()=>c.emit('data',{type:'rejected',data:'Incorrect room password.'}));queueMicrotask(()=>c.emit('open'));return c;};return peer;};
 await assert.rejects(connectBrowserRoom('ABCDEFG',options,s.deps),/Incorrect room password/);assert.equal(s.peers.length,1);assert.equal(s.events.listeners.size,0);
});

test('a stalled direct connection retries once, then cleans up both failed peers',async()=>{
 const s=setup();s.deps.timeoutMs=10;s.deps.makePeer=()=>{const peer=new FakePeer();s.peers.push(peer);peer.connect=()=>new Connection();return peer;};
 await assert.rejects(connectBrowserRoom('ABCDEFG',options,s.deps),/direct connection timed out/);assert.equal(s.peers.length,2);assert.ok(s.peers.every(p=>p.destroyed));assert.equal(s.events.listeners.size,0);
});


test('failed joins report connection stages and safe ICE diagnostics',async()=>{
 const s=setup(),progress=[];s.deps.timeoutMs=15;s.deps.onProgress=message=>progress.push(message);
 s.deps.makePeer=()=>{const peer=new FakePeer();s.peers.push(peer);peer.connect=()=>{
  const c=new Connection(),rtc=new EventTarget();rtc.remoteDescription={type:'answer',sdp:'must not be copied'};c.peerConnection=rtc;
  queueMicrotask(()=>{rtc.dispatchEvent(new Event('signalingstatechange'));const candidate=new Event('icecandidate');candidate.candidate={candidate:'private address must not be copied'};rtc.dispatchEvent(candidate);const error=new Event('icecandidateerror');error.errorCode=701;rtc.dispatchEvent(error);c.emit('iceStateChanged','checking');});return c;
 };return peer;};
 await assert.rejects(connectBrowserRoom('ABCDEFG',options,s.deps),error=>{
  assert.equal(error.connectionInfo.remoteAnswer,true);assert.equal(error.connectionInfo.localCandidates,1);assert.deepEqual(error.connectionInfo.stunErrors,[701]);assert.equal(error.connectionInfo.iceState,'checking');
  assert.ok(!JSON.stringify(error.connectionInfo).includes('must not be copied'));return true;
 });
 assert.ok(progress.some(message=>message.includes('retrying')));assert.ok(progress.some(message=>message.includes('Room service connected')));assert.equal(s.events.listeners.size,0);
});


test('a slow ICE negotiation can finish after the old fifteen-second deadline',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});
 const s=setup();delete s.deps.timeoutMs;let connection,finished=false;
 s.deps.makePeer=()=>{const peer=new FakePeer();s.peers.push(peer);peer.connect=()=>{connection=new Connection();connection.respond=()=>queueMicrotask(()=>connection.emit('data',{type:'accepted',data:{}}));return connection;};return peer;};
 const pending=connectBrowserRoom('ABCDEFG',options,s.deps).then(room=>{finished=true;return room;});
 await new Promise(resolve=>setImmediate(resolve));
 t.mock.timers.tick(20000);await new Promise(resolve=>setImmediate(resolve));
 assert.equal(finished,false);assert.equal(s.peers.length,1);assert.ok(!s.peers[0].destroyed,'active ICE checks must not be cancelled at fifteen seconds');
 connection.open=true;connection.emit('open');const room=await pending;room.leave();assert.equal(s.events.listeners.size,0);
});
