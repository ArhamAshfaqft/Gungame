export class CombatAudio {
    constructor(engine) { this.engine=engine;this.buffers=new Map();this.active=new Set();this.limit=28; }
    async load() {
        if(this.loading)return this.loading;
        this.loading=fetch('/assets/audio/combat/samples.json').then(r=>{if(!r.ok)throw Error('Audio bank unavailable');return r.json();})
            .then(pack=>Promise.all(Object.entries(pack.samples).map(async([key,encoded])=>{
                try { const bytes=Uint8Array.from(atob(encoded),c=>c.charCodeAt(0));this.buffers.set(key,await this.engine.ctx.decodeAudioData(bytes.buffer)); } catch { /* individual cues retain synthesis fallback */ }
            }))).catch(()=>null);
        return this.loading;
    }
    play(key,{volume=.5,delay=0,rate=1,group='effects',duration=null,position=null}={}) {
        const {ctx,masterGain,isMuted}=this.engine,buffer=this.buffers.get(key);
        if(!ctx||isMuted||!buffer)return false;
        if(this.active.size>=this.limit){const oldest=[...this.active].find(v=>v.group==='effects');if(oldest){this.active.delete(oldest);oldest.source.stop();}else return true;}
        const source=ctx.createBufferSource(),gain=ctx.createGain();source.buffer=buffer;source.playbackRate.value=rate;
        const spatial=position&&this.listener?this.spatial(position):{volume:1,pan:0};
        gain.gain.value=volume*spatial.volume;source.connect(gain);
        let pan;if(spatial.pan){pan=ctx.createStereoPanner();pan.pan.value=spatial.pan;gain.connect(pan);pan.connect(masterGain);}else gain.connect(masterGain);
        const voice={source,group};this.active.add(voice);
        source.onended=()=>{this.active.delete(voice);source.disconnect();gain.disconnect();pan?.disconnect();};
        source.start(ctx.currentTime+Math.max(0,delay),0,duration??buffer.duration);return true;
    }
    spatial(position) {
        const dx=position.x-this.listener.position.x,dy=position.y-this.listener.position.y,dz=position.z-this.listener.position.z,distance=Math.hypot(dx,dy,dz);
        return {volume:1/(1+(distance/12)**2),pan:Math.max(-.8,Math.min(.8,(dx*Math.cos(this.listener.yaw)-dz*Math.sin(this.listener.yaw))/Math.max(1,distance)))};
    }
    stop(group) { for(const voice of this.active)if(voice.group===group){try{voice.source.stop();}catch{}this.active.delete(voice);} }
}
