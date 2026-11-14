// Play server timestamps on a continuous render clock; packet arrival jitter
// must not become animation speed changes. Extrapolation is tightly bounded.
export class RemoteTimeline{
 constructor(){this.samples=[];this.delay=120;this.playhead=null;}
 push(data,seconds,arrival=performance.now()){const time=seconds*1000,last=this.samples.at(-1);if(!Number.isFinite(time)||(last&&time<=last.at))return;const moved=last?Math.hypot(...data.movement.position.map((v,i)=>v-last.data.movement.position[i])):0;if(last&&(moved>6||(last.data.hp<=0)!==(data.hp<=0))){this.samples.length=0;this.playhead=null;}this.samples.push({at:time,arrival,data});if(this.samples.length>32)this.samples.shift();}
 sample(delta,now=performance.now()){const samples=this.samples;if(!samples.length)return null;const last=samples.at(-1),target=last.at+Math.max(0,now-last.arrival)-this.delay;if(this.playhead===null||Math.abs(target-this.playhead)>500)this.playhead=target;else{const dt=Math.max(0,Math.min(delta,.1))*1000;this.playhead+=Math.max(0,dt+Math.max(-dt*.15,Math.min(dt*.15,(target-this.playhead)*.08)));}this.playhead=Math.min(this.playhead,last.at+80);while(samples.length>2&&samples[1].at<=this.playhead)samples.shift();const a=samples[0],b=samples[1]||a,t=a===b?1:Math.max(0,Math.min(1,(this.playhead-a.at)/(b.at-a.at)));return{a:a.data,b:b.data,t,ahead:Math.max(0,Math.min(80,this.playhead-b.at))/1000};}
}
