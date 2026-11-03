import * as THREE from 'three';
import {projectileEnergy,transportEnergy} from '../world/PhysicalMaterials.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { soundEngine } from '../audio/SoundEngine.js';
import { createViewArms } from '../models/TacticalOperator.js';
import { createSwatRig } from '../models/SwatRig.js';
import { loadSniperModel } from '../models/SniperModel.js';
import { loadPistolModel } from '../models/PistolModel.js';
import { WEAPONS, createAmmoStores, environmentalDamage } from './WeaponProfiles.js';
import { readLibrary, blendPose, POSE_STORAGE_KEY, throwablePose, GRENADE_FRAME } from '../studio/PoseLibrary.js';
import { loadViewActions, sampleViewAction } from '../models/ViewActions.js';
import { applyPistolMechanics } from '../models/PistolReload.js';
import { sampleReloadSequence, addTimelinePose, applySequenceFraming, applySequenceMechanics, sequenceMotion } from '../studio/ReloadTimeline.js';

export class SniperWeapon {
    constructor(scene, camera, movement) {
        this.scene = scene;
        this.camera = camera;
        this.movement = movement;

        // A separate camera keeps weapon framing independent of world FOV and walls.
        this.weaponGroup = new THREE.Group();
        this.viewmodelScene = new THREE.Scene();
        this.viewmodelCamera = new THREE.PerspectiveCamera(62, camera.aspect, 0.01, 10);
        this.viewmodelScene.add(this.weaponGroup);

        // Dedicated viewmodel lighting
        this.setupViewmodelLighting();

        this.loader = new GLTFLoader();
        this.loader.setMeshoptDecoder(MeshoptDecoder);

        this.activeSlot = 'primary';
        this.poseLibrary = readLibrary();
        window.addEventListener('storage', event => {
            if (event.key === POSE_STORAGE_KEY || event.key === null) this.refreshSavedPoses();
        });
        this.ammoStores = createAmmoStores();
        this.switchTimer = 0;
        this.utilityTimer = 0;
        this.reloadRemaining = 0;
        this.boltDelay = 0;

        // Weapon States
        this.isAiming = false;
        this.adsProgress = 0; // 0 to 1
        this.adsSpeed = 8.5;
        this.pendingShotTime = 0;
        this.canShoot = true;
        this.fireCooldown = 0;

        this.isReloading = false;

        // Base Viewmodel Offsets (relative to camera)
        // Clean lower-right stance (classic COD / CS sniper viewmodel)
        this.hipPos = new THREE.Vector3(0.24, -0.21, -0.64);
        this.hipRot = new THREE.Euler(0.025, 0.035, -0.025);

        // ADS: aligned with optic lens
        this.adsPos = new THREE.Vector3(-0.016, -0.15, -0.46);
        this.adsRot = new THREE.Euler(0.0, 0.0, 0.0);

        this.currentPos = new THREE.Vector3().copy(this.hipPos);
        this.currentRot = new THREE.Euler().copy(this.hipRot);

        // Recoil Spring
        this.recoilPos = new THREE.Vector3();
        this.recoilRot = new THREE.Euler();
        this.recoilRecoverySpeed = 16.0;

        // Bolt Animation Phase (0 to 1)
        this.boltProgress = 0;
        this.boltActive = false;

        // Visual effects
        this.tracers = [];
        this.sparks = [];

        this.rifleModel = null;
        this.scopeModel = null;

        this.loadAssets();
        this.setupInput();
    }

    refreshSavedPoses() {
        const saved = readLibrary();
        if (JSON.stringify(saved) === JSON.stringify(this.poseLibrary)) return;
        this.poseLibrary = saved;
        this.poseRevision = (this.poseRevision || 0) + 1;
    }

    setupViewmodelLighting() {
        const key = new THREE.DirectionalLight(0xffe7c7, 3.2);
        key.position.set(-2, 3, 3);
        this.viewmodelScene.add(key);
        const rim = new THREE.DirectionalLight(0x8cb8df, 2);
        rim.position.set(3, 1, -2);
        this.viewmodelScene.add(rim);
        this.viewmodelScene.add(new THREE.HemisphereLight(0xb8ccdd, 0x34372c, 1.5));
    }

