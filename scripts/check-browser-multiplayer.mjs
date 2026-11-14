import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const browser=await chromium.launch({channel:'chrome',headless:true}),errors=[];
const map=process.argv.includes('--villa')?'villa':'training';
try{
 const pages=[];
 for(let i=0;i<2;i++){const context=await browser.newContext({viewport:{width:1200,height:850}}),page=await context.newPage();pages.push(page);page.on('pageerror',e=>{errors.push(e.message);console.error('pageerror',e.stack)});await page.goto(`http://127.0.0.1:5192/?map=${map}&multiplayer=1`);await page.waitForFunction(()=>window.__fastSnipe?.networkWorld);await page.locator('#mp-name').fill(i?'Guest':'Host');await page.locator('#mp-side').selectOption(i?'blue':'red');}
 await pages[0].locator('#mp-create').click();await pages[0].waitForFunction(()=>window.__fastSnipe.multiplayer?.connected,null,{timeout:30000});
 const code=await pages[0].evaluate(()=>window.__fastSnipe.multiplayer.code);await pages[1].locator('#mp-code').fill(code);await pages[1].locator('#mp-join').click();await pages[1].waitForFunction(()=>window.__fastSnipe.multiplayer?.connected,null,{timeout:30000});
 for(const page of pages)await page.waitForFunction(()=>window.__fastSnipe.multiplayer?.remotes.size===1&&[...window.__fastSnipe.multiplayer.remotes.values()][0].view.rig,null,{timeout:30000});
 if(map==='villa'){assert.deepEqual(errors,[]);console.log('PASS: villa room, initial world sync and remote rigs');process.exitCode=0;await browser.close();}else{
 const initial=await pages[0].evaluate(()=>{const n=window.__fastSnipe.multiplayer;return{code:n.code,own:n.own,remote:n.lastSnapshot.players.find(p=>p.id!==n.id)}});
 await pages[0].locator('#btn-play').click();await pages[0].keyboard.down('KeyW');await pages[0].waitForTimeout(1100);await pages[0].keyboard.up('KeyW');
 await pages[0].waitForTimeout(400);
 const motion=await pages[0].evaluate(()=>{const g=window.__fastSnipe;return{predicted:g.movement.position.toArray(),authority:g.multiplayer.own.movement.position,ack:g.multiplayer.own.ack,keys:g.movement.keys,locked:g.movement.isLocked,serverKeys:g.multiplayer.own.movement.keys,time:g.multiplayer.lastSnapshot.time,seq:g.multiplayer.seq,pending:g.multiplayer.pending.length}});console.log(JSON.stringify({initial,motion,errors}));
 assert.ok(motion.authority[2]<initial.own.movement.position[2]-1,'server moves host from inputs');
 await pages[0].evaluate(()=>document.exitPointerLock());await pages[0].waitForFunction(()=>!window.__fastSnipe.movement.isLocked);
 const guestSeen=await pages[1].evaluate(()=>window.__fastSnipe.multiplayer.lastSnapshot.players.find(p=>p.name==='Host').movement.position);
 assert.ok(guestSeen[2]<initial.own.movement.position[2]-1,'guest sees host movement');
 await pages[0].locator('#btn-play').click();
 await pages[0].evaluate(()=>window.__fastSnipe.weapon.switchWeapon('pistol'));await pages[0].waitForTimeout(500);
 for(let i=0;i<3;i++){
  await pages[0].waitForFunction(()=>window.__fastSnipe.weapon.canShoot&&window.__fastSnipe.weapon.fireCooldown<=0,null,{timeout:10000,polling:100});
  const shot=await pages[0].evaluate(()=>{const g=window.__fastSnipe,target=g.multiplayer.lastSnapshot.players.find(p=>p.id!==g.multiplayer.id).movement.position,from=g.movement.position,dx=target[0]-from.x,dz=target[2]-from.z;g.movement.yaw=Math.atan2(-dx,-dz);g.movement.pitch=Math.atan2(target[1]-.65-from.y,Math.hypot(dx,dz));g.weapon.shoot();return{slot:g.weapon.activeSlot,ammo:g.weapon.magAmmo,action:g.multiplayer.actionSeq,cooldown:g.weapon.fireCooldown,switch:g.weapon.switchTimer,can:g.weapon.canShoot,position:from.toArray(),target}});await pages[0].waitForTimeout(350);console.log(JSON.stringify({shot,state:await pages[0].evaluate(()=>window.__fastSnipe.multiplayer.lastSnapshot.players.map(p=>({name:p.name,hp:p.hp,actionAck:p.actionAck,ammo:p.ammo.pistol})))}));
 }
 const combat=await pages[0].evaluate(()=>({ammo:window.__fastSnipe.multiplayer.own.ammo.pistol.ammo,ack:window.__fastSnipe.multiplayer.own.actionAck}));
 assert.equal(combat.ammo,12);assert.equal(combat.ack,3);
 const invite=await pages[0].locator('#mp-invite').inputValue();assert.ok(invite.includes('transport=browser'));assert.ok(invite.includes(code));
 await pages[0].close();await pages[1].waitForFunction(()=>!window.__fastSnipe.multiplayer.connected,null,{timeout:10000});
 assert.match(await pages[1].locator('#mp-status').textContent(),/host disconnected/i);
 assert.deepEqual(errors,[]);console.log(JSON.stringify({map,code,combat,invite,result:'PASS'}));
}
}finally{await browser.close()}
