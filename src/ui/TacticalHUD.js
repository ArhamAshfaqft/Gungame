import {installHudIcons} from './HudIcons.js';

const clamp=(n,a,b)=>Math.max(a,Math.min(b,Number.isFinite(n)?n:a));
const text=(node,value)=>{if(node&&node.textContent!==String(value))node.textContent=String(value);};
export function compassBearing(yaw=0){return ((-yaw*180/Math.PI)%360+360)%360;}
export function formatRoundTime(seconds=0){const value=Math.floor(clamp(seconds,0,5999));return `${String(Math.floor(value/60)).padStart(2,'0')}:${String(value%60).padStart(2,'0')}`;}

export class TacticalHUD {
    constructor(){
        installHudIcons();
        const $=id=>document.getElementById(id);
        this.health=$('health-panel');this.healthFill=$('health-fill');this.healthValue=$('health-value');this.healthMax=$('health-max');
        this.stance=$('stance-icon-use');this.compass=$('compass-dial');this.heading=$('compass-heading');
        this.ammo=$('ammo-panel');this.activeKey=$('active-weapon-key');this.activeIcon=$('active-weapon-icon-use');this.reloadFill=$('reload-fill');this.reloadHint=$('reload-hint');
        this.timer=$('round-timer');this.round=$('round-label');this.scores={defenders:$('defenders-score'),attackers:$('attackers-score')};
        this.profiles={};
        for(const [team,id] of [['defenders','defender-profiles'],['attackers','attacker-profiles']]){
            const container=$(id);this.profiles[team]=[];
            for(let i=0;i<5;i++){
                const profile=document.createElement('span');profile.className='player-profile';profile.textContent='?';profile.setAttribute('aria-label',`${team}, player ${i+1}: unknown`);
                container?.append(profile);this.profiles[team].push(profile);
            }
        }
        this.slots=Object.fromEntries(['primary','pistol','assault'].map(slot=>{const node=$('slot-ammo-'+slot);return [slot,{mag:node?.firstChild,reserve:node?.querySelector('small')}];}));
        this.match={defendersScore:0,attackersScore:0,round:1,seconds:0,playerTeam:'defenders',defenders:[],attackers:[]};
        this.setMatchState({});
    }
    setMatchState(state={}){
        this.match={...this.match,...state};
        text(this.timer,formatRoundTime(this.match.seconds));text(this.round,`ROUND ${Math.floor(clamp(this.match.round,1,999))}`);
        for(const team of ['defenders','attackers']){
            text(this.scores[team],Math.floor(clamp(this.match[team+'Score'],0,99)));
            this.profiles[team].forEach((node,i)=>{node.classList.toggle('self',team===this.match.playerTeam&&i===0);node.classList.toggle('eliminated',this.match[team]?.[i]?.alive===false);});
        }
    }
    update(movement,weapon,equipment){
        const max=equipment?.maxPlayerHealth||100,hp=clamp(equipment?.playerHealth??100,0,max);
        text(this.healthValue,Math.ceil(hp));text(this.healthMax,max);
        if(this.healthFill)this.healthFill.style.transform=`scaleX(${hp/max})`;
        this.health?.classList.toggle('low-health',hp>0&&hp/max<=.25);this.health?.classList.toggle('down',hp===0);
        const own=this.profiles[this.match.playerTeam]?.[0];own?.classList.toggle('eliminated',hp===0||this.match[this.match.playerTeam]?.[0]?.alive===false);
        const stance=movement.isCrouching||movement.isSliding?'crouching':movement.isSprinting||movement.getSpeed()>.15?'running':'standing';
        if(this.lastStance!==stance){this.stance?.setAttribute('href','#hud-'+stance);this.lastStance=stance;}
        const bearing=Math.round(compassBearing(movement.yaw))%360;
        if(this.lastBearing!==bearing){
            this.compass?.style.setProperty('--compass-rotation',`${-bearing}deg`);
            text(this.heading,`${['N','NE','E','SE','S','SW','W','NW'][Math.round(bearing/45)%8]} ${String(bearing).padStart(3,'0')}°`);this.lastBearing=bearing;
        }
        const slot=weapon.grenadeEquipped?(equipment?.held?.type||equipment?.selected||'frag'):weapon.activeSlot;
        const icon={primary:'sniper',pistol:'pistol',assault:'rifle',frag:'frag',flash:'flash',smoke:'smoke'}[slot];
        text(this.activeKey,{primary:'1',pistol:'2',assault:'6',frag:'3',flash:'4',smoke:'5'}[slot]||'');
        if(this.lastIcon!==icon){this.activeIcon?.setAttribute('href','#hud-'+icon);this.lastIcon=icon;}
        for(const [name,nodes] of Object.entries(this.slots)){
            const store=weapon.ammoStores?.[name];if(!store)continue;
            const value=String(store.ammo)+' ';if(nodes.mag&&nodes.mag.nodeValue!==value)nodes.mag.nodeValue=value;
            text(nodes.reserve,store.reserve);
        }
        this.ammo?.classList.toggle('reloading',!!weapon.isReloading);
        this.ammo?.classList.toggle('low-ammo',!weapon.grenadeEquipped&&weapon.magAmmo<=Math.max(1,Math.floor((weapon.maxMag||5)*.2)));
        if(this.reloadFill)this.reloadFill.style.transform=`scaleX(${weapon.isReloading?clamp(weapon.reloadProgress||0,0,1):0})`;
        if(this.reloadHint){this.reloadHint.hidden=!!weapon.grenadeEquipped||(!weapon.isReloading&&weapon.magAmmo>=weapon.maxMag);text(this.reloadHint,weapon.isReloading?'RELOADING':'R · RELOAD');}
    }
}
