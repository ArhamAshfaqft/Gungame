import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import * as T from 'three';import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';import {TripoHandFit} from '../src/player/TripoHandFit.js';import {trimTripoRun} from '../src/player/TripoRunCycle.js';
async function setup(){const b=fs.readFileSync(new URL('../public/assets/comparison/tripo-playable.glb',import.meta.url)),a=await new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'');const root=new T.Group();root.add(a.scene);a.scene.scale.setScalar(2);const mixer=new T.AnimationMixer(a.scene),actions={};for(const c of a.animations){const action=mixer.clipAction(c.name==='Tripo_Run'?trimTripoRun(c):c).play();action.setEffectiveWeight(c.name==='Tripo_Idle'?1:0);actions[c.name]=action;}mixer.update(0);root.updateMatrixWorld(true);return {a,root,mixer,actions,fit:new TripoHandFit(root,a.scene,mixer,actions)};}
test('hand fitting preserves every torso/leg pose and all bone lengths through the running cycle and held peeks',async t=>{
 const {a,root,mixer,actions,fit}=await setup();let missing=0,maxGap=0;
 for(const name of ['Tripo_Idle','Tripo_Run','Tripo_Peek','Tripo_PeekOther']){
  for(const [n,action] of Object.entries(actions))action.setEffectiveWeight(n===name?1:0);
  for(let frame=0;frame<120;frame++){
   fit.restore();actions[name].time=name.includes('Peek')?3.3:actions[name].getClip().duration*frame/120;mixer.update(0);root.updateMatrixWorld(true);
   const before=Object.entries(fit.bones).map(([n,b])=>[n,b,b.quaternion.toArray(),b.position.toArray()]);
   fit.apply(name==='Tripo_Run'?1:0,name.includes('Peek')?1:0);
   for(const [n,b,rot,pos] of before){assert.deepEqual(b.position.toArray(),pos);if(!['RightArm','RightForeArm','RightHand','LeftArm','LeftForeArm','LeftHand'].includes(n)&&!/^LeftHand(Index|Middle|Ring|Pinky)/.test(n))assert.deepEqual(b.quaternion.toArray(),rot,n);}
   if(!fit.reachable)missing++;else maxGap=Math.max(maxGap,fit.error);
  }
 }
 t.diagnostic(JSON.stringify({missing,maxGap}));assert.equal(missing,0,'every tested support target must be within reach');assert.ok(maxGap<.003);
});

test('support fitting preserves the corrected source trigger-wrist world rotation',async()=>{
 const {root,mixer,actions,fit}=await setup();for(const [name,a] of Object.entries(actions))a.setEffectiveWeight(name==='Tripo_Run'?1:0);
 for(let frame=0;frame<240;frame++){
  fit.restore();actions.Tripo_Run.time=actions.Tripo_Run.getClip().duration*frame/240;mixer.update(0);root.updateMatrixWorld(true);
  const original=fit.bones.RightHand.getWorldQuaternion(new T.Quaternion());fit.apply(1,0);
  const final=fit.bones.RightHand.getWorldQuaternion(new T.Quaternion());assert.ok(original.normalize().angleTo(final.normalize())<.00001);
 }
});
