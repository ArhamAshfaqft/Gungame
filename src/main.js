import { updateShadowCache } from './environment/ShadowCache.js';
import { warmDestruction } from './environment/DestructionWarmup.js';
import * as THREE from 'three';
import { VillaMap } from './world/VillaMap.js';
import { Arena } from './world/Arena.js';
import { TrainingRoom } from './world/TrainingRoom.js';
import { MovementController } from './player/MovementController.js';
import { SniperWeapon } from './weapons/SniperWeapon.js';
import { Throwables } from './weapons/Throwables.js';
import { BotManager } from './bots/BotManager.js';
import { HUD } from './ui/HUD.js';
import { Settings } from './ui/Settings.js';
import { soundEngine } from './audio/SoundEngine.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { ThirdPersonView } from './player/ThirdPersonView.js';
import { connectGamePoseSync } from './studio/PoseSync.js';
import {EffectComposer} from 'three/examples/jsm/postprocessing/EffectComposer.js';
import {RenderPass} from 'three/examples/jsm/postprocessing/RenderPass.js';
import {SSAOPass} from 'three/examples/jsm/postprocessing/SSAOPass.js';
import {OutputPass} from 'three/examples/jsm/postprocessing/OutputPass.js';
import { SurfaceDamage } from './world/SurfaceDamage.js';

class FastSnipeGame {
    constructor() {
        this.canvas = document.getElementById('game-canvas');
        this.startScreen = document.getElementById('start-screen');
        this.btnPlay = document.getElementById('btn-play');

        this.initThree();
        this.initGame();
        this.initEvents();

        this.clock = new THREE.Clock();
        this.animate = this.animate.bind(this);
        requestAnimationFrame(this.animate);
    }

