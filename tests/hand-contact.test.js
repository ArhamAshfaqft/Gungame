import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyLibrary,validateLibrary,blendPose} from '../src/studio/PoseLibrary.js';
import {setGripCurl} from '../src/studio/GripSetup.js';
import {addTimelinePose} from '../src/studio/ReloadTimeline.js';
import {validateHandContact} from '../src/studio/HandContact.js';

test('marked contacts and thumb orientation save independently by weapon, hand, stance and view',()=>{
 const library=emptyLibrary(),hand=library.poses['assault:hip'].Left;
 hand.contact={weaponPoint:[.01,.02,-.2],palmPoint:[1,4,0]};hand.thumbRotation=[0,.2,-.3];
 library.thirdPersonRightGrips.pistol.contact={weaponPoint:[.02,-.02,.03],palmPoint:[0,2,1]};
 const clean=validateLibrary(JSON.parse(JSON.stringify(library)));
 assert.deepEqual(clean,library);assert.equal(clean.poses['assault:aim'].Left.contact,null);assert.equal(clean.poses['assault:hip'].Right.contact,null);
 assert.equal(clean.thirdPersonGrips.assault.contact,null);
 const aim=blendPose(library.poses['assault:hip'],library.poses['assault:aim'],1);
 assert.equal(aim.Left.contact,null);
 assert.equal(blendPose(library.poses['assault:hip'],library.poses['assault:aim'],.25).Left.contact.weight,.75);
 assert.throws(()=>validateHandContact({weaponPoint:[NaN,0,0],palmPoint:[0,0,0]}));
 const reload=addTimelinePose(library.poses['assault:hip'],emptyLibrary().poses['assault:hip']);
 assert.deepEqual(reload.Left.contact,hand.contact);
 delete hand.contact;delete hand.thumbRotation;
 const migrated=validateLibrary(library).poses['assault:hip'].Left;
 assert.equal(migrated.contact,null);assert.deepEqual(migrated.thumbRotation,[0,0,0]);
});
test('simple three-finger wrap, index and thumb curls remain independent',()=>{
 const base=emptyLibrary().poses['assault:hip'].Left,target=structuredClone(base);
 setGripCurl(target,base,.4);
 assert.deepEqual(target.fingers.Index,[0,0,0]);assert.deepEqual(target.fingers.Thumb,[0,0,0]);
 for(const finger of ['Middle','Ring','Pinky'])assert.ok(target.fingers[finger].every(n=>n>0));
 const wrapped=structuredClone(target.fingers.Middle);
 setGripCurl(target,base,-.2,{trigger:true});setGripCurl(target,base,.3,{thumb:true});
 assert.deepEqual(target.fingers.Middle,wrapped);assert.ok(target.fingers.Index.every(n=>n<0));assert.ok(target.fingers.Thumb.every(n=>n>0));
});
