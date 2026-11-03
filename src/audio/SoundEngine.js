// Web Audio engine: recorded boot footsteps and procedural combat effects.
import { CombatAudio } from './CombatAudio.js';

class SoundEngine {
    constructor() {
        this.ctx = null;
        this.masterGain = null;
        this.isMuted = false;
        this.initialized = false;
        this.combat = new CombatAudio(this);
    }

    init() {
        if (this.initialized) return;
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) return;

        this.ctx = new AudioContextClass();
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = 0.5;
        this.limiter=this.ctx.createDynamicsCompressor();
        this.limiter.threshold.value=-10;this.limiter.knee.value=6;this.limiter.ratio.value=6;
        this.limiter.attack.value=.003;this.limiter.release.value=.15;
        this.masterGain.connect(this.limiter);this.limiter.connect(this.ctx.destination);
        this.initialized = true;
        this.loadFootsteps();
        this.combat.load();

        if (this.ctx.state === 'suspended') {
            const resumeAudio = () => {
                if (this.ctx && this.ctx.state === 'suspended') {
                    this.ctx.resume();
                }
                window.removeEventListener('click', resumeAudio);
                window.removeEventListener('keydown', resumeAudio);
            };
            window.addEventListener('click', resumeAudio);
            window.addEventListener('keydown', resumeAudio);
        }
    }

    ensureContext() {
        if (!this.initialized) this.init();
        if (this.ctx && this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    }

    playUtility(kind,position=null) {
        const key={bounce:'grenadeBounce',pin:'pin',throw:'throw',frag:'frag',smoke:'smoke'}[kind];
        if(key&&this.playSample(key,{volume:kind==='frag'?.8:kind==='smoke'?.45:.3,position}))return;
        this.ensureContext();
        if (!this.ctx) return;
        const now = this.ctx.currentTime;
        const duration = kind === 'frag' ? 0.6 : kind === 'smoke' ? 0.7 : kind === 'flash' ? 0.35 : 0.06;
        const buffer = this.ctx.createBuffer(1, Math.ceil(this.ctx.sampleRate * duration), this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * Math.exp(-i / data.length * 5);
        const source = this.ctx.createBufferSource(); source.buffer = buffer;
        const filter = this.ctx.createBiquadFilter();
        filter.type = kind === 'flash' ? 'highpass' : 'lowpass';
        filter.frequency.value = kind === 'frag' ? 650 : kind === 'flash' ? 1600 : 2200;
        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(kind === 'frag' ? 0.8 : kind === 'flash' ? 0.3 : kind === 'smoke' ? 0.15 : 0.08, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
        source.connect(filter); filter.connect(gain); gain.connect(this.masterGain); source.start(now);
    }

    playPistolShot() {
        if(this.playSample('pistolShot',{volume:.7,group:'shots'})){this.playSample('casing',{volume:.09,delay:.22,group:'weapon'});return;}
        this.ensureContext();
        if (!this.ctx) return;
        const now = this.ctx.currentTime;
        this.playUtility('pistol');
        const oscillator = this.ctx.createOscillator(), gain = this.ctx.createGain();
        oscillator.frequency.setValueAtTime(180, now);
        oscillator.frequency.exponentialRampToValueAtTime(55, now + 0.1);
        gain.gain.setValueAtTime(0.4, now); gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
        oscillator.connect(gain); gain.connect(this.masterGain); oscillator.start(now); oscillator.stop(now + 0.13);
    }

    // Heavy Sniper Rifle Shot (.338 Lapua / .50 Caliber Crack)
    playSniperShot() {
        if(this.playSample('sniperShot',{volume:.9,group:'shots'}))return;
        this.ensureContext();
        if (!this.ctx) return;
        const now = this.ctx.currentTime;

        // 1. Transient supersonic crack (Noise spike)
        const noiseBuf = this.ctx.createBuffer(1, Math.floor(this.ctx.sampleRate * 0.3), this.ctx.sampleRate);
        const noiseData = noiseBuf.getChannelData(0);
        for (let i = 0; i < noiseData.length; i++) {
            noiseData[i] = (Math.random() * 2 - 1) * Math.exp(-i / (this.ctx.sampleRate * 0.04));
        }
        const noiseSrc = this.ctx.createBufferSource();
        noiseSrc.buffer = noiseBuf;

        const noiseFilter = this.ctx.createBiquadFilter();
        noiseFilter.type = 'bandpass';
        noiseFilter.frequency.setValueAtTime(3200, now);
        noiseFilter.frequency.exponentialRampToValueAtTime(800, now + 0.15);
        noiseFilter.Q.value = 2.0;

        const noiseGain = this.ctx.createGain();
        noiseGain.gain.setValueAtTime(1.0, now);
        noiseGain.gain.exponentialRampToValueAtTime(0.01, now + 0.25);

        noiseSrc.connect(noiseFilter);
        noiseFilter.connect(noiseGain);
        noiseGain.connect(this.masterGain);
        noiseSrc.start(now);

        // 2. Sub-bass Chest Punch (55Hz -> 20Hz drop)
        const subOsc = this.ctx.createOscillator();
        const subGain = this.ctx.createGain();
        subOsc.type = 'sine';
        subOsc.frequency.setValueAtTime(120, now);
        subOsc.frequency.exponentialRampToValueAtTime(30, now + 0.35);

        subGain.gain.setValueAtTime(1.2, now);
        subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

        subOsc.connect(subGain);
        subGain.connect(this.masterGain);
        subOsc.start(now);
        subOsc.stop(now + 0.45);

        // 3. Metallic Barrel Resonance
        const metalOsc = this.ctx.createOscillator();
        const metalGain = this.ctx.createGain();
        metalOsc.type = 'triangle';
        metalOsc.frequency.setValueAtTime(640, now);
        metalOsc.frequency.exponentialRampToValueAtTime(180, now + 0.2);

        metalGain.gain.setValueAtTime(0.4, now);
        metalGain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

        metalOsc.connect(metalGain);
        metalGain.connect(this.masterGain);
        metalOsc.start(now);
        metalOsc.stop(now + 0.22);
    }

    // Bolt-action Cycling Sounds
    playBoltCycle() {
        if(this.playSample('sniperBolt',{volume:.4,delay:.28,group:'weapon'})) {this.playSample('casing',{volume:.13,delay:.4,group:'weapon'});return;}
        this.ensureContext();
        if (!this.ctx) return;
        const now = this.ctx.currentTime;

        // Bolt unlock & pull back (t + 0.15s)
        setTimeout(() => this.playMechanicalClick(950, 0.05, 0.3), 150);
        setTimeout(() => this.playMechanicalClick(1400, 0.04, 0.25), 250);

        // Brass casing eject ping (t + 0.4s)
        setTimeout(() => {
            this.playCasingPing();
        }, 400);

        // Bolt push forward & lock into battery (t + 0.7s)
        setTimeout(() => this.playMechanicalClick(1200, 0.06, 0.35), 700);
        setTimeout(() => this.playMechanicalClick(750, 0.08, 0.4), 820);
    }

    playMechanicalClick(freq, duration, volume) {
        if (!this.ctx) return;
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(freq, now);
        osc.frequency.exponentialRampToValueAtTime(freq * 0.5, now + duration);

        gain.gain.setValueAtTime(volume, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

        osc.connect(gain);
        gain.connect(this.masterGain);
        osc.start(now);
        osc.stop(now + duration + 0.01);
    }

    playCasingPing() {
        if(this.playSample('casing',{volume:.15}))return;
        if (!this.ctx) return;
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(3400 + Math.random() * 400, now);
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

        osc.connect(gain);
        gain.connect(this.masterGain);
        osc.start(now);
        osc.stop(now + 0.16);
    }

    // Call of Duty Style Hitmarkers
    playHitmarker(isHeadshot = false) {
        if(this.playSample(isHeadshot?'headshot':'hit',{volume:isHeadshot?.3:.22}))return;
        this.ensureContext();
        if (!this.ctx) return;
        const now = this.ctx.currentTime;

        if (isHeadshot) {
            // Iconic Headshot Ding (resonant dual-harmonic bell)
            const osc1 = this.ctx.createOscillator();
            const osc2 = this.ctx.createOscillator();
            const gain = this.ctx.createGain();

            osc1.type = 'sine';
            osc1.frequency.setValueAtTime(1760, now); // A6 note
            osc2.type = 'sine';
            osc2.frequency.setValueAtTime(3520, now); // A7 harmonic

            gain.gain.setValueAtTime(0.6, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

            osc1.connect(gain);
            osc2.connect(gain);
            gain.connect(this.masterGain);

            osc1.start(now);
            osc2.start(now);
            osc1.stop(now + 0.48);
            osc2.stop(now + 0.48);
        } else {
            // Body Hitmarker Double-Tick
            for (let i = 0; i < 2; i++) {
                const t = now + i * 0.025;
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(2600, t);
                osc.frequency.exponentialRampToValueAtTime(1400, t + 0.02);

                gain.gain.setValueAtTime(0.5, t);
                gain.gain.exponentialRampToValueAtTime(0.001, t + 0.025);

                osc.connect(gain);
                gain.connect(this.masterGain);
                osc.start(t);
                osc.stop(t + 0.03);
            }
        }
    }

    // Footsteps: short boot scuff plus a low body thump. Slow walking is almost inaudible.
    async loadFootsteps() {
        if(this.footstepLoading)return this.footstepLoading;
        this.footstepLoading=fetch('/assets/audio/footsteps/samples.json').then(async response=>{
            if(!response.ok)throw new Error('Footstep sample unavailable');
            const pack=await response.json();
            return Promise.all(pack.samples.map(async encoded=>{
            const bytes=Uint8Array.from(atob(encoded),c=>c.charCodeAt(0));
            const buffer=await this.ctx.decodeAudioData(bytes.buffer);
            // Trim leading silence so sample onset coincides with the contact event.
            let start=buffer.length;for(let channel=0;channel<buffer.numberOfChannels;channel++){
                const data=buffer.getChannelData(channel);let peak=0;for(const n of data)peak=Math.max(peak,Math.abs(n));
                const first=data.findIndex(n=>Math.abs(n)>peak*.025);if(first>=0)start=Math.min(start,first);
            }
            return {buffer,offset:Math.max(0,start-16)/buffer.sampleRate};
            }));
        }).then(samples=>{this.footstepSamples=samples;return samples;}).catch(()=>null);
        return this.footstepLoading;
    }
    playFootstep(kind = 'run',side='Left') {
        this.ensureContext();
        if (!this.ctx || this.isMuted) return;
        if(this.footstepSamples?.length){
            const count=this.footstepSamples.length;
            const index=((this.lastFootstepSample??-1)+1+Math.floor(Math.random()*(count-1)))%count;
            this.lastFootstepSample=index;
            const sample=this.footstepSamples[index],source=this.ctx.createBufferSource(),gain=this.ctx.createGain();
            source.buffer=sample.buffer;source.playbackRate.value=.97+Math.random()*.06;
            gain.gain.value={sprint:.85,run:.55,walk:.18,crouch:.09,crouchRun:.23}[kind]??.55;
            const pan=this.ctx.createStereoPanner();pan.pan.value=side==='Left'?-.08:.08;
            source.connect(gain);gain.connect(pan);pan.connect(this.masterGain);
            source.onended=()=>{source.disconnect();gain.disconnect();pan.disconnect();};
            source.start(this.ctx.currentTime,sample.offset);return;
        }
        const level = { sprint: 0.5, run: 0.3, walk: 0.1 }[kind] ?? 0.3;
        if (level <= 0) return;
        const now = this.ctx.currentTime;
        const duration = kind === 'sprint' ? 0.13 : 0.11;

        const buffer = this.ctx.createBuffer(1, Math.floor(this.ctx.sampleRate * duration), this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < data.length; i++) {
            data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (this.ctx.sampleRate * 0.022));
        }

        const source = this.ctx.createBufferSource();
        source.buffer = buffer;

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(kind === 'sprint' ? 1500 : 950, now);

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(level, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

        source.connect(filter);
        filter.connect(gain);
        gain.connect(this.masterGain);
        source.start(now);

        const thump = this.ctx.createOscillator();
        const thumpGain = this.ctx.createGain();
        thump.type = 'sine';
        thump.frequency.setValueAtTime(kind === 'sprint' ? 95 : 72, now);
        thump.frequency.exponentialRampToValueAtTime(38, now + 0.09);
        thumpGain.gain.setValueAtTime(level * 0.6, now);
        thumpGain.gain.exponentialRampToValueAtTime(0.001, now + 0.11);

        thump.connect(thumpGain);
        thumpGain.connect(this.masterGain);
        thump.start(now);
        thump.stop(now + 0.12);
    }

    playWaterImpact(strength=34) {
        if(typeof window==='undefined')return;
        this.ensureContext();if(!this.ctx||this.isMuted)return;
        const now=this.ctx.currentTime,duration=.24;
        if(!this.waterNoise){this.waterNoise=this.ctx.createBuffer(1,Math.floor(this.ctx.sampleRate*duration),this.ctx.sampleRate);const samples=this.waterNoise.getChannelData(0);for(let i=0;i<samples.length;i++)samples[i]=(Math.random()*2-1)*(.55+.45*Math.sin(i*.07));}
        const source=this.ctx.createBufferSource(),filter=this.ctx.createBiquadFilter(),gain=this.ctx.createGain();source.buffer=this.waterNoise;filter.type='lowpass';filter.frequency.setValueAtTime(1800,now);filter.frequency.exponentialRampToValueAtTime(240,now+duration);gain.gain.setValueAtTime(Math.min(.3,.05+Math.sqrt(strength)*.015),now);gain.gain.exponentialRampToValueAtTime(.001,now+duration);source.connect(filter);filter.connect(gain);gain.connect(this.masterGain);source.onended=()=>{source.disconnect();filter.disconnect();gain.disconnect();};source.start(now);
    }

    // Wooden door impact: dry splintering thud.
    playWoodHit() {
        this.ensureContext();
        if (!this.ctx) return;
        const now = this.ctx.currentTime;
        const buffer = this.ctx.createBuffer(1, Math.floor(this.ctx.sampleRate * 0.16), this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < data.length; i++) {
            data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (this.ctx.sampleRate * 0.035));
        }
        const source = this.ctx.createBufferSource();
        source.buffer = buffer;

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(1150, now);
        filter.frequency.exponentialRampToValueAtTime(420, now + 0.12);
        filter.Q.value = 1.2;

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.4, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);

        source.connect(filter);
        filter.connect(gain);
        gain.connect(this.masterGain);
        source.start(now);

        const thump = this.ctx.createOscillator();
        const thumpGain = this.ctx.createGain();
        thump.type = 'sine';
        thump.frequency.setValueAtTime(120, now);
        thump.frequency.exponentialRampToValueAtTime(55, now + 0.12);
        thumpGain.gain.setValueAtTime(0.35, now);
        thumpGain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
        thump.connect(thumpGain);
        thumpGain.connect(this.masterGain);
        thump.start(now);
        thump.stop(now + 0.15);
    }

    // Shattering pane: bright noise burst with a few falling glass pings.
    playGlassBreak() {
        if(this.playSample('glassBreak',{volume:.6}))return;
        this.ensureContext();
        if (!this.ctx) return;
        const now = this.ctx.currentTime;
        const buffer = this.ctx.createBuffer(1, Math.floor(this.ctx.sampleRate * 0.45), this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < data.length; i++) {
            const envelope = Math.exp(-i / (this.ctx.sampleRate * 0.09));
            data[i] = (Math.random() * 2 - 1) * envelope;
        }
        const source = this.ctx.createBufferSource();
        source.buffer = buffer;

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'highpass';
        filter.frequency.setValueAtTime(2200, now);

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.55, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

        source.connect(filter);
        filter.connect(gain);
        gain.connect(this.masterGain);
        source.start(now);

        for (let i = 0; i < 5; i++) {
            const t = now + 0.03 + i * 0.045;
            const ping = this.ctx.createOscillator();
            const pingGain = this.ctx.createGain();
            ping.type = 'sine';
            ping.frequency.setValueAtTime(2400 + Math.random() * 1800, t);
            pingGain.gain.setValueAtTime(0.11, t);
            pingGain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
            ping.connect(pingGain);
            pingGain.connect(this.masterGain);
            ping.start(t);
            ping.stop(t + 0.13);
        }
    }

    playDoorBreak() {
        this.ensureContext();
        if (!this.ctx) return;
        this.playWoodHit();
        setTimeout(() => this.playWoodHit(), 90);
        setTimeout(() => this.playWoodHit(), 180);
    }

    playDoorOpen() {
        if(this.playSample('door',{volume:.4}))return;
        this.ensureContext();
        if (!this.ctx) return;
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(160, now);
        osc.frequency.exponentialRampToValueAtTime(90, now + 0.28);
        gain.gain.setValueAtTime(0.08, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
        osc.connect(gain);
        gain.connect(this.masterGain);
        osc.start(now);
        osc.stop(now + 0.31);
    }

    // Fast Tactical Movement Audio
    playSlide() {
        this.ensureContext();
        if (!this.ctx) return;
        const now = this.ctx.currentTime;

        const dur = 0.55;
        const buf = this.ctx.createBuffer(1, Math.floor(this.ctx.sampleRate * dur), this.ctx.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < d.length; i++) {
            d[i] = (Math.random() * 2 - 1) * Math.sin((i / d.length) * Math.PI);
        }

        const src = this.ctx.createBufferSource();
        src.buffer = buf;

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(650, now);
        filter.frequency.exponentialRampToValueAtTime(220, now + dur);
        filter.Q.value = 1.2;

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.35, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + dur);

        src.connect(filter);
        filter.connect(gain);
        gain.connect(this.masterGain);
        src.start(now);
    }

    playJump() {
        this.ensureContext();
        if (!this.ctx) return;
        const now = this.ctx.currentTime;

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(160, now);
        osc.frequency.exponentialRampToValueAtTime(320, now + 0.08);

        gain.gain.setValueAtTime(0.18, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);

        osc.connect(gain);
        gain.connect(this.masterGain);
        osc.start(now);
        osc.stop(now + 0.1);
    }

    playLand() {
        if(this.playSample('land',{volume:.25}))return;
        this.ensureContext();
        if (!this.ctx) return;
        const now = this.ctx.currentTime;

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(95, now);
        osc.frequency.exponentialRampToValueAtTime(35, now + 0.12);

        gain.gain.setValueAtTime(0.4, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);

        osc.connect(gain);
        gain.connect(this.masterGain);
        osc.start(now);
        osc.stop(now + 0.15);
    }

    playJumpPad() {
        this.ensureContext();
        if (!this.ctx) return;
        const now = this.ctx.currentTime;

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(220, now);
        osc.frequency.exponentialRampToValueAtTime(880, now + 0.22);

        gain.gain.setValueAtTime(0.5, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.25);

        osc.connect(gain);
        gain.connect(this.masterGain);
        osc.start(now);
        osc.stop(now + 0.26);
    }

    playKill() {
        this.ensureContext();
        if (!this.ctx) return;
        const now = this.ctx.currentTime;

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(110, now);
        osc.frequency.exponentialRampToValueAtTime(45, now + 0.3);

        gain.gain.setValueAtTime(0.5, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.35);

        osc.connect(gain);
        gain.connect(this.masterGain);
        osc.start(now);
        osc.stop(now + 0.36);
    }

    playReload(slot='primary',duration=1.3,timing=null) {
        const pistol=slot==='pistol',prefix=pistol?'pistol':'sniper';
        if(this.playSample(prefix+'MagOut',{volume:.35,group:'reload'})){
            this.playSample(prefix+'MagIn',{volume:.42,delay:Math.max(0,timing?.insert??duration*.58),group:'reload'});
            this.playSample(pistol?'pistolSlide':'sniperBolt',{volume:.38,delay:Math.max(0,timing?.slide??duration*.82),group:'reload'});return;
        }
        this.ensureContext();
        if (!this.ctx) return;
        setTimeout(() => this.playMechanicalClick(600, 0.08, 0.3), 100); // Mag release
        setTimeout(() => this.playMechanicalClick(1100, 0.06, 0.35), 700); // New mag in
        setTimeout(() => this.playMechanicalClick(1500, 0.08, 0.4), 1100); // Bolt slap
    }

    playScopeZoom(inOut = true) {
        if(this.playSample('scope',{volume:.12,rate:inOut?1:1.1}))return;
        this.ensureContext();
        if (!this.ctx) return;
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(inOut ? 300 : 500, now);
        osc.frequency.exponentialRampToValueAtTime(inOut ? 650 : 250, now + 0.09);

        gain.gain.setValueAtTime(0.08, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

        osc.connect(gain);
        gain.connect(this.masterGain);
        osc.start(now);
        osc.stop(now + 0.11);
    }
    playSample(key,options) {
        if(this.isMuted)return true;
        // Keep server/unit-test environments inert, while browser calls initialize on demand.
        if(!this.ctx && typeof window!=='undefined' && (window.AudioContext||window.webkitAudioContext))this.ensureContext();
        return this.combat.play(key,options);
    }
    stopWeaponSounds() { this.combat.stop('reload');this.combat.stop('weapon'); }
    playDraw(slot) { this.playSample(slot==='pistol'?'pistolSlide':'sniperDraw',{volume:.26,group:'weapon'}); }
    playDryFire() { this.playSample('dryFire',{volume:.3}); }
    playImpact(position) { this.playSample('impact',{volume:.25,rate:.95+Math.random()*.1,position}); }
    playPain(position) { this.playSample(['pain1','pain2','pain3'][Math.floor(Math.random()*3)],{volume:.35,position}); }
    playDeath(position) { this.playSample(Math.random()<.5?'death1':'death2',{volume:.4,position}); }
}

export const soundEngine = new SoundEngine();

