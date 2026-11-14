import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as T from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import {instantiateSwatRig} from '../src/models/SwatRig.js';
import {ShooterAnimator} from '../src/models/ShooterAnimator.js';
import {ASSAULT_RIGHT_GRIP,ASSAULT_LEFT_GRIP} from '../src/models/AssaultRifleModel.js';
import {bindPalmGripFrames,palmWorldPosition,palmWorldNormal} from '../src/models/PalmGripFrames.js';

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
function buffers(root){
    const out=[];root.traverse(mesh=>{if(mesh.isSkinnedMesh)for(const name of ['position','skinIndex','skinWeight'])out.push(Buffer.from(mesh.geometry.attributes[name].array.buffer).toString('base64'));});return out;
}

test('the measured palm is the palmar surface and skin weights/vertices stay byte-for-byte unchanged',()=>{
    const before=buffers(body.getObjectByName('SWAT_Body')),{r,model}=setup();r.animator.sample('idle',0);r.finishAnimatedPose({isAiming:true,adsProgress:1});
    const frames=bindPalmGripFrames(r,model);
    for(const side of ['Left','Right']){
        assert.ok(frames[side].sample.point.z>0,'must not pick the back of the glove');
        assert.ok(frames[side].sample.bary.toArray().every(n=>n>=0&&n<=1));
        assert.ok(Math.abs(frames[side].sample.bary.toArray().reduce((a,b)=>a+b)-1)<1e-6);
    }
    assert.deepEqual(buffers(body.getObjectByName('SWAT_Body')),before);assert.deepEqual(buffers(r.object),before);
});

test('actual glove contact stays on the M4 across ready, ADS, crouch, left/right peek and backward movement',t=>{
    const {r,model}=setup(),lengths=Object.fromEntries(['LeftForeArm','LeftHand','RightForeArm','RightHand'].map(name=>[name,r.bones[name].position.toArray()]));
    let worstGap=0,worstNormal=0;
    const cases=[['idle',0],['rifleReadyIdle',0],['runBack',0],['rifleCrouchIdle',0],['rifleCrouchIdle',-1],['rifleCrouchIdle',1]];
    for(const [clip,lean] of cases)for(const ads of [0,1])for(const time of [.1,.3]){
        r.animator.sample(clip,time);r.finishAnimatedPose({isCrouching:/crouch/i.test(clip),isGrounded:true,isAiming:!!ads,adsProgress:ads,lean});
        const frames=bindPalmGripFrames(r,model);
        for(const side of ['Left','Right']){
            const result=r.palmGripDiagnostics[side],gap=palmWorldPosition(frames[side].sample).distanceTo(result.point);
            worstGap=Math.max(worstGap,gap);
            assert.ok(gap<.003,`${clip}/${lean}/${ads}/${time}/${side} actual palm gap ${gap}`);
            assert.ok(Math.abs(result.roll.forearm)<=T.MathUtils.degToRad(65)+1e-9);
            assert.ok(Math.abs(result.roll.upper)<=T.MathUtils.degToRad(55)+1e-9);
            const normal=frames[side].sample.normal.clone().applyQuaternion(r.bones[side+'Hand'].getWorldQuaternion(new T.Quaternion()));
            assert.ok(normal.dot(frames[side].normal.clone().applyQuaternion(model.getWorldQuaternion(new T.Quaternion())))>.999);
            const actualNormal=palmWorldNormal(frames[side].sample),targetNormal=new T.Vector3(0,0,1).applyQuaternion(frames[side].anchor.getWorldQuaternion(new T.Quaternion()));
            const error=actualNormal.angleTo(targetNormal);worstNormal=Math.max(worstNormal,error);
            assert.ok(error<T.MathUtils.degToRad(15),`${clip}/${lean}/${ads}/${side}: glove surface must face the grip`);
        }
        for(const [name,p] of Object.entries(lengths))assert.deepEqual(r.bones[name].position.toArray(),p);
    }
    t.diagnostic(`Worst actual palm gap ${(worstGap*1000).toFixed(3)} mm; glove-normal deviation ${T.MathUtils.radToDeg(worstNormal).toFixed(2)} degrees.`);
});

