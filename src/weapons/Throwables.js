import * as THREE from 'three';
import { createGrenadeModel, applyGrenadePlacement } from '../models/GrenadeModel.js';
import { soundEngine } from '../audio/SoundEngine.js';
import { sweepSphere, hasLineOfSight, flashExposure } from './CombatQueries.js';
import { SmokeCloud } from './SmokeCloud.js';
import { createAmmoStores } from './WeaponProfiles.js';
import { throwablePose } from '../studio/PoseLibrary.js';

export const GRENADES = Object.freeze({
    frag: { name: 'FRAG', fuse: 6, radius: 6 },
    flash: { name: 'FLASH', fuse: 6, radius: 12 },
    smoke: { name: 'SMOKE', fuse: 6, radius: 3 },
});

export class Throwables {
    constructor(scene, camera, movement, weapon, { colliders = [], room = null, bots = null } = {}) {
        Object.assign(this, { scene, camera, movement, weapon, colliders, room, bots });
        weapon.equipment = this;
        this.held = null;
        this.selected = 'frag'; this.counts = { frag: 2, flash: 2, smoke: 2 };
        this.projectiles = []; this.clouds = []; this.bursts = [];
        this.pending = null; this.flashRemaining = 0; this.flashPeak = 0;
        this.flashOpacity = 0; this.smokeOpacity = 0; this.playerHealth = 100; this.respawnTimer = 0;
        this.status = ''; this.statusTime = 0;
        const trajectoryGeometry = new THREE.BufferGeometry().setFromPoints(Array.from({ length: 41 }, () => new THREE.Vector3()));
        this.trajectory = new THREE.Line(trajectoryGeometry, new THREE.LineBasicMaterial({ color: 0xe9b85a, transparent: true, opacity: 0.65 }));
        this.trajectory.frustumCulled = false; this.trajectory.visible = false; scene.add(this.trajectory);
        window.addEventListener('keydown', event => {
            if (!movement.isLocked || event.repeat || movement.isDisabled) return;
            const selected = { Digit3: 'frag', Digit4: 'flash', Digit5: 'smoke' }[event.code];
            if (selected) this.select(selected);
            if (event.code === 'KeyG') this.select(this.selected);
        });
        window.addEventListener('mousedown', event => {
            if (!movement.isLocked || movement.isDisabled || !this.held || this.pending) return;
            if (event.button === 2) {
                if (!this.held.armed) this.pullPin();
                else this.throwSelected('low');
            }
            if (event.button === 0) {
                if (this.held.armed) this.throwSelected(movement.keys?.walk ? 'low' : 'high');
                else this.message('RIGHT CLICK TO PULL PIN');
            }
        });
    }

