import test from 'node:test';import assert from 'node:assert/strict';import {emptyLibrary,validateLibrary}from'../src/studio/PoseLibrary.js';
test('pistol palm upgrade retires only the exact old wrist fix and keeps reloads and other weapons',()=>{
 const library=emptyLibrary();delete library.pistolPalmGrip;
 library.poses['pistol:hip'].Right.position=[.009,.026,.034];library.poses['pistol:hip'].Right.rotation=[0,.0890117918517108,.8970992355250853];
 library.poses['pistol:aim'].Right.position=[.02,.04,.01];
 const before=structuredClone(library),result=validateLibrary(library);
 assert.deepEqual(result.poses['pistol:hip'].Right.position,[0,0,0]);assert.deepEqual(result.poses['pistol:hip'].Right.rotation,[0,0,0]);
 assert.deepEqual(result.poses['pistol:aim'],before.poses['pistol:aim']);assert.deepEqual(result.poses['primary:hip'],before.poses['primary:hip']);assert.deepEqual(result.reloadSequence,before.reloadSequence);
 result.poses['pistol:hip'].Right.position=[.01,.01,.01];assert.deepEqual(validateLibrary(result).poses['pistol:hip'].Right.position,[.01,.01,.01]);
});