test('reload releases the support hand, and other equipment keeps the recovered attachment path',()=>{
    const {r,model}=setup();r.animator.sample('reload',.3);r.finishAnimatedPose({isReloading:true});
    assert.equal(r.supportUsesWeaponTarget,false);assert.equal(r.palmGripDiagnostics.Left,undefined);
    r.attachAnimatedModel(model,'rifle','primary');assert.equal(bindPalmGripFrames(r,model),null);
    r.attachAnimatedModel(model,'pistol','pistol');assert.equal(bindPalmGripFrames(r,model),null);
});

test('moving and rotating a grip frame changes the contact without reauthoring an animation',()=>{
    const {r,model}=setup();r.animator.sample('idle',.1);r.finishAnimatedPose({isAiming:true,adsProgress:1});
    const frame=bindPalmGripFrames(r,model).Left;
    frame.anchor.position.z+=.02;frame.anchor.rotateZ(.1);
    r.animator.sample('idle',.1);r.finishAnimatedPose({isAiming:true,adsProgress:1});
    const actual=palmWorldPosition(frame.sample),target=frame.anchor.getWorldPosition(new T.Vector3());
    assert.ok(actual.distanceTo(target)<.003);
    const expectedNormal=new T.Vector3(0,0,1).applyQuaternion(frame.anchor.getWorldQuaternion(new T.Quaternion()));
    const actualNormal=frame.sample.normal.clone().applyQuaternion(r.bones.LeftHand.getWorldQuaternion(new T.Quaternion()));
    assert.ok(actualNormal.dot(expectedNormal)>.999);
});

test('the actual sleeve retains thickness near both elbows after grip fitting',()=>{
    const {r}=setup();r.reset();
    const rings={};
    function minor(points){
        const mx=points.reduce((n,p)=>n+p.x,0)/points.length,mz=points.reduce((n,p)=>n+p.z,0)/points.length;
        let xx=0,zz=0,xz=0;for(const p of points){const x=p.x-mx,z=p.z-mz;xx+=x*x;zz+=z*z;xz+=x*z;}
        return Math.sqrt(Math.max(0,(xx+zz-Math.sqrt((xx-zz)**2+4*xz*xz))/2/points.length));
    }
    for(const side of ['Left','Right']){
        const bone=r.bones[side+'ForeArm'],length=r.bones[side+'Hand'].position.length(),vertices=[];
        r.object.traverse(mesh=>{
            if(!mesh.isSkinnedMesh)return;mesh.skeleton.update();const bi=mesh.skeleton.bones.indexOf(bone),skin=mesh.geometry.attributes.skinIndex,w=mesh.geometry.attributes.skinWeight;
            for(let i=0;i<skin.count;i++){
                let amount=0;for(let k=0;k<4;k++)if(skin.getComponent(i,k)===bi)amount+=w.getComponent(i,k);
                if(amount<.35)continue;
                const p=bone.worldToLocal(mesh.localToWorld(mesh.getVertexPosition(i,new T.Vector3())));
                if(p.y>length*.12&&p.y<length*.32)vertices.push({mesh,index:i,point:p});
            }
        });
        assert.ok(vertices.length>10);rings[side]={vertices,before:minor(vertices.map(v=>v.point))};
    }
    for(const [clip,lean,ads] of [['idle',0,1],['rifleReadyIdle',0,0],['rifleCrouchIdle',-1,1],['rifleCrouchIdle',1,1],['runBack',0,1]]){
        r.animator.sample(clip,.2);r.finishAnimatedPose({lean,adsProgress:ads,isAiming:!!ads,isCrouching:/crouch/i.test(clip),isGrounded:true});
        for(const side of ['Left','Right']){
            const ring=rings[side],bone=r.bones[side+'ForeArm'];
            const after=minor(ring.vertices.map(({mesh,index})=>{mesh.skeleton.update();return bone.worldToLocal(mesh.localToWorld(mesh.getVertexPosition(index,new T.Vector3())));}));
            assert.ok(after/ring.before>.55,`${clip}/${lean}/${side}: sleeve thickness ${(after/ring.before).toFixed(3)}`);
        }
    }
});

