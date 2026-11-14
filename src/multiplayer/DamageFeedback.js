import {soundEngine} from '../audio/SoundEngine.js';
import './player-feedback.css';
export class DamageFeedback{
 constructor(game,audio=soundEngine){this.game=game;this.audio=audio;this.seq=0;this.health=100;this.pulse=0;this.directionTime=0;this.el=document.createElement('div');this.el.id='player-damage-feedback';this.el.setAttribute('aria-hidden','true');this.arrow=document.createElement('div');this.arrow.className='damage-direction';this.el.append(this.arrow);document.body.append(this.el);this.notice=document.createElement('div');this.notice.id='player-hit-notice';this.notice.setAttribute('role','status');this.notice.setAttribute('aria-live','polite');document.body.append(this.notice);}
 hit(data){if(data.seq<=this.seq)return;this.seq=data.seq;this.health=data.hp;this.pulse=Math.min(1,this.pulse+.4+data.amount/100);this.notice.textContent=data.hp<=0?'YOU DIED':`HIT - ${data.hp} HP`;this.noticeTime=data.hp<=0?1.5:.65;
 if(data.source){const p=this.game.movement.position;this.bearing=Math.atan2(data.source[0]-p.x,-(data.source[2]-p.z));this.directionTime=.9;this.game.equipment.lastDamageDirection=p.clone().sub({x:data.source[0],y:data.source[1],z:data.source[2]}).normalize();}
 this.audio.playPlayerHurt(data.amount,data.hp<=0);}
 sync(hp,spectator=false){if(hp>this.health||spectator){this.pulse=0;this.directionTime=0;this.noticeTime=0;}this.health=hp;this.spectator=spectator;}
 update(dt){this.pulse=Math.max(0,this.pulse-dt*1.05);this.directionTime=Math.max(0,this.directionTime-dt);this.noticeTime=Math.max(0,(this.noticeTime||0)-dt);const low=this.health>0&&!this.spectator?Math.max(0,(55-this.health)/55)*.4:0;this.el.style.opacity=String(Math.min(.85,low+this.pulse*.65));this.arrow.style.opacity=String(this.directionTime>0?Math.min(1,this.directionTime*3):0);if(this.bearing!==undefined)this.arrow.style.transform=`translateX(-50%) rotate(${this.bearing+this.game.movement.yaw}rad)`;this.notice.style.opacity=this.noticeTime>0?'1':'0';}
 hide(){this.el.style.opacity='0';this.notice.style.opacity='0';}
}
