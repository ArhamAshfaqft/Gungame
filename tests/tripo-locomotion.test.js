import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as T from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import {instantiateSwatRig} from '../src/models/SwatRig.js';
import {ShooterAnimator} from '../src/models/ShooterAnimator.js';
import {ASSAULT_RIGHT_GRIP,ASSAULT_LEFT_GRIP} from '../src/models/AssaultRifleModel.js';
import {TripoLocomotion,directionalLegClip} from '../src/player/TripoLocomotion.js';
import {trimTripoRun} from '../src/player/TripoRunCycle.js';
async function asset(path){
    const source=readFileSync(new URL('../public/assets/'+path,import.meta.url));
    const size=source.readUInt32LE(12),json=JSON.parse(source.subarray(20,20+size));
    if(json.materials)json.materials=json.materials.map(m=>({name:m.name}));
    const text=Buffer.from(JSON.stringify(json)),padded=Buffer.alloc(Math.ceil(text.length/4)*4,32);text.copy(padded);
    const bin=source.subarray(20+size),bytes=Buffer.alloc(20+padded.length+bin.length);
    bytes.writeUInt32LE(0x46546c67,0);bytes.writeUInt32LE(2,4);bytes.writeUInt32LE(bytes.length,8);
    bytes.writeUInt32LE(padded.length,12);bytes.writeUInt32LE(0x4e4f534a,16);padded.copy(bytes,20);bin.copy(bytes,20+padded.length);
    return (await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'')).scene;
}
const body=await asset('operators/swat.glb'),rifle=await asset('weapons/m4a1.glb');
const packs=['shooter-pack','rifle-run-pack','rifle-expansion-pack','pistol-pack'].map(name=>JSON.parse(readFileSync(new URL(`../public/assets/animations/${name}.json`,import.meta.url))));
const pack={...packs[0],clips:packs.flatMap(p=>p.clips)};
function setup(){
    const r=instantiateSwatRig(body.getObjectByName('SWAT_Body'));
    r.animator=new ShooterAnimator(r,pack);const model=rifle.clone(true);
    model.userData.triggerGrip=ASSAULT_RIGHT_GRIP.clone();model.userData.supportGrip=ASSAULT_LEFT_GRIP.clone();
    r.object.add(model);r.attachAnimatedModel(model,'rifle','assault');return {r,model};
}

test('moving peek advances the lower-body cycle without changing arm/head tracks or upper-body orientation',async()=>{
 const {r}=setup();r.animator.sample('idle',0);
 const b=readFileSync(new URL('../public/assets/comparison/tripo-playable.glb',import.meta.url)),assetNew=await new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'');
 const root=new T.Group();root.add(assetNew.scene);assetNew.scene.scale.setScalar(2);const mixer=new T.AnimationMixer(assetNew.scene),idle=mixer.clipAction(assetNew.animations.find(c=>c.name==='Tripo_Idle')).play(),run=mixer.clipAction(trimTripoRun(assetNew.animations.find(c=>c.name==='Tripo_Run'))).play();run.setEffectiveWeight(0);mixer.update(0);root.updateMatrixWorld(true);
 const layer=new TripoLocomotion(root,assetNew.scene,run,r);idle.setEffectiveWeight(0);const peek=mixer.clipAction(assetNew.animations.find(c=>c.name==='Tripo_Peek')).play();peek.paused=true;peek.time=3.3;
 const changes=[];
 for(let frame=0;frame<90;frame++){
  layer.restore();run.time=run.getClip().duration*(frame%45)/45;mixer.update(0);root.updateMatrixWorld(true);
  r.animator.sample('run',frame/60);
  const before=Object.entries(layer.bones).filter(([n])=>/Arm|Hand|Head|Neck/.test(n)).map(([n,b])=>[b,b.quaternion.toArray(),b.position.toArray()]);const spine=layer.bones.Spine.getWorldQuaternion(new T.Quaternion());
  layer.apply(1/60,{speed:2,velocity:new T.Vector3(0,0,2),peekWeight:1,weight:1});
  assert.ok(spine.normalize().angleTo(layer.bones.Spine.getWorldQuaternion(new T.Quaternion()).normalize())<1e-5);
  for(const [b,q,p] of before){assert.deepEqual(b.quaternion.toArray(),q);assert.deepEqual(b.position.toArray(),p);}
  changes.push(layer.bones.LeftLeg.quaternion.clone());
 }
 assert.ok(changes.some(q=>q.angleTo(changes[0])>.2),'legs must step while the peek is held');
});

test('all eight directions select directional legwork, including slow diagonal peeking',()=>{
 const cases=[[0,1,'walk'],[0,-1,'walkBack'],[-1,0,'strafeLeft'],[1,0,'strafeRight'],[-1,1,'rifleRunForwardLeft'],[1,1,'rifleRunForwardRight'],[-1,-1,'rifleRunBackwardLeft'],[1,-1,'rifleRunBackwardRight']];
 for(const [x,z,expected] of cases)assert.equal(directionalLegClip(new T.Vector3(x,0,z),1.1),expected);
});