    message(text) { this.status = text; this.statusTime = 2; }
    select(type) {
        if (!GRENADES[type] || this.pending || this.held?.armed || this.movement.isDisabled || this.weapon.switchTimer > 0) return false;
        if (this.counts[type] <= 0) { this.message(`NO ${GRENADES[type].name} LEFT`); return false; }
        this.stow();
        this.selected = type;
        const model = createGrenadeModel(type);
        this.weapon.weaponGroup.add(model);
        this.held = { type, model, armed: false, age: 0, pinAge: 0 };
        this.weapon.grenadeEquipped = true;
        this.weapon.grenadeDrawRemaining = 0.4;
        this.weapon.cancelReload(); this.weapon.isAiming = false; this.weapon.pendingShotTime = 0;
        this.weapon.boltActive = false; this.weapon.boltDelay = 0;
        this.weapon.poseRevision = (this.weapon.poseRevision || 0) + 1;
        this.movement.requestWeaponReady?.();
        this.message(`${GRENADES[type].name} IN HAND / RMB PULL PIN`);
        return true;
    }
    stow(force = false) {
        if (!force && (this.held?.armed || this.pending)) { this.message('LIVE GRENADE / THROW IT'); return false; }
        if (this.held) this.weapon.weaponGroup.remove(this.held.model);
        this.held = null; this.pending = null; this.weapon.grenadeEquipped = false;
        this.weapon.pinProgress = 0; this.weapon.throwProgress = 0;
        this.weapon.throwMode = 'high';
        this.weapon.grenadeDrawRemaining = 0;
        this.weapon.utilityTimer = 0; this.movement.isThrowing = false; this.trajectory.visible = false;
        this.weapon.poseRevision = (this.weapon.poseRevision || 0) + 1;
        return true;
    }
    pullPin() {
        if (!this.held || this.held.armed || this.pending || this.movement.isDisabled || this.projectiles.length >= 6) return false;
        this.held.armed = true; this.held.age = 0; this.held.pinAge = 0;
        this.counts[this.held.type]--;
        soundEngine.playUtility('pin');
        this.message('PIN OUT / 6 SECONDS / LMB HIGH · ALT + LMB LOW');
        return true;
    }
    get fuseRemaining() { return this.held?.armed ? Math.max(0, 6 - this.held.age) : null; }
    throwSelected(mode = 'high') {
        if (!this.held?.armed || this.pending || this.movement.isDisabled) return false;
        this.weapon.utilityTimer = 0.7;
        this.weapon.throwMode = mode === 'low' ? 'low' : 'high';
        this.pending = { type: this.held.type, mode: mode === 'low' ? 'low' : 'high', age: 0, released: false };
        this.weapon.throwProgress = 0;
        this.message(mode === 'low' ? 'LOW TOSS' : 'HIGH THROW');
        return true;
    }
    launchParameters(mode) {
        const direction = this.camera.getWorldDirection(new THREE.Vector3());
        const start = this.camera.position.clone();
        const desired = start.clone().addScaledVector(direction, 0.25);
        if (mode === 'low') desired.y -= 0.35;
        const obstruction = sweepSphere(start, desired, 0.065, this.colliders);
        if (obstruction) desired.copy(start).lerp(desired, Math.max(0, obstruction.time - 0.02));
        desired.y = Math.max(0.07, desired.y);
        const velocity = direction.multiplyScalar(mode === 'low' ? 4.5 : 11).add(new THREE.Vector3(0, mode === 'low' ? 0.5 : 2.2, 0)).addScaledVector(this.movement.velocity, 0.3);
        return { position: desired, velocity };
    }
    updateTrajectory() {
        this.trajectory.visible = !!this.held?.armed && !this.pending;
        if (!this.trajectory.visible) return;
        const { position, velocity } = this.launchParameters(this.movement.keys?.walk ? 'low' : 'high');
        const points = this.trajectory.geometry.attributes.position;
        let count = 0;
        for (let i = 0; i < 40; i++) {
            points.setXYZ(count++, position.x, position.y, position.z);
            const step = Math.min(0.06, this.fuseRemaining / 40);
            velocity.y -= 12 * step;
            const next = position.clone().addScaledVector(velocity, step);
            const hit = sweepSphere(position, next, 0.065, this.colliders);
            if (hit || next.y < 0.065) {
                if (hit) next.copy(position).lerp(next, hit.time);
                next.y = Math.max(0.065, next.y);
                points.setXYZ(count++, next.x, next.y, next.z); break;
            }
            position.copy(next);
        }
        points.needsUpdate = true; this.trajectory.geometry.setDrawRange(0, Math.min(count, 41));
    }

    spawn(type, position, velocity) {
        if (!GRENADES[type] || this.projectiles.length >= 6) return null;
        const mesh = createGrenadeModel(type);
        mesh.position.copy(position);
        this.scene.add(mesh);
        const projectile = { type, mesh, position: mesh.position, velocity: velocity.clone(), age: 0, bounceCooldown: 0, resting: false };
        this.projectiles.push(projectile);
        return projectile;
    }

