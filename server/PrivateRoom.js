import {chooseSide} from '../src/multiplayer/TeamSelection.js';
import {LatencyBalance} from './LatencyBalance.js';
import {Room,ServerError} from '@colyseus/core';
import {randomInt,timingSafeEqual} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {GameWorld} from './GameWorld.js';
import {MAX_PLAYERS,PROTOCOL,validInput} from '../src/multiplayer/Protocol.js';
import {liquidState} from '../src/multiplayer/LiquidSync.js';

const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export class PrivateRoom extends Room{
 static active=null;
 onCreate(options){
  if(PrivateRoom.active)throw new ServerError(409,'This host already has a match. Ask the host for its room code.');
  this.maxClients=MAX_PLAYERS;this.maxMessagesPerSecond=90;this.patchRate=null;
  this.roomId=Array.from({length:7},()=>alphabet[randomInt(alphabet.length)]).join('');this.mapId=options.map==='villa'?'villa':'training';
  this.password=String(options.password||'').slice(0,64);this.setPrivate(true);
  this.balance=new LatencyBalance(options.balanceHost===true);this.world=new GameWorld(this.mapId,(type,data)=>this.broadcastGame(type,data));PrivateRoom.active=this;this.readyClients=new Set();this.ticks=0;this.elapsed=0;this.previousTick=performance.now();
  this.onMessage('ready',(client,data)=>{if(this.readyClients.has(client.sessionId))return;if(data?.layout!==this.world.sync.layout){client.send('problem','Your game files do not match the server. Refresh the host page.');client.leave(4001);return;}this.readyClients.add(client.sessionId);this.sendWorld(client,this.world.sync.snapshot(),true);client.send('snapshot',this.world.snapshot());this.syncLiquid(client);});
  this.onMessage('input',(client,data)=>{const p=this.world.players.get(client.sessionId);if(!p||!this.readyClients.has(p.id)||!Array.isArray(data)||data.length>6)return;const inputs=data.filter(validInput);this.balance.schedule(p.id,()=>this.world.enqueue(p,inputs),performance.now());});
  this.onMessage('action',(client,data)=>{const p=this.world.players.get(client.sessionId);if(p&&this.readyClients.has(p.id))this.balance.schedule(p.id,()=>this.world.action(p,data),performance.now());});
  this.onMessage('ping',(client,data)=>{if(typeof data==='number')client.send('pong',data);});
  this.onMessage('latencyReply',(client,nonce)=>this.balance.reply(client.sessionId,nonce,performance.now()));
  // Room's shared clock is also ticked by its no-state patch timer. Use an
  // independent wall clock so that timer cannot halve movement, fuses or reloads.
  this.setSimulationInterval(()=>{const now=performance.now(),delta=now-this.previousTick;this.previousTick=now;this.balance.flush(now);if(!this.lastProbe||now-this.lastProbe>=1000){this.lastProbe=now;for(const c of this.clients){c.send('latencyProbe',this.balance.probe(c.sessionId,now));c.send('networkStats',this.balance.stats());}}this.elapsed=Math.min(this.elapsed+delta,100);let steps=0;while(this.elapsed>=1000/60&&steps++<5){this.world.step();this.elapsed-=1000/60;this.ticks++;if(this.ticks%30===0)this.syncLiquid();if(this.ticks%3===0)this.broadcastGame('snapshot',this.world.snapshot());if(this.ticks%6===0){const entries=this.world.sync.collect();if(entries.length){const packet=this.worldPacket(entries,false);for(const c of this.clients)if(this.readyClients.has(c.sessionId))this.sendGame(c,'world',packet);}}}},1000/60);
 }
 onAuth(client,options){try{chooseSide(this.world.players.values(),options.side||'auto');}catch(error){throw new ServerError(409,error.message);}if(options.protocol!==PROTOCOL)throw new ServerError(400,'Please refresh the game: network version differs.');if(options.map!==this.mapId)throw new ServerError(409,`Choose the ${this.mapId} map before joining this room.`);const supplied=Buffer.from(String(options.password||'')),expected=Buffer.from(this.password);if(supplied.length!==expected.length||!timingSafeEqual(supplied,expected))throw new ServerError(403,'Incorrect room password.');return true;}
 onJoin(client,options){this.balance.join(client.sessionId);this.world.addPlayer(client.sessionId,options.name,options.side||'auto');client.send('welcome',{id:client.sessionId,code:this.roomId,map:this.mapId,protocol:PROTOCOL,layout:this.world.sync.layout});}
 sendGame(client,type,data){const delayed=this.balance.enabled&&this.balance.locked&&client.sessionId===this.balance.host&&this.balance.addedRtt>0;const payload=delayed?structuredClone(data):data;this.balance.schedule(client.sessionId,()=>client.send(type,payload),performance.now());}
 broadcastGame(type,data){for(const c of this.clients)if(this.readyClients.has(c.sessionId))this.sendGame(c,type,data);}
 worldPacket(entries,initial){return{initial,bytes:new Uint8Array(gzipSync(JSON.stringify(entries),{level:1}))};}
 sendWorld(client,entries,initial){client.send('world',this.worldPacket(entries,initial));}
 syncLiquid(client=null){const state=liquidState(this.world.map.liquids);if(!state)return;if(client){client.send('liquid',state);return;}const signature=JSON.stringify(state);if(signature!==this.lastLiquid){this.lastLiquid=signature;for(const c of this.clients)if(this.readyClients.has(c.sessionId))this.sendGame(c,'liquid',state);}}
 onLeave(client){this.balance.leave(client.sessionId);this.readyClients.delete(client.sessionId);this.world.players.delete(client.sessionId);this.broadcastGame('snapshot',this.world.snapshot());}
 onDispose(){if(PrivateRoom.active===this)PrivateRoom.active=null;this.world?.dispose();}
}
