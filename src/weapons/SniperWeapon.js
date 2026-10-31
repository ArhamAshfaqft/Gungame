import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { soundEngine } from '../audio/SoundEngine.js';
import { createViewArms } from '../models/TacticalOperator.js';
import { createSwatRig } from '../models/SwatRig.js';
import { loadSniperModel } from '../models/SniperModel.js';

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

        // Weapon States
        this.isAiming = false;
        this.adsProgress = 0; // 0 to 1
        this.adsSpeed = 15.0;  // 120-140ms snappy quickscope
        this.canShoot = true;
        this.fireCooldown = 0;
        this.fireRate = 0.85; // bolt action cycle time

        this.magAmmo = 5;
        this.maxMag = 5;
        this.reserveAmmo = 35;
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

    setupViewmodelLighting() {
        const key = new THREE.DirectionalLight(0xffe7c7, 3.2);
        key.position.set(-2, 3, 3);
        this.viewmodelScene.add(key);
        const rim = new THREE.DirectionalLight(0x8cb8df, 2);
        rim.position.set(3, 1, -2);
        this.viewmodelScene.add(rim);
        this.viewmodelScene.add(new THREE.HemisphereLight(0xb8ccdd, 0x34372c, 1.5));
    }

    async loadAssets() {
        try {
            this.rifleModel = await loadSniperModel();
            this.weaponGroup.add(this.rifleModel);
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
        this.armsRig.updateView(0, this);
    }

    setupInput() {
        window.addEventListener('mousedown', (e) => {
            if (!this.movement.isLocked) return;
            if (e.button === 0) {
                this.shoot();
            } else if (e.button === 2) {
                this.isAiming = true;
                soundEngine.playScopeZoom(true);
            }
        });

        window.addEventListener('mouseup', (e) => {
            if (e.button === 2) {
                this.isAiming = false;
                soundEngine.playScopeZoom(false);
            }
        });

        window.addEventListener('contextmenu', (e) => e.preventDefault());

        const clearAim = () => { this.isAiming = false; };
        window.addEventListener('blur', clearAim);
        document.addEventListener('pointerlockchange', () => {
            if (!this.movement.isLocked) clearAim();
        });

        window.addEventListener('keydown', (e) => {
            if (this.movement.isLocked && e.code === 'KeyR' && !this.isReloading && this.magAmmo < this.maxMag && this.reserveAmmo > 0) {
                this.reload();
            }
        });
    }

    shoot() {
        if (!this.canShoot || this.fireCooldown > 0 || this.isReloading) return;
        if (this.magAmmo <= 0) {
            this.reload();
            return;
        }

        this.magAmmo--;
        this.canShoot = false;
        this.fireCooldown = this.fireRate;

        // 1. Play Heavy Sniper Crack Audio
        soundEngine.playSniperShot();
        soundEngine.playBoltCycle();

        // 2. Heavy Recoil Impulse
        this.recoilPos.z += 0.06;
        this.recoilPos.y += 0.015;
        this.recoilRot.x += 0.16;
        this.recoilRot.y += (Math.random() - 0.5) * 0.02;
        this.recoilRot.z += (Math.random() - 0.5) * 0.03;

        // Camera kick
        this.movement.pitch += 0.045;
        this.movement.yaw += (Math.random() - 0.5) * 0.012;

        // 3. Raycast Hitscan
        this.performRaycast();

        // 4. Start bolt action animation after recoil initial kick
        setTimeout(() => {
            this.boltActive = true;
            this.boltProgress = 0;
        }, 280);
    }

    reload() {
        if (this.isReloading || this.magAmmo === this.maxMag || this.reserveAmmo <= 0) return;
        this.isReloading = true;
        this.reloadProgress = 0;
        this.isAiming = false;
        soundEngine.playReload();

        setTimeout(() => {
            const needed = this.maxMag - this.magAmmo;
            const added = Math.min(needed, this.reserveAmmo);
            this.magAmmo += added;
            this.reserveAmmo -= added;
            this.isReloading = false;
        }, 1300);
    }

    performRaycast() {
        let spread = 0.0005;
        if (this.adsProgress < 0.8) {
            spread = 0.045;
            if (this.movement.isSliding) spread = 0.085;
            else if (!this.movement.isGrounded) spread = 0.11;
        }

        const spreadX = (Math.random() - 0.5) * spread;
        const spreadY = (Math.random() - 0.5) * spread;

        const raycaster = new THREE.Raycaster();
        this.scene.updateMatrixWorld(true);
        this.camera.updateMatrixWorld(true);
        raycaster.setFromCamera(new THREE.Vector2(spreadX, spreadY), this.camera);

        const shootables = [];
        this.scene.traverse((obj) => {
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
        let hitPoint = origin.clone().add(raycaster.ray.direction.clone().multiplyScalar(160));
        let isHeadshot = false;

        if (intersects.length > 0) {
            const hit = intersects[0];
            hitPoint.copy(hit.point);

            let curr = hit.object;
            while (curr) {
                if (curr.userData && curr.userData.bot) {
                    const bot = curr.userData.bot;
                    isHeadshot = hit.object.userData.isHead || hit.point.y > (bot.position.y + 1.5);
                    const damage = isHeadshot ? 250 : 125;
                    bot.takeDamage(damage, isHeadshot, raycaster.ray.direction);

                    soundEngine.playHitmarker(isHeadshot);
                    if (window.__triggerHitmarker) {
                        window.__triggerHitmarker(isHeadshot, damage, hit.point);
                    }
                    break;
                }
                curr = curr.parent;
            }

            this.createImpactSparks(hit.point, hit.face ? hit.face.normal : new THREE.Vector3(0, 1, 0));
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
        for (const mixer of this.handMixers || []) mixer.update(delta);
        // 1. Fire Cooldown
        if (this.fireCooldown > 0) {
            this.fireCooldown -= delta;
            if (this.fireCooldown <= 0) {
                this.canShoot = true;
            }
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
        const targetADS = (this.isAiming && !this.isReloading) ? 1.0 : 0.0;
        this.adsProgress = THREE.MathUtils.damp(this.adsProgress, targetADS, this.adsSpeed, delta);

        // Adjust camera FOV: 85° hipfire down to 22° sniper scope
        const targetFov = THREE.MathUtils.lerp(this.movement.currentFov, 22.0, this.adsProgress);
        if (this.camera.fov !== targetFov) {
            this.camera.fov = targetFov;
            this.camera.updateProjectionMatrix();
        }

        // When fully scoped, fade viewmodel visibility slightly so full reticle is crystal clear
        this.weaponGroup.visible = this.adsProgress < 0.86;
        if (this.rifleModel) {
            if (this.adsProgress > 0.82) {
                this.rifleModel.visible = false;
            } else {
                this.rifleModel.visible = true;
            }
        }

        // 4. Viewmodel Base Position & Rotation Interpolation
        this.currentPos.lerpVectors(this.hipPos, this.adsPos, this.adsProgress);
        this.currentRot.x = THREE.MathUtils.lerp(this.hipRot.x, this.adsRot.x, this.adsProgress);
        this.currentRot.y = THREE.MathUtils.lerp(this.hipRot.y, this.adsRot.y, this.adsProgress);
        this.currentRot.z = THREE.MathUtils.lerp(this.hipRot.z, this.adsRot.z, this.adsProgress);

        // 5. Tactical Slide Tilt (COD gun roll during slide)
        if (this.movement.isSliding) {
            const slideFactor = (1.0 - this.adsProgress);
            this.currentRot.z -= 0.35 * slideFactor;
            this.currentRot.y += 0.15 * slideFactor;
            this.currentPos.y -= 0.03 * slideFactor;
        }

        // Lower and cant the entire rifle/arms rig during reload and tactical sprint.
        if (this.isReloading) {
            this.reloadProgress = Math.min(1, (this.reloadProgress || 0) + delta / 1.3);
            const dip = Math.sin(this.reloadProgress * Math.PI);
            this.currentPos.y -= dip * 0.17;
            this.currentRot.z -= dip * 0.48;
            this.currentRot.x -= dip * 0.22;
        }
        this.sprintBlend = THREE.MathUtils.damp(this.sprintBlend || 0,
            this.movement.isSprinting && !this.isAiming ? 1 : 0, 10, delta);
        this.currentRot.y -= this.sprintBlend * 0.28;
        this.currentRot.x += this.sprintBlend * 0.24;
        this.currentPos.y -= this.sprintBlend * 0.04;

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

        // 10. Update the shared weapon and arms rig.
        this.weaponGroup.position.set(
            this.currentPos.x + this.recoilPos.x + swayX + bobX,
            this.currentPos.y + this.recoilPos.y + swayY + bobY + boltDipY,
            this.currentPos.z + this.recoilPos.z
        );

        this.weaponGroup.rotation.set(
            this.currentRot.x + this.recoilRot.x,
            this.currentRot.y + this.recoilRot.y + swayX * 1.5,
            this.currentRot.z + this.recoilRot.z + boltRollZ
        );

        // The viewmodel camera shares the world camera's strafe/peek roll so the rifle tilts with the view.
        this.viewmodelCamera.rotation.z = this.camera.rotation.z;

        this.armsRig?.updateView(delta, this);

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
}
