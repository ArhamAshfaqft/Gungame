import {PROTOCOL} from './Protocol.js';
import {loadIceConfig,joinTimeoutMessage} from './IceConfig.js';
const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const roomCode=()=>Array.from(crypto.getRandomValues(new Uint8Array(7)),n=>alphabet[n%alphabet.length]).join('');
export function browserInvite(code,map){const url=new URL(location.href);url.searchParams.set('multiplayer','1');url.searchParams.set('transport','browser');url.searchParams.set('room',code);url.searchParams.set('map',map);url.searchParams.delete('server');return url.href;}
class BrowserRoom{
 constructor(id,code){this.sessionId=id;this.roomId=code;this.handlers=new Map();this.errors=[];this.leaves=[];this.pending=[];}
 onMessage(type,fn){this.handlers.set(type,fn);for(const item of this.pending.filter(item=>item.type===type))fn(item.data);this.pending=this.pending.filter(item=>item.type!==type);}
 deliver(type,data){const fn=this.handlers.get(type);if(fn)fn(data);else if(this.pending.length<256)this.pending.push({type,data});}
 onError(fn){this.errors.push(fn);}
 onLeave(fn){this.leaves.push(fn);}
}
export async function connectBrowserRoom(code,options,dependencies={}){
 if(!dependencies.makePeer){const {Peer}=await import('peerjs');dependencies={...dependencies,makePeer:(id,config)=>new Peer(id,config)};}
 const ice=await (dependencies.loadIceConfig||loadIceConfig)(),attempts=code?2:1;
 for(let attempt=0;attempt<attempts;attempt++){
  try{return await connectAttempt(code,options,ice,dependencies);}
  catch(error){dependencies.onProgress?.(`Connection attempt ${attempt+1} failed${attempt<attempts-1?'; retrying...':'.'}`);if(!error.retryable||attempt===attempts-1)throw error;}
 }
}
async function connectAttempt(code,options,ice,dependencies){
 const hosting=!code;code=code||roomCode();const id=crypto.randomUUID(),room=new BrowserRoom(id,code),peer=dependencies.makePeer(hosting?`fast-snipe-v${PROTOCOL}-${code}`:undefined,{debug:0,config:ice.config});
 const events=dependencies.events||window;
 room.relayAvailable=ice.relayAvailable;room.connectionInfo={opened:false,iceState:'',signaling:'starting',localCandidates:0,remoteAnswer:false,stunErrors:[]};
 dependencies.onProgress?.(hosting?'Registering the host room...':'Contacting the room service...');
 let worker,connection,settled=false,closed=false,reconnectTimer;const guests=new Map(),guestCleanups=new Map();
 const close=()=>{if(closed)return;closed=true;clearTimeout(timeout);clearTimeout(reconnectTimer);events.removeEventListener('pagehide',close);for(const cleanup of [...guestCleanups.values()])cleanup();worker?.terminate();peer.destroy();for(const fn of room.leaves)fn();};
 room.leave=close;
 let accept,reject;const result=new Promise((resolve,fail)=>{accept=resolve;reject=fail;});
 const fail=(message,retryable=false)=>{if(closed)return;if(!settled){settled=true;reject(Object.assign(Error(message),{retryable,connectionInfo:{...room.connectionInfo,stunErrors:[...room.connectionInfo.stunErrors],relayAvailable:ice.relayAvailable}}));close();}else{for(const fn of room.errors)fn(4000,message);close();}};
 const timeout=setTimeout(()=>fail(hosting?'Could not start the browser host. Please refresh and try again.':joinTimeoutMessage({...room.connectionInfo,relayAvailable:ice.relayAvailable}),!hosting),dependencies.timeoutMs||(hosting?30000:15000));
 const deliver=(type,data)=>{if(type==='accepted'){if(!settled){settled=true;clearTimeout(timeout);accept(room);}return;}if(type==='rejected'){fail(data);return;}room.deliver(type,data);};
 const reconnect=()=>{if(closed||reconnectTimer)return;reconnectTimer=setTimeout(()=>{reconnectTimer=null;if(!closed&&peer.disconnected&&!peer.destroyed){try{peer.reconnect();}catch{reconnect();}}},dependencies.reconnectMs||1500);};
 peer.on('error',error=>{
  // Broker interruptions need not end an established data connection or match.
  if(settled&&['network','socket-error','server-error'].includes(error.type)){reconnect();return;}
  fail(error.type==='unavailable-id'?'Room code in use. Try creating again.':error.type==='peer-unavailable'?'This room is not online. Check the room code and keep the host tab open.':error.message,['network','socket-error','server-error','peer-unavailable','webrtc'].includes(error.type));
 });
 peer.on('disconnected',()=>{room.connectionInfo.signaling='disconnected';reconnect();});
 peer.on('open',()=>{
  if(closed)return;room.connectionInfo.signaling='connected';clearTimeout(reconnectTimer);reconnectTimer=null;
  // PeerJS emits open again after reconnecting to its broker. Starting another
  // worker here used to replace the live match and duplicate guest listeners.
  if(worker||connection)return;
  if(hosting){
   worker=(dependencies.makeWorker||(()=>new Worker(new URL('./BrowserHost.worker.js',import.meta.url),{type:'module'})))();
   worker.onerror=event=>fail('Host simulation failed: '+event.message);
   worker.onmessage=({data})=>{if(data.fatal){fail(data.fatal);return;}if(data.initialized){worker.postMessage({kind:'join',id,data:{...options,protocol:PROTOCOL}});return;}if(data.id===id)deliver(data.type,data.data);else{const guest=guests.get(data.id);if(guest?.open)guest.send({type:data.type,data:data.data});}};
   worker.postMessage({kind:'init',data:{options,code}});
   room.send=(type,data)=>worker.postMessage({kind:'message',id,type,data});
   peer.on('connection',guest=>{
    if(guests.size>=3){guest.on('open',()=>{guest.send({type:'rejected',data:'This room is full.'});setTimeout(()=>guest.close(),500);});return;}
    const guestId=crypto.randomUUID();guests.set(guestId,guest);let joined=false,count=0,removed=false;const rate=setInterval(()=>{count=0;},1000);
    const pending=setTimeout(()=>{cleanup();guest.close();},dependencies.guestTimeoutMs||20000);
    const cleanup=()=>{if(removed)return;removed=true;clearInterval(rate);clearTimeout(pending);guests.delete(guestId);guestCleanups.delete(guestId);if(!closed)worker?.postMessage({kind:'leave',id:guestId});};guestCleanups.set(guestId,cleanup);
    guest.on('data',message=>{if(removed||!message||++count>120||typeof message!=='object')return;if(!joined){if(message.type!=='hello')return;joined=true;clearTimeout(pending);worker.postMessage({kind:'join',id:guestId,data:message.data});return;}worker.postMessage({kind:'message',id:guestId,type:message.type,data:message.data});});
    guest.on('error',()=>{cleanup();guest.close();});guest.on('close',cleanup);
    guest.on('open',()=>guest.send({type:'identity',data:guestId}));
   });
  }else{
   dependencies.onProgress?.('Room service connected. Opening the direct connection...');
   connection=peer.connect(`fast-snipe-v${PROTOCOL}-${code}`,{reliable:true,serialization:'binary'});
   const rtc=connection.peerConnection;
   if(rtc){
    const answer=()=>{room.connectionInfo.remoteAnswer=!!rtc.remoteDescription;};
    rtc.addEventListener('signalingstatechange',answer);
    rtc.addEventListener('icecandidate',event=>{if(event.candidate)room.connectionInfo.localCandidates++;answer();});
    rtc.addEventListener('icecandidateerror',event=>{const code=event.errorCode;if(code&&!room.connectionInfo.stunErrors.includes(code))room.connectionInfo.stunErrors.push(code);});
   }
   room.send=(type,data)=>connection.send({type,data});
   connection.on('iceStateChanged',state=>{room.connectionInfo.iceState=state;});
   connection.on('open',()=>{room.connectionInfo.opened=true;dependencies.onProgress?.('Direct connection opened. Waiting for room approval...');connection.send({type:'hello',data:{...options,protocol:PROTOCOL}});});
   connection.on('data',message=>{if(message?.type==='identity'){room.sessionId=message.data;return;}if(message?.type)deliver(message.type,message.data);});
   connection.on('close',()=>fail('The host connection closed. Keep the host tab active and try joining again.',!room.connectionInfo.opened));
   connection.on('error',error=>fail(error.message,true));
  }
 });
 events.addEventListener('pagehide',close,{once:true});
 return result;
}