    update(delta) {
        this.statusTime = Math.max(0, this.statusTime - delta);
        this.flashRemaining = Math.max(0, this.flashRemaining - delta);
        this.flashOpacity = this.flashPeak * Math.min(1, this.flashRemaining / 1.5);
        if (!this.flashRemaining) this.flashPeak = 0;
        if (this.respawnTimer > 0) {
            this.respawnTimer -= delta;
            if (this.respawnTimer <= 0) this.respawnPlayer();
        }
        if (this.held?.armed) {
            this.held.age += delta; this.held.pinAge += delta;
            this.weapon.pinProgress = Math.min(1, this.held.pinAge / 0.35);
            if (this.held.age >= 6) {
                const type = this.held.type;
                this.stow(true);
                this.detonate(type, this.camera.position.clone().add(new THREE.Vector3(0, -0.25, 0)));
                this.message(this.playerHealth > 0 ? 'GRENADE ACTIVATED IN HAND' : 'BLAST DOWN / RECOVERING');
            }
        }
        if (this.held) {
            const pin = this.held.model.getObjectByName('SafetyPin');
            if (pin) { pin.visible = !this.held.armed || this.held.pinAge < 0.35; pin.position.x = -0.025 - (this.held.armed ? Math.min(1, this.held.pinAge / 0.35) * 0.12 : 0); }
        }
        if (this.pending) {
            const action = this.pending;
            action.age += delta;
            const progress = Math.min(1, action.age / 0.7);
            this.weapon.throwProgress = progress;
            if (action.age >= 0.22 && this.held.pinAge >= 0.35 && !action.released) {
                action.released = true;
                this.held.model.visible = false;
                const { position, velocity } = this.launchParameters(action.mode);
                const projectile = this.spawn(action.type, position, velocity);
                projectile.age = this.held.age; projectile.justReleased = true;
                projectile.mesh.quaternion.copy(this.held.model.quaternion);
                projectile.mesh.getObjectByName('SafetyPin').visible = false;
                this.held.armed = false;
                soundEngine.playUtility('throw');
            }
            if (progress >= 1) {
                this.stow(true);
            }
        }

        if (this.held) {
            const custom = throwablePose(this.weapon.poseLibrary, this.held.type, {
                pinProgress: this.weapon.pinProgress || 0, throwProgress: this.weapon.throwProgress || 0,
                mode: this.weapon.throwMode, throwing: !!this.pending,
            });
            applyGrenadePlacement(this.held.model, this.weapon.throwProgress, this.weapon.throwMode, custom);
        }
        for (let i = this.projectiles.length - 1; i >= 0; i--) {
            const projectile = this.projectiles[i];
            if (projectile.justReleased) { projectile.justReleased = false; continue; }
            projectile.age += delta;
            projectile.bounceCooldown = Math.max(0, projectile.bounceCooldown - delta);
            if (!projectile.resting) this.integrate(projectile, delta);
            if (projectile.age >= GRENADES[projectile.type].fuse) {
                this.scene.remove(projectile.mesh);
                this.projectiles.splice(i, 1);
                this.detonate(projectile.type, projectile.position.clone());
            }
        }
        this.updateTrajectory();
        for (let i = this.clouds.length - 1; i >= 0; i--) {
            this.clouds[i].update(delta);
            if (this.clouds[i].age >= this.clouds[i].duration) { this.clouds[i].dispose(this.scene); this.clouds.splice(i, 1); }
        }
        this.smokeOpacity = Math.max(0, ...this.clouds.map(cloud => {
            const opacity = cloud.opacityAt(this.camera.position);
            return opacity > 0 && hasLineOfSight(this.scene, cloud.center, this.camera.position) ? opacity : 0;
        }));
        for (let i = this.bursts.length - 1; i >= 0; i--) {
            const burst = this.bursts[i]; burst.age += delta;
            burst.mesh.scale.setScalar(1 + burst.age * 13);
            burst.mesh.material.opacity = Math.max(0, 1 - burst.age / 0.45) * 0.7;
            if (burst.age > 0.45) {
                this.scene.remove(burst.mesh); burst.mesh.geometry.dispose(); burst.mesh.material.dispose(); this.bursts.splice(i, 1);
            }
        }
    }

