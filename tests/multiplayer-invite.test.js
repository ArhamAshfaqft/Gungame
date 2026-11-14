import test from 'node:test';
import assert from 'node:assert/strict';
import {makeInvite,resolveInvite} from '../src/multiplayer/Invite.js';
import {hostAddresses} from '../scripts/multiplayer-host-info.mjs';
test('localhost invites use the host LAN address and the multiplayer HTTP port',()=>{
 const url=new URL(makeInvite('http://127.0.0.1:2567','ABC2345','villa',['192.168.100.25']));
 assert.equal(url.origin,'http://192.168.100.25:2567');assert.equal(url.searchParams.get('room'),'ABC2345');assert.equal(url.searchParams.get('map'),'villa');assert.equal(url.searchParams.get('multiplayer'),'1');assert.equal(url.searchParams.has('server'),false);
 assert.equal(new URL(makeInvite('wss://play.example.com:443/old?password=secret','ABC2345','training')).origin,'https://play.example.com');
 assert.throws(()=>makeInvite('http://localhost:2567','ABC2345','villa'),/No Wi-Fi address/);
});
test('development discovery falls back when an older running host lacks the endpoint',async()=>{
 const requests=[];const result=await resolveInvite('http://127.0.0.1:2567','ABC2345','villa',{request:async url=>{requests.push(url);return url.startsWith('http:')?{ok:false}:{ok:true,json:async()=>({addresses:['192.168.100.25']})};}});
 assert.equal(requests.length,2);assert.equal(new URL(result).hostname,'192.168.100.25');
});
test('Wi-Fi discovery prefers LAN interfaces and skips loopback/link-local addresses',()=>{
 const entry=(address,internal=false)=>({family:'IPv4',address,internal});
 assert.deepEqual(hostAddresses({loopback:[entry('127.0.0.1',true)],Ethernet:[entry('169.254.1.2')],vEthernet:[entry('172.20.0.1')],WiFi:[entry('192.168.100.25')]}),['192.168.100.25','172.20.0.1']);
});
