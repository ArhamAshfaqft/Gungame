// Only gameplay traffic is delayed. Probes always measure the real connection.
export class LatencyBalance{
 constructor(enabled=false){this.enabled=enabled;this.host=null;this.peers=new Map();this.queue=[];this.locked=false;this.addedRtt=0;this.target=0;this.serial=0;}
 join(id){this.host??=id;this.peers.set(id,{samples:[],pending:new Map()});}
 leave(id){this.peers.delete(id);this.queue=this.queue.filter(x=>x.id!==id);}
 probe(id,now){const p=this.peers.get(id);if(!p)return null;for(const [key,time] of p.pending)if(now-time>10000)p.pending.delete(key);const nonce=++this.serial;p.pending.set(nonce,now);return nonce;}
 reply(id,nonce,now){const p=this.peers.get(id),sent=p?.pending.get(nonce);if(sent===undefined)return;p.pending.delete(nonce);const rtt=now-sent;if(rtt<0||rtt>2000)return;p.samples.push(rtt);if(p.samples.length>12)p.samples.shift();if(this.enabled&&!this.locked&&this.peers.size>1&&[...this.peers.values()].every(x=>x.samples.length>=6)){const avg=p=>p.samples.reduce((a,b)=>a+b,0)/p.samples.length;this.target=Math.min(250,Math.max(...[...this.peers.entries()].filter(([id])=>id!==this.host).map(([,p])=>avg(p))));this.addedRtt=Math.max(0,Math.round(this.target-avg(this.peers.get(this.host))));this.locked=true;}}
 schedule(id,fn,now){const delay=this.enabled&&this.locked&&id===this.host?this.addedRtt/2:0;if(!delay){fn();return;}this.queue.push({id,fn,due:now+delay});}
 flush(now){const due=[],waiting=[];for(const x of this.queue)(x.due<=now?due:waiting).push(x);this.queue=waiting;for(const x of due)if(this.peers.has(x.id))x.fn();}
 stats(){return{enabled:this.enabled,locked:this.locked,host:this.host,addedRtt:this.addedRtt,target:this.target,peers:Object.fromEntries([...this.peers].map(([id,p])=>[id,p.samples.length?Math.round(p.samples.reduce((a,b)=>a+b,0)/p.samples.length):null]))};}
}