    integrate(projectile, delta) {
        const steps = Math.max(1, Math.ceil(delta / (1 / 90))), step = delta / steps;
        for (let i = 0; i < steps && !projectile.resting; i++) {
            projectile.velocity.y -= 12 * step;
            const next = projectile.position.clone().addScaledVector(projectile.velocity, step);
            let hit = sweepSphere(projectile.position, next, 0.065, this.colliders);
            if(hit?.box.villaPanel?.kind==='glass'){
                const panel=hit.box.villaPanel;panel.takeBulletHit({point:projectile.position.clone().lerp(next,hit.time)},34,projectile.velocity.clone().normalize());projectile.velocity.multiplyScalar(.75);hit=null;
            }
            if (hit && this.room && hit.box === this.room.doorBox) {
                const point = this.room.doorMesh.worldToLocal(projectile.position.clone().lerp(next, hit.time));
                const center = new THREE.Vector2(point.x, point.y);
                const blocked = this.room.doorPieces.some(piece => !this.room.brokenBoards.has(piece.id) && piece.bounds.distanceToPoint(center) < 0.065);
                if (!blocked) hit = null;
            }
            if (hit && this.room) {
                const pane = this.room.glassPanes.find(pane => pane.userData.collider === hit.box);
                if (pane && !pane.userData.shattered) {
                    this.room.shatterGlass(pane, { point: projectile.position.clone().lerp(next, hit.time) }, projectile.velocity.clone().normalize());
                    projectile.velocity.multiplyScalar(0.75);
                    hit = null;
                }
            }
            if (hit) {
                projectile.position.lerp(next, Math.max(0, hit.time - 0.002)).addScaledVector(hit.normal, 0.002);
                projectile.velocity.reflect(hit.normal).multiplyScalar(0.48);
                this.bounceSound(projectile);
            } else projectile.position.copy(next);
            if (projectile.position.y < 0.065) {
                projectile.position.y = 0.065;
                projectile.velocity.y = Math.abs(projectile.velocity.y) * 0.35;
                projectile.velocity.x *= 0.72; projectile.velocity.z *= 0.72;
                this.bounceSound(projectile);
                if (projectile.velocity.length() < 0.5) { projectile.resting = true; projectile.velocity.set(0, 0, 0); }
            }
            projectile.mesh.rotation.x += projectile.velocity.length() * step * 2;
            projectile.mesh.rotation.z += step * 3;
        }
    }
    bounceSound(projectile) {
        if (projectile.bounceCooldown <= 0 && projectile.velocity.length() > 1) {
            soundEngine.playUtility('bounce',projectile.position); projectile.bounceCooldown = 0.12;
        }
    }

