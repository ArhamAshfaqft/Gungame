import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyLibrary,POSE_STORAGE_KEY} from '../src/studio/PoseLibrary.js';
import {saveProjectLibrary,loadProjectForWeapon} from '../src/studio/ProjectPoses.js';
const storage=()=>{const m=new Map();return {getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,v)};};
test('Save to game publishes the current manual adjustments and preserves the prior browser copy',async()=>{
 const store=storage(),l=emptyLibrary();l.m4SharedGrips.Left.position=[.035,-.02,.01];l.poses['primary:aim'].Right.handRotation=[.1,.2,.3];
 const original=JSON.stringify(l);store.setItem(POSE_STORAGE_KEY,original);let sent;
 const result=await saveProjectLibrary(l,{storage:store,request:async(url,init)=>{assert.equal(url,'/__studio/project-poses');sent=JSON.parse(init.body);return {ok:true,json:async()=>({saved:true,revision:'shared-version-1'})};}});
 assert.deepEqual(sent,l);assert.equal(result.projectRevision,'shared-version-1');assert.deepEqual(result.m4SharedGrips.Left,l.m4SharedGrips.Left);assert.equal(store.getItem('fast-snipe-poses-before-project-sync-v1'),original);
 assert.deepEqual(JSON.parse(store.getItem(POSE_STORAGE_KEY)),result);
});
test('failed project write retains the adjusted browser copy and never reports shared success',async()=>{
 const store=storage(),l=emptyLibrary();l.m4SharedGrips.Right.position=[.04,0,0];
 await assert.rejects(saveProjectLibrary(l,{storage:store,request:async()=>({ok:false,json:async()=>({error:'Disk write failed'})})}),/browser copy is preserved/);
 assert.deepEqual(JSON.parse(store.getItem(POSE_STORAGE_KEY)).m4SharedGrips.Right,l.m4SharedGrips.Right);
});
test('confirmed project poses override stale browser data without overwriting it; legacy projects preserve local poses',async t=>{
 const oldFetch=globalThis.fetch,oldStorage=globalThis.localStorage,store=storage();t.after(()=>{globalThis.fetch=oldFetch;if(oldStorage===undefined)delete globalThis.localStorage;else globalThis.localStorage=oldStorage;});
 const local=emptyLibrary();local.m4SharedGrips.Left.position=[.4,0,0];store.setItem(POSE_STORAGE_KEY,JSON.stringify(local));globalThis.localStorage=store;
 const project=emptyLibrary();project.m4SharedGrips.Left.position=[.02,0,0];globalThis.fetch=async()=>({ok:true,json:async()=>project});
 const weapon={poseLibrary:local};await loadProjectForWeapon(weapon);assert.equal(weapon.poseLibrary,local);
 project.projectRevision='published-1';await loadProjectForWeapon(weapon);assert.equal(weapon.poseLibrary.m4SharedGrips.Left.position[0],.02);assert.deepEqual(JSON.parse(store.getItem(POSE_STORAGE_KEY)),local);
});
