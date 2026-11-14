import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {emptyLibrary,validateLibrary} from '../src/studio/PoseLibrary.js';
import {fullBodyPose,blendFullBodyPose,applyFullBodyPose} from '../src/studio/FullBodyPoses.js';
import {gripEditTarget,resetGripStep} from '../src/studio/GripSetup.js';

test('old full-body fits migrate to independent ready and aiming poses including contacts and fingers',()=>{
 const old=emptyLibrary();old.weaponHolding.assault.enabled=false;delete old.thirdPersonAim;
 old.thirdPerson.assault.position=[.02,-.103,.04];old.thirdPersonGrips.assault.fingers.Ring[1]=.4;
 old.thirdPersonGrips.assault.contact={weaponPoint:[0,0,-.2],palmPoint:[0,3,1]};
 const before=JSON.stringify(old),library=validateLibrary(old),hip=fullBodyPose(library,'assault'),aim=fullBodyPose(library,'assault','aim');
 assert.deepEqual(hip,aim);assert.equal(JSON.stringify(old),before);
 aim.weapon.position[1]=.08;aim.Left.contact.weaponPoint[2]=-.25;aim.Left.fingers.Ring[1]=.7;
 assert.equal(hip.weapon.position[1],-.103);assert.equal(hip.Left.contact.weaponPoint[2],-.2);assert.equal(hip.Left.fingers.Ring[1],.4);
 assert.deepEqual(validateLibrary(JSON.parse(JSON.stringify(library))),library);
});
test('shared pose editing and reset stay isolated by stance, weapon and hand; manual first-person poses stay intact',()=>{
 const library=emptyLibrary();library.weaponHolding.assault.enabled=false;const manual=JSON.stringify(library.poses),hip=fullBodyPose(library,'assault');
 const target=gripEditTarget(library,'assault','aim','Right',true);target.position[0]=.03;target.thumbRotation[1]=.2;
 assert.equal(hip.Right.position[0],0);assert.equal(fullBodyPose(library,'pistol','aim').Right.position[0],0);
 resetGripStep(library,'assault','aim','Left',true);assert.equal(target.position[0],.03);
 resetGripStep(library,'assault','aim','Right',true);assert.equal(target.position[0],0);
 assert.equal(JSON.stringify(library.poses),manual);
 library.thirdPersonAim.assault.Left.position[0]=Infinity;assert.throws(()=>validateLibrary(library));
});
test('ADS blends shared weapon, fingers, thumb and contacts with shortest-path rotations and exact endpoints',()=>{
 const library=emptyLibrary();library.weaponHolding.assault.enabled=false;const a=fullBodyPose(library,'assault'),b=fullBodyPose(library,'assault','aim');
 a.weapon.position[1]=-.1;b.weapon.position[1]=.1;a.weapon.rotation[1]=170*Math.PI/180;b.weapon.rotation[1]=-170*Math.PI/180;
 a.Left.contact={weaponPoint:[0,0,-.2],palmPoint:[0,3,0]};b.Left.fingers.Middle[1]=1;b.Left.thumbRotation[1]=.4;
 const before=JSON.stringify(library);
 assert.equal(blendFullBodyPose(library,'assault',0).weapon,a.weapon);assert.equal(blendFullBodyPose(library,'assault',1),b);
 const half=blendFullBodyPose(library,'assault',.5);assert.equal(half.weapon.position[1],0);assert.equal(half.Left.fingers.Middle[1],.5);assert.equal(half.Left.contact.weight,.5);
 const q=new T.Quaternion().setFromEuler(new T.Euler(...half.weapon.rotation));assert.ok(q.angleTo(new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),Math.PI))<1e-6);
 const rig={};applyFullBodyPose(rig,library,'assault',.25);assert.ok(Math.abs(rig.thirdPersonPlacements.assault.position[1]+.05)<1e-6);
 assert.equal(JSON.stringify(library),before);
});
