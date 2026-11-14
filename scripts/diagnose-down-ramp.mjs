import * as T from 'three';import {MovementController} from '../src/player/MovementController.js';
globalThis.window=new EventTarget();globalThis.document=new EventTarget();const p=new MovementController(new T.PerspectiveCamera(),new EventTarget());p.isLocked=p.isGrounded=true;p.yaw=Math.PI;p.position.set(0,3.75+p.currentHeight,-3.5);p.keys.forward=true;
const box=new T.Box3(new T.Vector3(-2,0,-4),new T.Vector3(2,4,4));box.ramp={position:new T.Vector3(),rotation:0,width:4,length:8,height:4};let airborne=0;
for(let i=0;i<60;i++){p.update(1/60,[box]);if(!p.isGrounded)airborne++;}
console.log({airborneFrames:airborne,total:60});
