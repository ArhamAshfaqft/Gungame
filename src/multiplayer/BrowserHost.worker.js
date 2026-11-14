import {GameWorld} from '../../server/GameWorld.js';
import {PROTOCOL,MAX_PLAYERS,validInput} from './Protocol.js';
import {liquidState} from './LiquidSync.js';
let world,options,code,timer,ticks=0,elapsed=0,previous=0;
const clients=new Set(),ready=new Set();
let outgoing=Promise.resolve();
const queueWorld=(ids,data)=>{outgoing=outgoing.then(async()=>{const bytes=new Uint8Array(await new Response(new Blob([JSON.stringify(data.entries)]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());for(const id of ids)postMessage({id,type:'world',data:{initial:data.initial,bytes}});}).catch(error=>postMessage({fatal:error.message}));};
const send=(id,type,data)=>{if(type==='world')queueWorld([id],data);else postMessage({id,type,data});};
const broadcast=(type,data)=>{if(type==='world')queueWorld([...ready],data);else for(const id of ready)send(id,type,data);};
const packet=(entries,initial)=>({initial,entries});
function receive({kind,id,type,data}){
 if(kind==='init'){
  options=data.options;code=data.code;world=new GameWorld(options.map,broadcast);previous=performance.now();
  timer=setInterval(()=>{try{const now=performance.now();elapsed=Math.min(100,elapsed+now-previous);previous=now;let steps=0;while(elapsed>=1000/60&&steps++<5){world.step();elapsed-=1000/60;ticks++;if(ticks%3===0)broadcast('snapshot',world.snapshot());if(ticks%6===0){const entries=world.sync.collect();if(entries.length)broadcast('world',packet(entries,false));}if(ticks%30===0)broadcast('liquid',liquidState(world.map.liquids));}}catch(error){postMessage({fatal:error.message});clearInterval(timer);}},1000/60);
  postMessage({initialized:true});return;
 }
 if(!world)return;
 if(kind==='join'){
  try{if(clients.has(id))return;if(clients.size>=MAX_PLAYERS)throw Error('This room is full.');if(data.protocol!==PROTOCOL)throw Error('Refresh the game: versions differ.');if(data.map!==options.map)throw Error('Choose the same map as the host.');if(String(data.password||'')!==String(options.password||''))throw Error('Incorrect room password.');world.addPlayer(id,data.name,data.side);clients.add(id);send(id,'accepted',{code});}catch(error){send(id,'rejected',error.message);}return;
 }
 if(kind==='leave'){clients.delete(id);ready.delete(id);world.players.delete(id);broadcast('snapshot',world.snapshot());return;}
 if(!clients.has(id))return;
 if(type==='ready'){if(ready.has(id))return;if(data?.layout!==world.sync.layout){send(id,'problem','Game files differ. Refresh both browsers.');return;}ready.add(id);send(id,'world',packet(world.sync.snapshot(),true));send(id,'snapshot',world.snapshot());send(id,'liquid',liquidState(world.map.liquids));}
 if(!ready.has(id))return;
 const p=world.players.get(id);
 if(type==='input'&&Array.isArray(data)&&data.length<=6)world.enqueue(p,data.filter(validInput));
 if(type==='action')world.action(p,data);
 if(type==='ping'&&typeof data==='number')send(id,'pong',data);
}
onmessage=event=>{try{receive(event.data);}catch(error){postMessage({fatal:error.message});}};
