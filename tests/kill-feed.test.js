import test from 'node:test';
import assert from 'node:assert/strict';
import {GameWorld} from '../server/GameWorld.js';
import {killWeapon} from '../src/ui/KillFeed.js';

test('kill feed distinguishes equipped weapons and never guesses a sniper for unknown causes',()=>{
 assert.deepEqual(['primary','pistol','assault','frag'].map(s=>killWeapon(s).name),['M98B','M9','M4A1','FRAG']);
 assert.equal(new Set(['primary','pistol','assault','frag'].map(s=>killWeapon(s).icon)).size,4);
 assert.equal(killWeapon(undefined).icon,null);
});
test('authoritative eliminations retain lethal shot weapon and headshot, including grenade kills after switching',()=>{
 const world=new GameWorld('training'),events=[];world.emit=(type,data)=>events.push({type,...data});
 try{
  const attacker=world.addPlayer('a'),victim=world.addPlayer('v');
  for(const cause of [{slot:'pistol',headshot:true},{slot:'assault',headshot:false},{slot:'primary',headshot:true},{slot:'frag'}]){
   victim.hp=100;attacker.slot='pistol';world.damage(victim,100,attacker,cause);
   const event=events.at(-1);assert.equal(event.type,'eliminated');assert.equal(event.slot,cause.slot);assert.equal(event.headshot,!!cause.headshot);
  }
 }finally{world.dispose();}
});