    initThree() {
        // Renderer
        this.renderer = new THREE.WebGLRenderer({
            canvas: this.canvas,
            antialias: true,
            powerPreference: 'high-performance'
        });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.25));
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        // Only arena geometry casts shadows. Its shadow map does not need rebuilding per frame.
        this.renderer.shadowMap.autoUpdate = false;
        this.renderer.shadowMap.needsUpdate = true;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.0;

        // Scene
        this.scene = new THREE.Scene();

        // Camera
        this.camera = new THREE.PerspectiveCamera(85, window.innerWidth / window.innerHeight, 0.02, 500);
    }

    initGame() {
        // 1. World & Lighting
        this.mapId=new URLSearchParams(window.location.search).get('map')==='training'?'training':'villa';
        if(this.mapId==='villa'){this.arena=new VillaMap(this.scene);this.room=this.arena;}else{
        this.arena = new Arena(this.scene);
        this.room = new TrainingRoom(this.scene, this.arena.colliders, {
            concreteColor: this.arena.concreteColor,
            concreteNormal: this.arena.concreteNormal
        });

        }

        // 2. Player Movement
        this.movement = new MovementController(this.camera, this.canvas);
        if(this.arena.spawn){this.movement.spawnPosition=this.arena.spawn.clone();this.movement.spawnYaw=this.arena.spawnYaw;this.movement.position.copy(this.arena.spawn).add(new THREE.Vector3(0,this.movement.standHeight,0));this.movement.yaw=this.arena.spawnYaw;this.camera.position.copy(this.movement.position);this.camera.rotation.y=this.movement.yaw;}
        const subtitle=document.querySelector('.subtitle');if(subtitle)subtitle.textContent=this.mapId==='villa'?'VILLA SOLSTICE // COASTAL RESIDENCE · THREE LEVELS':'TRAINING // TACTICAL BREACHING RANGE';
        const mapNav=document.createElement('nav');mapNav.className='map-select';mapNav.setAttribute('aria-label','Select map');mapNav.innerHTML=`<a href="/?map=villa" class="${this.mapId==='villa'?'active':''}"><b>VILLA SOLSTICE</b><span>Flagship · Residence / Terrace / Basement</span></a><a href="/?map=training" class="${this.mapId==='training'?'active':''}"><b>TRAINING RANGE</b><span>Practice · Weapons / Movement / Destruction</span></a>`;subtitle?.after(mapNav);
        if(this.mapId==='villa'){const brief=document.createElement('p');brief.className='map-brief';brief.textContent='20 connected spaces / Wellness pavilion, gallery and winter garden / Breachable plaster, timber floors and glazing';mapNav.after(brief);}
        this.locationLabel=document.createElement('div');this.locationLabel.id='map-location';document.getElementById('hud').append(this.locationLabel);

        // 3. Sniper Viewmodel & Gunplay
        this.weapon = new SniperWeapon(this.scene, this.camera, this.movement);
        this.surfaceDamage=new SurfaceDamage(this.scene,this.arena.colliders,{retainMarks:this.arena.id==='villa'});this.weapon.surfaceDamage=this.surfaceDamage;this.arena.surfaceDamage=this.surfaceDamage;
        this.poseSync=connectGamePoseSync(this.weapon);
        const environment = new RoomEnvironment();
        const pmrem = new THREE.PMREMGenerator(this.renderer);
        this.weaponEnvironment = pmrem.fromScene(environment, 0.04);
        this.weapon.viewmodelScene.environment = this.weaponEnvironment.texture;
        this.weapon.viewmodelScene.environmentIntensity = 0.65;
        if(this.mapId==='villa'){this.scene.environment=this.weaponEnvironment.texture;this.scene.environmentIntensity=.18;}
        environment.dispose();
        pmrem.dispose();

        if(this.mapId==='villa'){
            const target=new THREE.WebGLRenderTarget(window.innerWidth,window.innerHeight,{type:THREE.HalfFloatType,samples:2});
            this.composer=new EffectComposer(this.renderer,target);
            this.worldPass=new RenderPass(this.scene,this.camera);this.composer.addPass(this.worldPass);
            this.ambientOcclusion=new SSAOPass(this.scene,this.camera,window.innerWidth,window.innerHeight,12);
            this.ambientOcclusion.kernelRadius=.6;this.ambientOcclusion.minDistance=.0003;this.ambientOcclusion.maxDistance=.025;
            this.composer.addPass(this.ambientOcclusion);this.composer.addPass(new OutputPass());
            this.resizeEffects();
        }

        // 4. Enemy Bots
        this.botManager = new BotManager(this.scene, this.arena.colliders,{spawnPoints:this.arena.botSpawns,persistDeaths:this.arena.id==='villa'});
        if(this.arena.id==='villa'){
            const reset=document.createElement('button');reset.id='reset-villa';reset.textContent='RESET VILLA / NEW ROUND';
            reset.title='Restore the villa, clear bodies and rubble, and respawn opponents. Saved studio poses are kept.';
            reset.addEventListener('click',()=>window.location.reload());this.btnPlay.after(reset);
        }
        this.equipment = new Throwables(this.scene, this.camera, this.movement, this.weapon, {
            colliders: this.arena.colliders, room: this.room, bots: this.botManager,
        });

        // 5. HUD & UI
        this.hud = new HUD();
        this.settings = new Settings(this.movement);
        this.thirdPerson = new ThirdPersonView(this.scene,this.camera,this.movement,this.weapon,this.equipment,this.arena.colliders);
        this.viewButton = document.createElement('button'); this.viewButton.id = 'camera-toggle';
        this.viewButton.textContent = 'Loading characterâ€¦'; this.viewButton.disabled = true;
        document.body.append(this.viewButton);
        this.viewButton.onclick = () => { this.toggleView(); this.viewButton.blur(); };
        if(this.mapId==='villa'){
            this.graphicsWarming=true;this.btnPlay.disabled=true;const label=this.btnPlay.textContent;this.btnPlay.textContent='PREPARING DESTRUCTIONâ€¦';
            this.graphicsReady=warmDestruction(this).then(result=>{this.graphicsWarmup=result;}).catch(error=>{console.error('Destruction preparation failed.',error);}).finally(()=>{this.graphicsWarming=false;this.btnPlay.disabled=false;this.btnPlay.textContent=label;});
        }
        this.thirdPerson.ready.then(() => { this.viewButton.disabled = false; this.viewButton.textContent = 'V Â· Third person'; }).catch(error => { console.error('Player character failed to load.',error); this.viewButton.textContent = 'Character unavailable'; });
    }

    resizeEffects(){
        if(!this.composer)return;
        this.composer.setSize(window.innerWidth,window.innerHeight);
        this.ambientOcclusion.setSize(Math.max(1,Math.floor(window.innerWidth*.65)),Math.max(1,Math.floor(window.innerHeight*.65)));
    }

    initEvents() {
        let lastHover=0;
        document.addEventListener('pointerover',event=>{
            if(!soundEngine.initialized || !event.target.closest('button') || performance.now()-lastHover<100)return;
            lastHover=performance.now();soundEngine.playSample('uiHover',{volume:.12,group:'ui'});
        });
        // Window Resize
        window.addEventListener('resize', () => {
            this.camera.aspect = window.innerWidth / window.innerHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(window.innerWidth, window.innerHeight);
            this.resizeEffects();
            this.weapon.viewmodelCamera.aspect = this.camera.aspect;
            this.weapon.viewmodelCamera.updateProjectionMatrix();
        });

        // Start / Resume button
        this.btnPlay.addEventListener('click', () => {
            soundEngine.init();
            this.canvas.requestPointerLock();
        });

        // Training-room door
        window.addEventListener('keydown', (event) => {
            if (event.code === 'KeyF' && this.movement.isLocked) {
                this.room.interact(this.movement.position);
            }
            if (event.code === 'KeyV' && this.movement.isLocked && !event.repeat) { event.preventDefault(); this.toggleView(); }
        });

        // Pointer Lock State Changes
        document.addEventListener('pointerlockchange', () => {
            if (document.pointerLockElement === this.canvas) {
                this.startScreen.classList.add('hidden');
            } else {
                this.startScreen.classList.remove('hidden');
                this.btnPlay.textContent = 'RESUME MATCH';
            }
        });
    }

    toggleView() {
        if (!this.thirdPerson.toggle()) return;
        this.viewButton.textContent = this.thirdPerson.enabled ? 'V Â· First person' : 'V Â· Third person';
        this.viewButton.setAttribute('aria-pressed',String(this.thirdPerson.enabled));
        this.thirdPerson.update(0);
    }

    animate() {
        requestAnimationFrame(this.animate);
        if(this.graphicsWarming)return;

        const delta = Math.min(this.clock.getDelta(), 0.08);

        // Update systems
        if (this.movement.isLocked) {
            soundEngine.combat.listener={position:this.movement.position,yaw:this.movement.yaw};
            if (!this.movement.isDisabled) this.movement.update(delta, this.arena.colliders, this.arena.jumpPads);
            this.equipment.update(delta);
            this.weapon.update(delta);
            this.room.update(delta, this.movement.position,{height:this.movement.currentHeight,speed:this.movement.getSpeed()});
            this.surfaceDamage.update(delta);
            this.botManager.update(delta, this.movement.position);
            this.hud.update(this.movement, this.weapon, this.room, this.equipment);
            this.locationLabel.textContent=this.arena.location?.(this.movement.position)||'Training range';
        }

        // Destruction and door movement invalidate cached shadows, not every gameplay frame.
        updateShadowCache(this.renderer,this.scene,this.room.shadowsDirty||this.surfaceDamage.shadowsDirty,this.room.motionShadowBounds);
        this.room.shadowsDirty=false;this.surfaceDamage.shadowsDirty=false;
        this.room.motionShadowBounds?.makeEmpty();

        this.thirdPerson.update(this.movement.isLocked ? delta : 0);
        // Render
        this.renderer.autoClear = true;
        const viewCamera=this.thirdPerson.enabled?this.thirdPerson.camera:this.camera;
        this.arena.prepareRender?.(viewCamera.position);
        if(this.composer){this.worldPass.camera=viewCamera;this.ambientOcclusion.camera=viewCamera;this.composer.render(delta);}else this.renderer.render(this.scene,viewCamera);
        this.renderer.autoClear = false;
        this.renderer.clearDepth();
        if (!this.thirdPerson.enabled) this.renderer.render(this.weapon.viewmodelScene, this.weapon.viewmodelCamera);
    }
}

// Boot game when DOM is loaded
window.addEventListener('DOMContentLoaded', () => {
    const game = new FastSnipeGame();
    if (import.meta.env.DEV) window.__fastSnipe = game;
});