    detonate(type, position) {
        this.scene.updateMatrixWorld(true);
        if (type === 'smoke') {
            if (this.clouds.length >= 3) this.clouds.shift().dispose(this.scene);
            let clip = null;
            if (this.room) {
                const r = this.room;
                const interior = new THREE.Box3(new THREE.Vector3(r.origin.x - 4.86, 0.05, r.frontZ + 0.14),
                    new THREE.Vector3(r.origin.x + 4.86, 3.16, r.origin.z + 3.86));
                if (interior.containsPoint(position)) clip = interior;
            }
            this.clouds.push(new SmokeCloud(this.scene, position, clip));
            this.message('SMOKE DEPLOYED');
        } else {
            const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.25, 12, 8), new THREE.MeshBasicMaterial({
                color: type === 'flash' ? 0xfff8df : 0xffa33b, transparent: true, depthWrite: false,
            }));
            mesh.position.copy(position); this.scene.add(mesh); this.bursts.push({ mesh, age: 0 });
            if (type === 'flash') this.flash(position);
            else this.explode(position);
        }
        soundEngine.playUtility(type,position);
    }

    flash(position) {
        const delta = position.clone().sub(this.camera.position), distance = delta.length();
        const facing = this.camera.getWorldDirection(new THREE.Vector3()).dot(delta.normalize());
        const exposure = flashExposure(distance, facing, hasLineOfSight(this.scene, position, this.camera.position));
        this.flashPeak = Math.max(this.flashPeak, exposure);
        if (exposure > 0.03) { this.flashRemaining = Math.max(this.flashRemaining, 0.3 + exposure * 3); this.message('FLASHED'); }
        for (const bot of this.bots?.bots || []) {
            if (!bot.isAlive) continue;
            const head = bot.position.clone().add(new THREE.Vector3(0, 1.55, 0));
            if (head.distanceTo(position) < 10 && hasLineOfSight(this.scene, position, head)) bot.flashTimer = 2.5;
        }
    }

    explode(position) {
        const radius = GRENADES.frag.radius;
        if(this.room?.damageExplosion)this.room.damageExplosion(position,radius);
        if (this.room && !this.room.damageExplosion) {
            for (const pane of this.room.glassPanes) {
                if (pane.userData.shattered) continue;
                const local = pane.worldToLocal(position.clone());
                local.set(THREE.MathUtils.clamp(local.x, -pane.userData.width / 2, pane.userData.width / 2),
                    THREE.MathUtils.clamp(local.y, -pane.userData.height / 2, pane.userData.height / 2), 0);
                const point = pane.localToWorld(local);
                if (point.distanceTo(position) < radius && hasLineOfSight(this.scene, position, point, new Set([pane]))) this.room.shatterGlass(pane, { point }, point.clone().sub(position).normalize());
            }
            if (!this.room.door.destroyed) {
                const ignore = new Set([this.room.doorMesh, ...this.room.doorHandle.children]);
                const point = this.room.doorMesh.localToWorld(new THREE.Vector3(0.56, 1.1, 0));
                const distance = point.distanceTo(position);
                if (distance < radius && hasLineOfSight(this.scene, position, point, ignore)) {
                    this.room.hitDoor({ point }, Math.max(40, 650 * (1 - distance / radius)), point.clone().sub(position).normalize());
                }
            }
        }
        for (const bot of this.bots?.bots || []) {
            if (!bot.isAlive) continue;
            const center = bot.position.clone().add(new THREE.Vector3(0, 0.9, 0));
            const distance = center.distanceTo(position);
            if (distance < radius && hasLineOfSight(this.scene, position, center)) {
                const damage = Math.round(160 * (1 - distance / radius));
                bot.takeDamage(damage, false, center.clone().sub(position).normalize(), center, 'frag');
                window.__triggerHitmarker?.(false, damage, center);
            }
        }
        const center = this.movement.position.clone().add(new THREE.Vector3(0, -0.5, 0));
        const distance = center.distanceTo(position);
        if (distance < radius && hasLineOfSight(this.scene, position, center)) {this.lastDamageDirection=center.clone().sub(position).normalize();this.damagePlayer(Math.round(160 * (1 - distance / radius)));}
        this.message(this.playerHealth > 0 ? 'FRAG DETONATED' : 'BLAST DOWN / RECOVERING');
    }

    damagePlayer(damage) {
        if (this.playerHealth <= 0) return;
        this.playerHealth = Math.max(0, this.playerHealth - damage);
        if(this.playerHealth>0)soundEngine.playPain();else soundEngine.playDeath();
        if (!this.playerHealth) {
            this.weapon.cancelReload();
            this.stow(true);
            this.respawnTimer = 2.5;
            this.movement.isDisabled = true;
            this.movement.resetInput();
            this.weapon.isAiming = false;
            this.weapon.pendingShotTime = 0;
        }
    }
    respawnPlayer() {
        this.stow(true);
        this.playerHealth = 100; this.movement.isDisabled = false;
        if(this.movement.spawnPosition){this.movement.position.copy(this.movement.spawnPosition);this.movement.position.y+=this.movement.standHeight;this.movement.yaw=this.movement.spawnYaw??0;}else this.movement.position.set(2, this.movement.standHeight, 34);
        this.movement.currentHeight = this.movement.standHeight;
        this.movement.velocity.set(0, 0, 0); this.movement.isCrouching = false;
        this.movement.resetInput(); this.weapon.cancelReload();
        this.weapon.ammoStores = createAmmoStores(); this.weapon.canShoot = true;
        this.counts = { frag: 2, flash: 2, smoke: 2 };
        this.flashRemaining = this.flashPeak = 0;
        this.message('RANGE RESUPPLIED');
    }
}
