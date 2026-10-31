import * as THREE from 'three';
import { Arena } from './world/Arena.js';
import { MovementController } from './player/MovementController.js';
import { SniperWeapon } from './weapons/SniperWeapon.js';
import { BotManager } from './bots/BotManager.js';
import { HUD } from './ui/HUD.js';
import { soundEngine } from './audio/SoundEngine.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

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
        this.arena = new Arena(this.scene);

        // 2. Player Movement
        this.movement = new MovementController(this.camera, this.canvas);

        // 3. Sniper Viewmodel & Gunplay
        this.weapon = new SniperWeapon(this.scene, this.camera, this.movement);
        const environment = new RoomEnvironment();
        const pmrem = new THREE.PMREMGenerator(this.renderer);
        this.weaponEnvironment = pmrem.fromScene(environment, 0.04);
        this.weapon.viewmodelScene.environment = this.weaponEnvironment.texture;
        this.weapon.viewmodelScene.environmentIntensity = 0.65;
        environment.dispose();
        pmrem.dispose();

        // 4. Enemy Bots
        this.botManager = new BotManager(this.scene, this.arena.colliders);

        // 5. HUD & UI
        this.hud = new HUD();
    }

    initEvents() {
        // Window Resize
        window.addEventListener('resize', () => {
            this.camera.aspect = window.innerWidth / window.innerHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(window.innerWidth, window.innerHeight);
            this.weapon.viewmodelCamera.aspect = this.camera.aspect;
            this.weapon.viewmodelCamera.updateProjectionMatrix();
        });

        // Start / Resume button
        this.btnPlay.addEventListener('click', () => {
            soundEngine.init();
            this.canvas.requestPointerLock();
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

    animate() {
        requestAnimationFrame(this.animate);

        const delta = Math.min(this.clock.getDelta(), 0.08);

        // Update systems
        if (this.movement.isLocked) {
            this.movement.update(delta, this.arena.colliders, this.arena.jumpPads);
            this.weapon.update(delta);
            this.botManager.update(delta, this.movement.position);
            this.hud.update(this.movement, this.weapon);
        }

        // Render
        this.renderer.autoClear = true;
        this.renderer.render(this.scene, this.camera);
        this.renderer.autoClear = false;
        this.renderer.clearDepth();
        this.renderer.render(this.weapon.viewmodelScene, this.weapon.viewmodelCamera);
    }
}

// Boot game when DOM is loaded
window.addEventListener('DOMContentLoaded', () => {
    const game = new FastSnipeGame();
    if (import.meta.env.DEV) window.__fastSnipe = game;
});
