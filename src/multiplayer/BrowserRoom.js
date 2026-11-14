import {Peer} from 'peerjs';
import {PROTOCOL} from './Protocol.js';
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
export async function connectBrowserRoom(code,options){
 const hosting=!code;code=code||roomCode();const id=crypto.randomUUID(),room=new BrowserRoom(id,code),peer=new Peer(hosting?`fast-snipe-v${PROTOCOL}-${code}`:undefined,{debug:0});
 let worker,connection,settled=false,closed=false;const guests=new Map();
 const close=()=>{if(closed)return;closed=true;clearTimeout(timeout);worker?.terminate();peer.destroy();for(const fn of room.leaves)fn();};
 room.leave=close;
 let accept,reject;const result=new Promise((resolve,fail)=>{accept=resolve;reject=fail;});
 const fail=message=>{if(!settled){settled=true;reject(Error(message));close();}else{for(const fn of room.errors)fn(4000,message);close();}};
 const timeout=setTimeout(()=>fail('Could not connect. Check the room code and keep the host tab open. Your network may require a WebRTC relay.'),30000);
 const deliver=(type,data)=>{if(type==='accepted'){if(!settled){settled=true;clearTimeout(timeout);accept(room);}return;}if(type==='rejected'){fail(data);return;}room.deliver(type,data);};
 peer.on('error',error=>fail(error.type==='unavailable-id'?'Room code in use. Try creating again.':error.message));
 peer.on('disconnected',()=>{if(!closed)peer.reconnect();});
 peer.on('open',()=>{
  if(hosting){
   worker=new Worker(new URL('./BrowserHost.worker.js',import.meta.url),{type:'module'});
   worker.onerror=event=>fail('Host simulation failed: '+event.message);
   worker.onmessage=({data})=>{if(data.fatal){fail(data.fatal);return;}if(data.initialized){worker.postMessage({kind:'join',id,data:{...options,protocol:PROTOCOL}});return;}if(data.id===id)deliver(data.type,data.data);else{const guest=guests.get(data.id);if(guest?.open)guest.send({type:data.type,data:data.data});}};
   worker.postMessage({kind:'init',data:{options,code}});
   room.send=(type,data)=>worker.postMessage({kind:'message',id,type,data});
   peer.on('connection',guest=>{
    if(guests.size>=3){guest.on('open',()=>{guest.send({type:'rejected',data:'This room is full.'});setTimeout(()=>guest.close(),500);});return;}
    const guestId=crypto.randomUUID();guests.set(guestId,guest);let joined=false,count=0;const rate=setInterval(()=>{count=0;},1000);
    guest.on('data',message=>{if(!message||++count>120||typeof message!=='object')return;if(!joined){if(message.type!=='hello')return;joined=true;worker.postMessage({kind:'join',id:guestId,data:message.data});return;}worker.postMessage({kind:'message',id:guestId,type:message.type,data:message.data});});
    guest.on('error',()=>guest.close());guest.on('close',()=>{clearInterval(rate);guests.delete(guestId);worker?.postMessage({kind:'leave',id:guestId});});
    guest.on('open',()=>guest.send({type:'identity',data:guestId}));
   });
  }else{
   connection=peer.connect(`fast-snipe-v${PROTOCOL}-${code}`,{reliable:true,serialization:'binary'});
   room.send=(type,data)=>connection.send({type,data});
   connection.on('open',()=>connection.send({type:'hello',data:{...options,protocol:PROTOCOL}}));
   connection.on('data',message=>{if(message?.type==='identity'){room.sessionId=message.data;return;}if(message?.type)deliver(message.type,message.data);});
   connection.on('close',()=>fail('The host disconnected. Ask your friend to create a new room.'));
   connection.on('error',error=>fail(error.message));
  }
 });
 window.addEventListener('pagehide',close,{once:true});
 return result;
}
