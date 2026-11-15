import test from 'node:test';
import assert from 'node:assert/strict';
import {onRequest} from '../functions/api/ice-servers.js';
import {PUBLIC_STUN,loadIceConfig,hasRelay,joinTimeoutMessage} from '../src/multiplayer/IceConfig.js';

const context=(env={},headers={})=>({env,request:new Request('https://game.example/api/ice-servers',{method:'POST',headers:{Origin:'https://game.example',...headers}})});
const relay={urls:['turn:turn.cloudflare.com:3478?transport=udp','turns:turn.cloudflare.com:443?transport=tcp'],username:'short-lived-user',credential:'short-lived-password'};

test('relay endpoint retains direct networking without claiming TURN is configured',async()=>{
 const response=await onRequest(context()),body=await response.json();assert.equal(response.status,200);assert.equal(body.relayAvailable,false);assert.equal(hasRelay(body.iceServers),false);assert.equal(response.headers.get('cache-control'),'no-store');
 assert.equal((await onRequest(context({},{Origin:'https://other.example'}))).status,403);
 assert.equal((await onRequest({...context(),request:new Request('https://game.example/api/ice-servers')})).status,405);
});

test('relay endpoint exchanges server secrets for expiring ICE credentials without exposing master keys',async()=>{
 const original=globalThis.fetch;let call;
 globalThis.fetch=async(url,init)=>{call={url,init};return Response.json({iceServers:[{urls:'stun:stun.cloudflare.com:3478'},relay],privateProviderMetadata:'do not expose'});};
 try{
  const response=await onRequest(context({TURN_KEY_ID:'key-id',TURN_KEY_API_TOKEN:'master-secret'})),text=await response.text(),body=JSON.parse(text);
  assert.equal(response.status,200);assert.ok(body.relayAvailable);assert.ok(hasRelay(body.iceServers));assert.ok(body.expiresAt>Date.now()+14300000);
  assert.ok(!text.includes('master-secret')&&!text.includes('key-id')&&!text.includes('privateProviderMetadata'));
  assert.equal(call.url,'https://rtc.live.cloudflare.com/v1/turn/keys/key-id/credentials/generate-ice-servers');assert.equal(call.init.headers.Authorization,'Bearer master-secret');assert.equal(JSON.parse(call.init.body).ttl,14400);
 }finally{globalThis.fetch=original;}
});

test('relay upstream failures and rate limits produce safe errors',async()=>{
 const original=globalThis.fetch,env={TURN_KEY_ID:'key-id',TURN_KEY_API_TOKEN:'master-secret'};
 try{
  globalThis.fetch=async()=>new Response('private upstream error master-secret',{status:401});let response=await onRequest(context(env));assert.equal(response.status,503);assert.ok(!(await response.text()).includes('master-secret'));
  globalThis.fetch=async()=>{throw Error('private network detail');};response=await onRequest(context(env));assert.equal(response.status,503);
  response=await onRequest(context({...env,TURN_RATE_LIMITER:{limit:async()=>({success:false})}}));assert.equal(response.status,429);
 }finally{globalThis.fetch=original;}
});

test('browser loads short-lived relay configuration; static and failing endpoints retain direct STUN',async()=>{
 let request;const loaded=await loadIceConfig(async(url,init)=>{request={url,init};return Response.json({iceServers:[relay]});});assert.ok(loaded.relayAvailable);assert.equal(request.url,'/api/ice-servers');assert.equal(request.init.method,'POST');assert.ok(!JSON.stringify(request).includes('master-secret'));assert.ok(loaded.config.iceServers[0].urls.includes('turns:turn.cloudflare.com:443?transport=tcp'));
 for(const response of [new Response('static site HTML'),new Response('',{status:503}),Response.json({iceServers:[{}]})]){const result=await loadIceConfig(async()=>response);assert.equal(result.relayAvailable,false);assert.deepEqual(result.config.iceServers,PUBLIC_STUN);}
});

test('join failures distinguish missing relay from an open but unresponsive host',()=>{
 assert.match(joinTimeoutMessage({relayAvailable:false}),/relay is not configured or unavailable/);
 assert.match(joinTimeoutMessage({relayAvailable:false,opened:true}),/connection opened/);
 assert.match(joinTimeoutMessage({relayAvailable:true,iceState:'failed'}),/including the relay/);
 assert.doesNotMatch(joinTimeoutMessage({relayAvailable:true}),/not configured/);
});