    get profile() { return WEAPONS[this.activeSlot]; }
    get fireRate() { return this.profile.interval; }
    get maxMag() { return this.profile.magazine; }
    get magAmmo() { return this.ammoStores[this.activeSlot].ammo; }
    set magAmmo(value) { this.ammoStores[this.activeSlot].ammo = value; }
    get reserveAmmo() { return this.ammoStores[this.activeSlot].reserve; }
    set reserveAmmo(value) { this.ammoStores[this.activeSlot].reserve = value; }
    get fireCooldown() { return this.ammoStores[this.activeSlot].cooldown; }
    set fireCooldown(value) { this.ammoStores[this.activeSlot].cooldown = value; }

    cancelReload() {
        soundEngine.stopWeaponSounds();
        this.reloadRemaining = 0;
        this.reloadProgress = 0;
        this.isReloading = false;
    }

    switchWeapon(slot) {
        if (this.grenadeEquipped && !this.equipment?.stow()) return false;
        if (!WEAPONS[slot] || slot === this.activeSlot || this.utilityTimer > 0 || this.movement.isDisabled) return false;
        this.cancelReload();
        this.pendingShotTime = 0;
        this.isAiming = false;
        this.boltActive = false;
        this.boltDelay = 0;
        this.activeSlot = slot;
        this.fireActionRemaining = 0;
        this.switchTimer = 0.28;
        this.canShoot = this.fireCooldown <= 0;
        this.movement.scopeFov = this.profile.aimFov;
        this.movement.requestWeaponReady?.();
        this.hipPos.fromArray(this.profile.hip);
        this.adsPos.fromArray(this.profile.aim);
        soundEngine.playDraw(slot);
        return true;
    }

    beginUtility() {
        if (this.utilityTimer > 0 || this.switchTimer > 0 || this.movement.isDisabled) return false;
        this.cancelReload();
        this.isAiming = false;
        this.pendingShotTime = 0;
        this.utilityTimer = 0.7;
        this.movement.isThrowing = true;
        this.movement.requestWeaponReady?.();
        return true;
    }

    get isAiming() { return this._isAiming || false; }
    set isAiming(value) {
        this._isAiming = !!value;
        this.movement.isAiming = this._isAiming;
        if (value) this.movement.requestWeaponReady?.();
    }

    get isReloading() { return this._isReloading || false; }
    set isReloading(value) {
        this._isReloading = !!value;
        this.movement.isReloading = this._isReloading;
        if (value) this.movement.requestWeaponReady?.();
    }

    async loadAssets() {
        try {
            this.rifleModel = await loadSniperModel();
            this.weaponGroup.add(this.rifleModel);
            this.pistolModel = await loadPistolModel();
            this.pistolModel.visible = false;
            this.weaponGroup.add(this.pistolModel);
            await this.loadHands();

        } catch (err) {
            console.error('Failed to load weapon assets, creating procedural placeholder:', err);
            this.createFallbackRifle();
        }
    }

