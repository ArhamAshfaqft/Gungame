export const PROTOCOL = 4;
export const STEP = 1 / 60;
export const MAX_PLAYERS = 4;
export const INPUT_KEYS = ['forward','backward','left','right','sprint','jump','slide','walk','crouch','leanLeft','leanRight'];
const FIELDS = ['currentHeight','yaw','pitch','isGrounded','isSprinting','isCrouchRunning','isSliding','isCrouching','isWalking','isAiming','isReloading','isThrowing','sprintRecovery','sprintInterruptTimer','slideCooldownTimer','jumpCooldown','slideTimer','coyoteTime','lean','leanTarget','leanOffset','effectiveLean','cameraRoll','bobTime','bobAmount','stepDistance'];
export function withWorldSeed(build){const original=Math.random;let seed=934721;Math.random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296};try{return build()}finally{Math.random=original}}
export function movementState(m){return {position:m.position.toArray(),velocity:m.velocity.toArray(),slideDirection:m.slideDirection.toArray(),keys:{...m.keys},...Object.fromEntries(FIELDS.map(k=>[k,m[k]??0]))}}
export function restoreMovement(m,state){m.position.fromArray(state.position);m.velocity.fromArray(state.velocity);m.slideDirection.fromArray(state.slideDirection);Object.assign(m.keys,state.keys);for(const key of FIELDS)if(state[key]!==undefined)m[key]=state[key];}
export function readInput(m,w,seq){return{seq,keys:{...m.keys},yaw:m.yaw,pitch:m.pitch,crouching:m.isCrouching,aiming:!!w.isAiming,slot:w.activeSlot}}
export function validInput(data){return data&&Number.isSafeInteger(data.seq)&&data.seq>=0&&data.seq<1e10&&Number.isFinite(data.yaw)&&Math.abs(data.yaw)<1e6&&Number.isFinite(data.pitch)&&Math.abs(data.pitch)<=Math.PI/2&&data.keys&&typeof data.keys==='object'&&['primary','pistol','assault'].includes(data.slot);}
export function applyInput(m,data){
 m.yaw=data.yaw;m.pitch=data.pitch;m.isAiming=!!data.aiming;
 if(data.keys.jump&&!m.keys.jump)m.handleJump();
 if(data.keys.slide&&!m.keys.slide)m.handleSlidePress();
 if(!!data.crouching!==m.isCrouching&&(data.crouching||m.canStand()))m.isCrouching=!!data.crouching;
 for(const key of INPUT_KEYS)m.keys[key]=!!data.keys[key];
}
export const safeName=name=>String(name||'Operator').replace(/[<>\u0000-\u001f]/g,'').trim().slice(0,20)||'Operator';
export function connectionProblem(error,address){
 const message=error?.message||String(error);
 if(!/failed to fetch|fetch failed|networkerror|load failed/i.test(message))return error;
 return new Error(`Cannot reach the multiplayer server at ${address}. On the host PC, open Host Multiplayer.cmd and keep its window running. If you are joining from another PC, use the host PC’s address, not 127.0.0.1.`);
}
