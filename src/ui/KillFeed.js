// Shared by local bot kills and authoritative multiplayer eliminations.
const weapons={
 primary:{name:'M98B',icon:'sniper'},
 pistol:{name:'M9',icon:'pistol'},
 assault:{name:'M4A1',icon:'m4'},
 frag:{name:'FRAG',icon:'frag'},
 flash:{name:'FLASH',icon:'flash'},
 smoke:{name:'SMOKE',icon:'smoke'},
};
export function killWeapon(slot){return weapons[slot]||{name:'ELIMINATION',icon:null};}
export function makeKillFeedEntry(victimName,isHeadshot,slot,killerName='YOU'){
 const weapon=killWeapon(slot),entry=document.createElement('div');entry.className='kill-row';
 const label=(className,value)=>{const span=document.createElement('span');span.className=className;span.textContent=value;entry.appendChild(span);return span;};
 const icon=(parent,id,viewBox)=>{
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox',viewBox);svg.setAttribute('aria-hidden','true');
  const use=document.createElementNS('http://www.w3.org/2000/svg','use');use.setAttribute('href',`#hud-${id}`);svg.appendChild(use);parent.appendChild(svg);
 };
 label('killer',String(killerName));
 const cause=label('kill-weapon','');cause.title=weapon.name;cause.setAttribute('aria-label',weapon.name);
 if(weapon.icon)icon(cause,weapon.icon,['frag','flash','smoke'].includes(weapon.icon)?'0 0 24 24':'0 0 80 30');
 if(isHeadshot){const head=label('headshot-icon','');head.title='Headshot';head.setAttribute('aria-label','Headshot');icon(head,'headshot','0 0 24 24');}
 label('victim',String(victimName));
 entry.setAttribute('aria-label',`${killerName} eliminated ${victimName} with ${weapon.name}${isHeadshot?', headshot':''}`);
 return entry;
}