    createFallbackRifle() {
        const group = new THREE.Group();
        group.scale.setScalar(1);
        const matBody = new THREE.MeshStandardMaterial({ color: 0x3a4250, metalness: 0.6, roughness: 0.4 });
        const matScope = new THREE.MeshStandardMaterial({ color: 0x1b2028, metalness: 0.75, roughness: 0.3 });

        // Barrel
        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.018, 0.9, 16), matBody);
        barrel.rotation.x = Math.PI / 2;
        barrel.position.set(0, 0, -0.6);
        group.add(barrel);

        // Receiver
        const body = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.09, 0.45), matBody);
        body.position.set(0, 0, -0.2);
        group.add(body);

        // Scope
        const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.3, 16), matScope);
        scope.rotation.x = Math.PI / 2;
        scope.position.set(0, 0.07, -0.2);
        group.add(scope);

        this.rifleModel = group;
        this.weaponGroup.add(this.rifleModel);
        this.arms = createViewArms();
        this.weaponGroup.add(this.arms);
    }

    async loadHands() {
        this.armsRig = await createSwatRig({ armsOnly: true });
        this.arms = this.armsRig.object;
        this.arms.position.set(-0.24, -1.65, 0.30);
        this.arms.rotation.y = Math.PI;
        this.weaponGroup.add(this.arms);
        try { this.viewActionPack = await loadViewActions(); }
        catch (error) { console.warn('Using procedural first-person actions.', error); }
        this.armsRig.updateView(0, this);
    }

    setupInput() {
        window.addEventListener('mousedown', (e) => {
            if (!this.movement.isLocked || this.grenadeEquipped) return;
            if (e.button === 0) {
                this.shoot();
            } else if (e.button === 2) {
                this.isAiming = true;
                soundEngine.playScopeZoom(true);
            }
        });

        window.addEventListener('mouseup', (e) => {
            if (this.grenadeEquipped) return;
            if (e.button === 2) {
                this.isAiming = false;
                soundEngine.playScopeZoom(false);
            }
        });

        window.addEventListener('contextmenu', (e) => e.preventDefault());

        const clearAim = () => { this.isAiming = false; this.pendingShotTime = 0; };
        window.addEventListener('focus', () => this.refreshSavedPoses());
        document.addEventListener('visibilitychange', () => { if (!document.hidden) this.refreshSavedPoses(); });
        window.addEventListener('blur', clearAim);
        document.addEventListener('pointerlockchange', () => {
            if (!this.movement.isLocked) clearAim();
            else this.refreshSavedPoses();
        });

        window.addEventListener('keydown', (e) => {
            if (!this.movement.isLocked || e.repeat || this.movement.isDisabled) return;
            if (e.code === 'Digit1') this.switchWeapon('primary');
            if (e.code === 'Digit2') this.switchWeapon('pistol');
            if (this.movement.isLocked && e.code === 'KeyR' && !this.isReloading && this.magAmmo < this.maxMag && this.reserveAmmo > 0) {
                this.reload();
            }
        });
    }

    shoot() {
        if (this.grenadeEquipped) return;
        if (this.movement.isDisabled || this.switchTimer > 0 || this.utilityTimer > 0 || !this.canShoot || this.fireCooldown > 0 || this.isReloading) return;
        if (this.movement.isSprinting || this.movement.isSliding || this.movement.sprintRecovery > 0) {
            if (this.movement.isSprinting || this.movement.isSliding) this.movement.requestWeaponReady?.();
            this.pendingShotTime = 0.4;
            return;
        }
        if (this.magAmmo <= 0) {
            soundEngine.playDryFire();
            this.fireCooldown=.2;
            this.reload();
            return;
        }

        this.pendingShotTime = 0;
        this.movement.sprintInterruptTimer = Math.max(this.movement.sprintInterruptTimer || 0, 0.25);
        this.magAmmo--;
        this.canShoot = false;
        this.fireCooldown = this.fireRate;
        this.fireActionRemaining = this.activeSlot === 'pistol' ? 0.18 : 0.65;

        // 1. Play Heavy Sniper Crack Audio
        if (this.activeSlot === 'pistol') soundEngine.playPistolShot();
        else { soundEngine.playSniperShot(); soundEngine.playBoltCycle(); }
        const recoil = this.profile.recoil;

        // 2. Heavy Recoil Impulse
        this.recoilPos.z += 0.06 * recoil;
        this.recoilPos.y += 0.015 * recoil;
        this.recoilRot.x += 0.16 * recoil;
        this.recoilRot.y += (Math.random() - 0.5) * 0.02;
        this.recoilRot.z += (Math.random() - 0.5) * 0.03;

        // Camera kick
        this.movement.pitch += 0.045 * recoil;
        this.movement.yaw += (Math.random() - 0.5) * 0.012;

        // 3. Raycast Hitscan
        this.performRaycast();

        if (this.activeSlot === 'primary') this.boltDelay = 0.28;
    }

    reload() {
        if (this.grenadeEquipped) return;
        if (this.isReloading || this.utilityTimer > 0 || this.switchTimer > 0 || this.magAmmo === this.maxMag || this.reserveAmmo <= 0) return;
        this.isReloading = true;
        this.pendingShotTime = 0;
        this.reloadProgress = 0;
        this.reloadSequence = this.activeSlot === 'pistol' ? structuredClone(this.poseLibrary.reloadSequence) : null;
        this.reloadDuration = this.reloadSequence?.duration || this.profile.reloadTime;
        this.reloadRemaining = this.reloadDuration;
        this.reloadEventsFired = new Set();
        this.isAiming = false;
        if (!this.reloadSequence) soundEngine.playReload(this.activeSlot,this.reloadDuration);
    }

    performRaycast() {
        const moving = this.movement.getSpeed?.() > 0.5;
        const hipSpread = this.movement.isCrouching ? 0.014 : moving ? 0.035 : 0.022;
        const aimSpread = moving ? 0.0012 : 0.00045;
        let spread = THREE.MathUtils.lerp(hipSpread, aimSpread, this.adsProgress);
        if (!this.movement.isGrounded) spread = Math.max(spread, 0.06);

        const spreadX = (Math.random() - 0.5) * spread;
        const spreadY = (Math.random() - 0.5) * spread;

        const raycaster = new THREE.Raycaster();
        raycaster.far = this.profile.range;
        this.scene.updateMatrixWorld(true);
        this.camera.updateMatrixWorld(true);
        raycaster.setFromCamera(new THREE.Vector2(spreadX, spreadY), this.camera);

        const shootables = [];
        this.scene.traverseVisible((obj) => {
            if (obj.isMesh && obj.userData.isShootable && (!obj.userData.bot || obj.userData.bot.isAlive)) {
                if (obj.isSkinnedMesh) {
                    // Reject characters away from the shot before CPU-skinning their bounds.
                    const center = obj.userData.bot?.position.clone().add(new THREE.Vector3(0, 0.9, 0));
                    if (center && raycaster.ray.distanceSqToPoint(center) > 2.25) return;
                    obj.skeleton.update();
                    obj.computeBoundingSphere();
                    obj.computeBoundingBox();
                }
                shootables.push(obj);
            }
        });

        const intersects = raycaster.intersectObjects(shootables, false);
        const origin = new THREE.Vector3().setFromMatrixPosition(this.camera.matrixWorld);
        const farPoint = origin.clone().addScaledVector(raycaster.ray.direction, this.profile.range);
        const hitPoint = farPoint.clone();
        let damageMultiplier = 1;
        let penetrations = 0, remainingEnergy = null, lastPenetrationDistance = 0;
        const visited = new Set();
        for (const hit of intersects) {
            // Front/back triangles and overlapping edges must not damage the same prop twice.
            if (visited.has(hit.object)) continue;
            visited.add(hit.object);
            const energyAtHit=remainingEnergy===null?projectileEnergy(this.activeSlot,hit.distance):transportEnergy(this.activeSlot,remainingEnergy,hit.distance-lastPenetrationDistance);
            hitPoint.copy(hit.point);
            let curr = hit.object;
            let bot = null, breakable = null;
            while (curr) {
                bot ||= curr.userData.bot;
                breakable ||= curr.userData.breakable;
                curr = curr.parent;
            }
            if (breakable) {
                this.surfaceDamage?.hit(hit,this.activeSlot,raycaster.ray.direction,{panel:true,distance:hit.distance,damage:this.profile.bodyDamage*damageMultiplier});
                const surfaceNormal=hit.face?.normal.clone().applyNormalMatrix(new THREE.Matrix3().getNormalMatrix(hit.object.matrixWorld)).normalize();
                const panelDamage=environmentalDamage(this.activeSlot,hit.distance,this.profile.bodyDamage*damageMultiplier,surfaceNormal?Math.abs(surfaceNormal.dot(raycaster.ray.direction)):1);
                const result = breakable.takeBulletHit(hit, Math.round(panelDamage), raycaster.ray.direction,{slot:this.activeSlot,distance:hit.distance,multiplier:damageMultiplier,energy:energyAtHit});
                if (result?.penetrates && penetrations++ < 4 && damageMultiplier > .08) {
                    damageMultiplier *= result.damageMultiplier ?? 1;
                    remainingEnergy=result.remainingEnergy??energyAtHit*.8;lastPenetrationDistance=hit.distance;
                    hitPoint.copy(farPoint);
                    continue;
                }
                break;
            }
            if (bot) {
                const isHeadshot = hit.object.userData.isHead || hit.point.y > bot.position.y + 1.5;
                const damage = Math.round((isHeadshot ? this.profile.headDamage : this.profile.bodyDamage) * damageMultiplier);
                bot.takeDamage(damage, isHeadshot, raycaster.ray.direction,hit.point,this.activeSlot);
                soundEngine.playHitmarker(isHeadshot);
                window.__triggerHitmarker?.(isHeadshot, damage, hit.point);
            } else if(this.surfaceDamage){
                const result=this.surfaceDamage.hit(hit,this.activeSlot,raycaster.ray.direction,{distance:hit.distance,damage:this.profile.bodyDamage*damageMultiplier,energy:energyAtHit});
                if(result?.penetrates && penetrations++ < 4 && damageMultiplier > .08){damageMultiplier*=result.damageMultiplier;remainingEnergy=result.remainingEnergy??energyAtHit*.8;lastPenetrationDistance=hit.distance;hitPoint.copy(farPoint);continue;}
            }else soundEngine.playImpact(hit.point);
            const normal = hit.face
                ? hit.face.normal.clone().applyNormalMatrix(new THREE.Matrix3().getNormalMatrix(hit.object.matrixWorld))
                : new THREE.Vector3(0, 1, 0);
            if(!this.surfaceDamage&&!bot)this.createImpactSparks(hit.point, normal);
            break;
        }

        this.createBulletTracer(origin, hitPoint);
    }

    createBulletTracer(start, end) {
        const dir = new THREE.Vector3().subVectors(end, start);
        const length = dir.length();
        const geom = new THREE.CylinderGeometry(0.015, 0.015, length, 8);
        geom.rotateX(Math.PI / 2);
        geom.translate(0, 0, length / 2);

        const mat = new THREE.MeshBasicMaterial({
            color: 0xffd277,
            transparent: true,
            opacity: 0.95
        });

        const mesh = new THREE.Mesh(geom, mat);
        mesh.position.copy(start);
        mesh.lookAt(end);
        this.scene.add(mesh);

        this.tracers.push({ mesh, life: 0.22, maxLife: 0.22 });
    }

    createImpactSparks(pos, normal) {
        const count = 12;
        const geom = new THREE.BufferGeometry();
        const positions = new Float32Array(count * 3);
        const velocities = [];

        for (let i = 0; i < count; i++) {
            positions[i * 3] = pos.x;
            positions[i * 3 + 1] = pos.y;
            positions[i * 3 + 2] = pos.z;

            const v = normal.clone().multiplyScalar(4 + Math.random() * 5);
            v.x += (Math.random() - 0.5) * 4;
            v.y += (Math.random() - 0.5) * 4;
            v.z += (Math.random() - 0.5) * 4;
            velocities.push(v);
        }

        geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        const mat = new THREE.PointsMaterial({
            color: 0xffaa33,
            size: 0.08,
            transparent: true,
            opacity: 1.0,
            blending: THREE.AdditiveBlending
        });

        const points = new THREE.Points(geom, mat);
        this.scene.add(points);
        this.sparks.push({ points, velocities, life: 0.35, maxLife: 0.35 });
    }

    update(delta) {
        this.fireActionRemaining = Math.max(0, (this.fireActionRemaining || 0) - delta);
        this.grenadeDrawRemaining = Math.max(0, (this.grenadeDrawRemaining || 0) - delta);
        if (this.pendingShotTime > 0) {
            this.pendingShotTime = Math.max(0, this.pendingShotTime - delta);
            if (!this.movement.isLocked) this.pendingShotTime = 0;
            else if (this.pendingShotTime > 0 && !this.movement.isSprinting && !this.movement.isSliding && this.movement.sprintRecovery <= 0) this.shoot();
        }
        for (const mixer of this.handMixers || []) mixer.update(delta);
        for (const store of Object.values(this.ammoStores)) store.cooldown = Math.max(0, store.cooldown - delta);
        this.canShoot = this.fireCooldown <= 0;
        this.switchTimer = Math.max(0, this.switchTimer - delta);
        this.utilityTimer = Math.max(0, this.utilityTimer - delta);
        this.movement.isThrowing = this.utilityTimer > 0 || !!this.grenadeEquipped;
        if (this.isReloading) {
            this.reloadRemaining -= delta;
            this.reloadProgress = 1 - Math.max(0, this.reloadRemaining) / (this.reloadDuration || this.profile.reloadTime);
            const elapsed = (this.reloadDuration || this.profile.reloadTime) - this.reloadRemaining;
            for (const [index, event] of (this.reloadSequence?.events || []).entries()) {
                if (elapsed >= event.time && !this.reloadEventsFired.has(index)) {
                    this.reloadEventsFired.add(index);
                    if (event.type === 'sound') soundEngine.playReload(this.activeSlot,Math.max(.1,this.reloadDuration-elapsed),{
                        insert:Math.max(0,(this.reloadSequence.events.find(e=>e.type==='ammo')?.time??this.reloadDuration*.76)-elapsed),
                        slide:Math.max(0,this.reloadDuration*.825-elapsed)});
                    if (event.type === 'ammo') {
                        const added = Math.min(this.maxMag - this.magAmmo, this.reserveAmmo);
                        this.magAmmo += added; this.reserveAmmo -= added;
                    }
                }
            }
            if (this.reloadRemaining <= 0) {
                const added = Math.min(this.maxMag - this.magAmmo, this.reserveAmmo);
                this.magAmmo += added;
                this.reserveAmmo -= added;
                this.isReloading = false;
            }
        }
        if (this.boltDelay > 0) {
            this.boltDelay -= delta;
            if (this.boltDelay <= 0) { this.boltActive = true; this.boltProgress = 0; }
        }

        // 2. Bolt Action Cycle Animation
        if (this.boltActive) {
            this.boltProgress += delta * 1.6;
            if (this.boltProgress >= 1.0) {
                this.boltActive = false;
                this.boltProgress = 0;
            }
        }

        // 3. ADS Progress (Snappy cubic ease quickscope)
        const targetADS = this.isAiming && !this.isReloading && this.utilityTimer <= 0 && this.switchTimer <= 0 && !this.movement.isSliding && !(this.movement.sprintRecovery > 0) ? 1 : 0;
        this.adsProgress = THREE.MathUtils.damp(this.adsProgress, targetADS, this.adsSpeed, delta);
        if (Math.abs(this.adsProgress - targetADS) < 0.0001) this.adsProgress = targetADS;

        // Adjust camera FOV: 85° hipfire down to the scoped FOV
        const targetFov = THREE.MathUtils.lerp(this.movement.currentFov, this.profile.aimFov, this.adsProgress);
        if (this.camera.fov !== targetFov) {
            this.camera.fov = targetFov;
            this.camera.updateProjectionMatrix();
        }

        const scoped = !this.grenadeEquipped && this.activeSlot === 'primary' && this.adsProgress > 0.86;
        this.weaponGroup.visible = !scoped && this.switchTimer < 0.18 && !this.movement.isDisabled;
        if (this.rifleModel) this.rifleModel.visible = !this.grenadeEquipped && this.activeSlot === 'primary' && this.adsProgress <= 0.82 && this.utilityTimer <= 0;
        if (this.pistolModel) this.pistolModel.visible = !this.grenadeEquipped && this.activeSlot === 'pistol' && this.utilityTimer <= 0;

        // 4. Viewmodel Base Position & Rotation Interpolation
        this.currentPos.lerpVectors(this.hipPos, this.adsPos, this.adsProgress);
        this.currentRot.x = THREE.MathUtils.lerp(this.hipRot.x, this.adsRot.x, this.adsProgress);
        this.currentRot.y = THREE.MathUtils.lerp(this.hipRot.y, this.adsRot.y, this.adsProgress);
        this.currentRot.z = THREE.MathUtils.lerp(this.hipRot.z, this.adsRot.z, this.adsProgress);
        if (!this.poseOverrides || this.overrideSlot !== this.activeSlot || this.overrideAim !== this.adsProgress || this.overrideRevision !== this.poseRevision) {
            this.poseOverrides = blendPose(this.poseLibrary.poses[`${this.activeSlot}:hip`], this.poseLibrary.poses[`${this.activeSlot}:aim`], this.adsProgress);
            this.overrideSlot = this.activeSlot;
            this.overrideAim = this.adsProgress;
            this.overrideRevision = this.poseRevision;
        }
        this.currentPos.add(new THREE.Vector3().fromArray(this.poseOverrides.weapon.position));
        this.currentRot.x += this.poseOverrides.weapon.rotation[0];
        this.currentRot.y += this.poseOverrides.weapon.rotation[1];
        this.currentRot.z += this.poseOverrides.weapon.rotation[2];
        // Grenades have their own transient framing. Saved firearm poses stay untouched.
        if (this.grenadeEquipped) {
            this.grenadePoseOverrides = throwablePose(this.poseLibrary, this.equipment?.held?.type || 'frag', {
                pinProgress: this.pinProgress || 0, throwProgress: this.throwProgress || 0,
                mode: this.throwMode, throwing: this.utilityTimer > 0,
            });
            this.currentPos.fromArray(GRENADE_FRAME).add(new THREE.Vector3().fromArray(this.grenadePoseOverrides.weapon.position));
            this.currentRot.set(...this.grenadePoseOverrides.weapon.rotation);
        }

        // 5. Tactical Slide Tilt (COD gun roll during slide)
        if (this.movement.isSliding) {
            const slideFactor = (1.0 - this.adsProgress);
            this.currentRot.z -= 0.35 * slideFactor;
            this.currentRot.y += 0.15 * slideFactor;
            this.currentPos.y -= 0.03 * slideFactor;
        }

        // Lower and cant the entire rifle/arms rig during reload and tactical sprint.
        if (this.isReloading) {
            const dip = Math.sin(this.reloadProgress * Math.PI);
            if (this.activeSlot === 'pistol') applySequenceFraming(this.currentPos, this.currentRot, sampleReloadSequence(this.reloadSequence || this.poseLibrary.reloadSequence, this.reloadProgress * (this.reloadDuration || this.profile.reloadTime)));
            else {
                this.currentPos.y -= dip * 0.055;
                this.currentRot.z -= dip * 0.20;
                this.currentRot.x -= dip * 0.08;
            }
        }
        const lowered = this.movement.isSprinting ? 1
            : (this.movement.sprintRecovery || 0) / (this.movement.sprintReadyTime || 0.22) * 0.7;
        this.sprintBlend = THREE.MathUtils.damp(this.sprintBlend || 0, lowered, 10, delta);
        this.currentRot.y -= this.sprintBlend * 0.28;
        this.currentRot.x += this.sprintBlend * 0.24;
        this.currentPos.y -= this.sprintBlend * 0.04;

        if (this.switchTimer > 0) this.currentPos.y -= Math.sin(this.switchTimer / 0.28 * Math.PI) * 0.16;
        if (this.utilityTimer > 0) this.currentPos.y -= 0.09;

        // 6. Weapon Mouse Look Inertia / Sway
        const swayFactor = (1.0 - this.adsProgress * 0.85);
        const swayX = -this.movement.mouseDelta.x * 0.00025 * swayFactor;
        const swayY = -this.movement.mouseDelta.y * 0.00025 * swayFactor;

        // 7. Weapon Walk / Sprint Bob
        const speed = this.movement.getSpeed();
        let bobX = 0, bobY = 0;
        if (this.movement.isGrounded && speed > 2.0 && this.adsProgress < 0.5) {
            const bobFreq = this.movement.isSprinting ? 18.0 : 12.0;
            const bobAmp = this.movement.isSprinting ? 0.015 : 0.008;
            bobX = Math.cos(this.movement.bobTime * 0.5) * bobAmp;
            bobY = Math.abs(Math.sin(this.movement.bobTime)) * bobAmp;
        }

        // 8. Bolt Cycle Dip
        let boltDipY = 0;
        let boltRollZ = 0;
        if (this.boltActive) {
            const bp = this.boltProgress;
            boltDipY = -Math.sin(bp * Math.PI) * 0.02;
            boltRollZ = Math.sin(bp * Math.PI) * 0.08;
        }

        // 9. Recoil Recovery Spring
        this.recoilPos.multiplyScalar(Math.exp(-this.recoilRecoverySpeed * delta));
        this.recoilRot.x = THREE.MathUtils.damp(this.recoilRot.x, 0, this.recoilRecoverySpeed, delta);
        this.recoilRot.y = THREE.MathUtils.damp(this.recoilRot.y, 0, this.recoilRecoverySpeed, delta);
        this.recoilRot.z = THREE.MathUtils.damp(this.recoilRot.z, 0, this.recoilRecoverySpeed, delta);

        // Lean keeps the rifle anchored to the shoulder: it tilts in place instead of orbiting the eye.
        const leanRoll = this.camera.rotation.z;

        // Crouching lowers the rifle a little with the body.
        this.crouchBlend = THREE.MathUtils.damp(this.crouchBlend || 0, this.movement.isCrouching ? 1 : 0, 10, delta);
        this.currentPos.y -= this.crouchBlend * 0.03;

        // 10. Update the shared weapon and arms rig.
        this.weaponGroup.position.set(
            this.currentPos.x + this.recoilPos.x + swayX + bobX,
            this.currentPos.y + this.recoilPos.y + swayY + bobY + boltDipY,
            this.currentPos.z + this.recoilPos.z
        );

        this.weaponGroup.rotation.set(
            this.currentRot.x + this.recoilRot.x,
            this.currentRot.y + this.recoilRot.y + swayX * 1.5,
            this.currentRot.z + this.recoilRot.z + boltRollZ + leanRoll
        );

        this.viewMotion = this.getViewMotion();
        const reloadSample = this.activeSlot === 'pistol' && this.isReloading ? sampleReloadSequence(this.reloadSequence || this.poseLibrary.reloadSequence, this.reloadProgress * (this.reloadDuration || this.profile.reloadTime)) : null;
        this.reloadPoseOverrides = reloadSample ? addTimelinePose(this.poseOverrides, reloadSample.pose) : null;
        applyPistolMechanics(this.pistolModel, 0,
            this.activeSlot === 'pistol' && this.fireActionRemaining > 0 && !this.isReloading ? 1 - this.fireActionRemaining / 0.18 : null);
        this.armsRig?.updateView(delta, this);
        if (reloadSample) applySequenceMechanics(this.pistolModel, this.armsRig, reloadSample);

        // 11. Update Tracers
        for (let i = this.tracers.length - 1; i >= 0; i--) {
            const tr = this.tracers[i];
            tr.life -= delta;
            tr.mesh.material.opacity = (tr.life / tr.maxLife) * 0.95;
            if (tr.life <= 0) {
                this.scene.remove(tr.mesh);
                tr.mesh.geometry.dispose();
                tr.mesh.material.dispose();
                this.tracers.splice(i, 1);
            }
        }

        // 12. Update Sparks
        for (let i = this.sparks.length - 1; i >= 0; i--) {
            const sp = this.sparks[i];
            sp.life -= delta;
            const positions = sp.points.geometry.attributes.position.array;
            for (let j = 0; j < sp.velocities.length; j++) {
                positions[j * 3] += sp.velocities[j].x * delta;
                positions[j * 3 + 1] += sp.velocities[j].y * delta;
                positions[j * 3 + 2] += sp.velocities[j].z * delta;
                sp.velocities[j].y -= 15.0 * delta;
            }
            sp.points.geometry.attributes.position.needsUpdate = true;
            sp.points.material.opacity = (sp.life / sp.maxLife);
            if (sp.life <= 0) {
                this.scene.remove(sp.points);
                sp.points.geometry.dispose();
                sp.points.material.dispose();
                this.sparks.splice(i, 1);
            }
        }
    }

    getViewMotion() {
        if (!this.grenadeEquipped && this.activeSlot === 'pistol' && this.isReloading) return sequenceMotion(this.reloadProgress || 0);
        if (this.viewActionsEnabled === false) return null;
        const prefix = this.activeSlot === 'pistol' ? 'pistol' : 'sniper';
        if (this.grenadeEquipped) {
            if (this.utilityTimer > 0) return sampleViewAction(this.viewActionPack, 'grenadeThrow', this.throwProgress || 0, this.throwMode === 'low' ? 0.55 : 0.85);
            if (this.pinProgress > 0 && this.pinProgress < 1) return sampleViewAction(this.viewActionPack, 'grenadePin', this.pinProgress, 0.8);
            if (this.grenadeDrawRemaining > 0) return sampleViewAction(this.viewActionPack, 'grenadeDraw', 1 - this.grenadeDrawRemaining / 0.4, 0.7);
            return null;
        }
        if (this.isReloading) return sampleViewAction(this.viewActionPack, `${prefix}Reload`, this.reloadProgress || 0);
        if (this.switchTimer > 0) return sampleViewAction(this.viewActionPack, `${prefix}Draw`, 1 - this.switchTimer / 0.28, 0.75);
        if (this.fireActionRemaining > 0) return sampleViewAction(this.viewActionPack, `${prefix}Fire`, 1 - this.fireActionRemaining / (this.activeSlot === 'pistol' ? 0.18 : 0.65), 0.5);
        return null;
    }
}