test('third-person M4 muzzle follows vertical look in idle, ADS, movement and crouched peek',()=>{
    const {r,model}=setup();
    for(const [clip,lean,crouch] of [['rifleReadyIdle',0,false],['run',0,false],['rifleCrouchIdle',1,true]])for(const ads of [0,1]){
        const heights=[];
        for(const pitch of [-.4,0,.4]){
            r.animator.sample(clip,.15);
            r.finishAnimatedPose({aimPitch:pitch,lean,isCrouching:crouch,isGrounded:true,isAiming:!!ads,adsProgress:ads});
            heights.push(new T.Vector3(0,0,-1).applyQuaternion(model.getWorldQuaternion(new T.Quaternion())).y);
        }
        assert.ok(heights[0]<heights[1]&&heights[1]<heights[2],`${clip}/${ads}: down, neutral, up muzzle ${heights}`);
    }
});

test('M4 movement cycles keep a stable elbow frame and carry below the head',t=>{
    const {r,model}=setup();
    let maxStep=0,maxHeight=-Infinity,maxGap=0;
    const clips=['run','rifleRunReady','runBack','rifleRunForwardLeft','rifleRunForwardRight','rifleRunBackwardLeft','rifleRunBackwardRight','strafeRunLeft','strafeRunRight','rifleCrouchRun','rifleCrouchBack'];
    for(const clip of clips)for(const ads of [0,1]){
        const duration=r.animator.clips.get(clip).duration;let previous=null;
        for(let i=0;i<48;i++){
            r.animator.sample(clip,duration*i/48);
            r.finishAnimatedPose({isCrouching:/crouch/i.test(clip),isGrounded:true,isAiming:!!ads,adsProgress:ads});
            const frame=r.bones.LeftForeArm.quaternion.clone();
            if(previous)maxStep=Math.max(maxStep,previous.angleTo(frame));previous=frame;
            const top=model.getWorldPosition(new T.Vector3()).y-r.bones.Head.getWorldPosition(new T.Vector3()).y;
            maxHeight=Math.max(top,maxHeight);
            assert.ok(top<(ads?.15:0),`${clip}: carry must stay at eye height or below`);
            for(const side of ['Left','Right']){const gap=r.palmGripDiagnostics[side].error;maxGap=Math.max(maxGap,gap);assert.ok(gap<.003,`${clip}/${ads}/${i}/${side}: ${gap}`);}
        }
    }
    t.diagnostic(JSON.stringify({maxStepDegrees:T.MathUtils.radToDeg(maxStep),maxHeight,maxGap}));
    assert.ok(maxStep<T.MathUtils.degToRad(15),'forearm must not flip within a running cycle');

    assert.ok(maxGap<.003,'both palms must retain contact throughout locomotion');
});

test('M4 moving peeks stay lateral with stable muzzle direction and unchanged leg animation',()=>{
 const {r,model}=setup();
 for(const clip of ['rifleCrouchLeft','rifleCrouchRight'])for(const lean of [-1,1])for(const adsProgress of [0,1]){
  r.animator.sample(clip,.4);r.finishAnimatedPose({lean:0,adsProgress,isGrounded:true,isCrouching:true});
  const neutral=r.bones.Head.getWorldPosition(new T.Vector3()),feet=['LeftFoot','RightFoot'].map(n=>r.bones[n].getWorldPosition(new T.Vector3()));
  r.animator.sample(clip,.4);r.finishAnimatedPose({lean,adsProgress,isGrounded:true,isCrouching:true});
  const head=r.bones.Head.getWorldPosition(new T.Vector3()),direction=new T.Vector3(0,0,-1).applyQuaternion(model.getWorldQuaternion(new T.Quaternion()));
  const hips=r.bones.Hips.getWorldPosition(new T.Vector3());assert.ok(head.z-hips.z<.16,`${clip}: crouched strafe no longer folds forward`);assert.ok(head.y-hips.y>.4,`${clip}: torso retains height`);
  assert.ok((hips.x-head.x)*lean>0,`${clip}: bends to selected side`);
  assert.ok(direction.z>.94&&Math.abs(direction.x)<.01,`${clip}: M4 points forward`);
  for(const [i,n] of ['LeftFoot','RightFoot'].entries())assert.ok(r.bones[n].getWorldPosition(new T.Vector3()).distanceTo(feet[i])<1e-5);
 }
});
