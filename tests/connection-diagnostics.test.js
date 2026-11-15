import test from 'node:test';
import assert from 'node:assert/strict';
import {updateConnectionDetails} from '../src/multiplayer/ConnectionDiagnostics.js';
test('address diagnostics count public and local routes without retaining network addresses',()=>{
 const info={},description={sdp:'a=candidate:1 1 udp 123 192.168.1.2 1234 typ host\r\na=candidate:2 1 udp 123 203.0.113.5 1234 typ srflx raddr 192.168.1.2 rport 1234\r\n'};
 updateConnectionDetails(info,{localDescription:description,remoteDescription:{sdp:'a=candidate:3 1 udp 123 198.51.100.2 1234 typ relay\r\n'},iceGatheringState:'complete',connectionState:'connecting'});
 assert.deepEqual(info.localTypes,{host:1,srflx:1,prflx:0,relay:0});assert.equal(info.remoteTypes.relay,1);assert.equal(info.remoteAnswer,true);assert.equal(info.gatheringState,'complete');
 assert.ok(!JSON.stringify(info).includes('192.168'));assert.ok(!JSON.stringify(info).includes('203.0.113'));assert.ok(!JSON.stringify(info).includes('198.51.100'));
});
