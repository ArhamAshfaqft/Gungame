import test from 'node:test';
import assert from 'node:assert/strict';
import {connectionProblem} from '../src/multiplayer/Protocol.js';
test('connection failures explain starting the host instead of showing failed to fetch',()=>{
 const error=connectionProblem(new TypeError('Failed to fetch'),'http://127.0.0.1:2567/');
 assert.match(error.message,/Host Multiplayer.cmd/);assert.match(error.message,/127.0.0.1:2567/);assert.match(error.message,/another PC/);
});
test('wrong-password and room errors retain their original explanation',()=>{
 const error=new Error('Incorrect room password.');assert.equal(connectionProblem(error,'http://127.0.0.1:2567/'),error);
});
