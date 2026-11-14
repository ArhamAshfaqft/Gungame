import {Server} from '@colyseus/core';
import {WebSocketTransport} from '@colyseus/ws-transport';
import express from 'express';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {networkInterfaces} from 'node:os';
import {PrivateRoom} from './PrivateRoom.js';
import {hostAddresses} from '../scripts/multiplayer-host-info.mjs';
import {PROTOCOL} from '../src/multiplayer/Protocol.js';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const port=Number(process.env.PORT||2567);
const server=new Server({transport:new WebSocketTransport({maxPayload:32*1024,perMessageDeflate:false}),express:app=>{
 app.get('/health',(_req,res)=>res.json({ok:true,game:'Fast Snipe',protocol:PROTOCOL}));
 app.get('/__multiplayer/host-info',(_req,res)=>res.set('Cache-Control','no-store').json({addresses:hostAddresses()}));
 app.use(express.static(resolve(root,'dist'),{index:'index.html',dotfiles:'deny',setHeaders:res=>res.setHeader('Cache-Control','no-cache')}));
}});
// One private match per host process keeps CPU/memory bounded on the host PC.
server.define('private',PrivateRoom).enableRealtimeListing();
try{await server.listen(port,'0.0.0.0');}catch(error){if(error.code==='EADDRINUSE'){console.error(`Port ${port} is already in use. A host may already be running. Open http://127.0.0.1:${port}/?multiplayer=1&map=training or close the old host window.`);process.exit(1);}throw error;}
console.log(`\nFAST SNIPE PRIVATE SERVER\nHost: http://127.0.0.1:${port}/?multiplayer=1&map=training`);
for(const addresses of Object.values(networkInterfaces()))for(const a of addresses||[])if(a.family==='IPv4'&&!a.internal)console.log(`Friends on your Wi-Fi: http://${a.address}:${port}/?multiplayer=1&map=training`);
console.log('Keep this window open. Press Ctrl+C to stop the server.\nNo hosting subscription is used.\n');
