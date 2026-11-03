import * as THREE from 'three';
import { createOperator } from '../models/TacticalOperator.js';
import { createSwatRig } from '../models/SwatRig.js';
import { loadSniperModel } from '../models/SniperModel.js';
import { loadPistolModel } from '../models/PistolModel.js';
import { soundEngine } from '../audio/SoundEngine.js';
import { SkeletalRagdoll } from '../models/SkeletalRagdoll.js';

const materialsOf = mesh => Array.isArray(mesh.material) ? mesh.material : [mesh.material];

export class BotManager {
    constructor(scene, colliders = [], {spawnPoints=null, persistDeaths=false}={}) {
        this.scene = scene;
        this.bots = [];
        this.colliders = colliders;
        this.persistDeaths = persistDeaths;

        this.spawnPoints = [
            new THREE.Vector3(-24, 3.75, 0),    // Catwalk left
            new THREE.Vector3(24, 3.75, 0),     // Catwalk right
            new THREE.Vector3(0, 7.4, -4),     // Center tower high perch
            new THREE.Vector3(-18, 0, -22),    // Ground container alley
            new THREE.Vector3(18, 0, 22),      // Ground crate cluster
            new THREE.Vector3(0, 0, -32),      // Far sniper lane
            new THREE.Vector3(-32, 0, 16)      // Jump pad flank
        ];

        if(spawnPoints)this.spawnPoints=spawnPoints.map(p=>p.clone());
        this.indoor=!!spawnPoints;
        this.botNames = ['Viper', 'Ghost', 'Phantom', 'Apex', 'Ranger', 'Hawkeye', 'Zero'];

        this.init();
    }

    async init() {
        this.ready = false;
        for (let i = 0; i < this.spawnPoints.length; i++) {
            try {
                const rig = await createSwatRig();
                if (i >= this.spawnPoints.length - 2) {
                    rig.attachAnimatedModel(await loadPistolModel(), 'pistol');
                    rig.update(0, { speed: 0 });
                } else rig.attachRifle(await loadSniperModel());
                this.spawnBot(this.botNames[i], this.spawnPoints[i], rig);
            } catch (error) {
                console.error('SWAT character could not load.', error);
                this.spawnBot(this.botNames[i], this.spawnPoints[i]);
            }
        }
        this.ready = true;
    }

    spawnBot(name, spawnPos, rig = null) {
        const root = rig ? rig.object : createOperator(this.bots.length);
        root.traverse(mesh => {
            if (!mesh.isMesh) return;
            mesh.material = Array.isArray(mesh.material) ? mesh.material.map(m => m.clone()) : mesh.material.clone();
        });
        root.position.copy(spawnPos);
        this.scene.add(root);
        const bot = new Bot(name, root, spawnPos, this.scene, this.colliders, rig);
        bot.persistDeath = this.persistDeaths;
        if(this.indoor)bot.patrolRadius=1.5;
        this.bots.push(bot);
    }

    update(delta, playerPos) {
        for (const bot of this.bots) {
            bot.update(delta, playerPos);
        }
    }
}

class Bot {
    constructor(name, model, spawnPos, scene, colliders, rig) {
        this.colliders = colliders;
        this.rig = rig;
        this.legs = model.userData.legs || [];
        this.motionTime = Math.random() * 10;
        this.poseElapsed = Math.random() / 20;
        this.slideTime = 0;
        this.isSliding = false;
        this.isSprinting = false;
        this.stride = Math.random() * Math.PI * 2;
        this.name = name;
        this.model = model;
        this.spawnPos = spawnPos.clone();
        this.position = this.model.position;
        this.scene = scene;

        this.maxHp = 100;
        this.hp = this.maxHp;
        this.isAlive = true;
        this.respawnTimer = 0;

        // AI Movement
        this.patrolCenter = this.spawnPos.clone();
        this.targetPos = this.spawnPos.clone();
        this.patrolRadius = spawnPos.y > 0 ? 2.5 : 7.0;
        this.speed = 2.4 + Math.random() * 0.6;
        this.moveTimer = 0;

        // Animation / Hit flash
        this.flashTime = 0;
        this.deathRotation = 0;

        // Setup Hitboxes
        this.model.traverse((c) => {
            if (c.isMesh) {
                c.userData.isShootable = rig ? c.isSkinnedMesh === true : true;
                c.userData.bot = this;
                // Identify head vs body
                if (!this.rig && (c.name.toLowerCase().includes('head') || c.position.y > 1.5)) {
                    c.userData.isHead = true;
                }
            }
        });
    }

    takeDamage(amount, isHeadshot, hitDirection,hitPoint=null,weapon='pistol') {
        if (!this.isAlive) return;

        this.hp -= amount;
        if(this.hp>0)soundEngine.playPain(this.position);
        this.flashTime = 0.15;
        this.rig?.animator?.trigger('hit');
        if(this.rig){
            let bone=isHeadshot?'Neck':'Spine2';
            if(hitPoint?.isVector3&&!isHeadshot){let distance=Infinity;for(const name of ['Spine2','LeftArm','RightArm','LeftUpLeg','RightUpLeg']){const d=this.rig.bones[name].getWorldPosition(new THREE.Vector3()).distanceToSquared(hitPoint);if(d<distance){bone=name;distance=d;}}}
            const local=(hitDirection||new THREE.Vector3(0,0,1)).clone().applyQuaternion(this.model.getWorldQuaternion(new THREE.Quaternion()).invert());
            this.rig.hitKick={bone,amount:Math.min(.22,amount*.002),side:-local.x,pitch:local.z,remaining:.22};
        }

        // Flash mesh white/red
        this.model.traverse((c) => {
            if (c.isMesh && c.material) {
                for (const material of materialsOf(c)) {
                    material.emissive.setHex(0x772222);
                    material.emissiveIntensity = 0.1;
                }
            }
        });

        if (this.hp <= 0) {
            this.die(isHeadshot, hitDirection,hitPoint,weapon);
        }
    }

    die(isHeadshot, hitDirection,hitPoint,weapon) {
        soundEngine.playDeath(this.position);
        this.isAlive = false;
        this.respawnTimer = this.persistDeath ? Infinity : 5;
        if(this.rig)this.ragdoll=new SkeletalRagdoll(this.rig,this.colliders,hitDirection||new THREE.Vector3(),hitPoint?.isVector3?hitPoint:null,weapon==='primary'?1.8:weapon==='frag'?2.4:1);

        soundEngine.playKill();

        if (window.__recordKill) {
            window.__recordKill(this.name, isHeadshot);
        }
    }

    respawn() {
        this.ragdoll=null;this.rig?.reset();if(this.rig){if(this.rig.animator){this.rig.animator.authoredPose=null;this.rig.animator.presentedPose=null;}this.rig.hitKick=null;}
        this.isAlive = true;
        this.hp = this.maxHp;
        this.deathRotation = 0;
        if (this.rig?.animator) { this.rig.animator.actionRemaining = 0; this.rig.animator.play(this.rig.animatedKind === 'pistol' ? 'pistolIdle' : 'idle', { fade: 0 }); }

        // Reset transform
        this.position.copy(this.spawnPos);
        this.previousPosition = this.position.clone();
        this.model.rotation.set(0, Math.random() * Math.PI * 2, 0);

        this.model.traverse((c) => {
            if (c.isMesh && c.material) {
                for (const material of materialsOf(c)) {
                    material.emissive.setHex(0x000000);
                    material.emissiveIntensity = 0;
                }
            }
        });
    }

    update(delta, playerPos) {
        this.motionTime += delta;
        if (this.isAlive && this.flashTimer > 0) {
            this.flashTimer = Math.max(0, this.flashTimer - delta);
            this.rig?.update(delta, { speed: 0, isGrounded: true });
            return;
        }
        // Hit flash decay
        if (this.flashTime > 0) {
            this.flashTime -= delta;
            if (this.flashTime <= 0) {
                this.model.traverse((c) => {
                    if (c.isMesh && c.material) {
                        for (const material of materialsOf(c)) {
                            material.emissive.setHex(0x000000);
                            material.emissiveIntensity = 0;
                        }
                    }
                });
            }
        }

        if (!this.isAlive) {
            if(this.ragdoll){this.ragdoll.update(delta);this.respawnTimer-=delta;if(this.respawnTimer<=0)this.respawn();return;}
            // Death Ragdoll Collapse / Fall
            if (this.deathRotation < Math.PI / 2) {
                this.deathRotation += delta * 6.0;
                this.model.rotation.x = this.deathRotation;
            }

            this.respawnTimer -= delta;
            if (this.respawnTimer <= 0) {
                this.respawn();
            }
            return;
        }

        // AI Patrol & Strafe
        this.moveTimer -= delta;
        if (this.moveTimer <= 0) {
            this.moveTimer = 2.0 + Math.random() * 2.5;
            // Pick new waypoint near patrol center
            const angle = Math.random() * Math.PI * 2;
            const dist = Math.random() * this.patrolRadius;
            this.targetPos.set(
                this.patrolCenter.x + Math.cos(angle) * dist,
                this.patrolCenter.y,
                this.patrolCenter.z + Math.sin(angle) * dist
            );
        }

        // Move towards target waypoint
        const dir = new THREE.Vector3().subVectors(this.targetPos, this.position);
        dir.y = 0;
        const distToTarget = dir.length();

        if (distToTarget > 0.3) {
            dir.normalize();
            const next = this.position.clone().addScaledVector(dir, Math.min(distToTarget, this.speed * delta));
            const blocked = this.colliders.some(box =>
                box.max.y > next.y + 0.15 && box.min.y < next.y + 1.8 &&
                next.x > box.min.x - 0.35 && next.x < box.max.x + 0.35 &&
                next.z > box.min.z - 0.35 && next.z < box.max.z + 0.35);
            if (blocked) {
                this.moveTimer = 0;
            } else {
                this.position.copy(next);
                this.stride += delta * this.speed * 3.8;
            }
            // Alternate weighted strides; shoulders keep the rifle on target.
            for (let i = 0; i < this.legs.length; i++) {
                this.legs[i].rotation.x = blocked ? 0 : Math.sin(this.stride + i * Math.PI) * 0.42;
            }
            const look = playerPos || this.targetPos;
            const targetYaw = Math.atan2(look.x - this.position.x, look.z - this.position.z);
            const angle = Math.atan2(Math.sin(targetYaw - this.model.rotation.y), Math.cos(targetYaw - this.model.rotation.y));
            this.model.rotation.y += angle * Math.min(1, delta * 9);
        }
        const moved = this.position.distanceTo(this.previousPosition || this.position);
        const displacement = this.position.clone().sub(this.previousPosition || this.position);
        const sin = Math.sin(this.model.rotation.y), cos = Math.cos(this.model.rotation.y);
        const forward = displacement.x * sin + displacement.z * cos;
        const lateral = displacement.x * cos - displacement.z * sin;
        const actualSpeed = delta > 0 ? moved / delta : 0;
        this.previousPosition = this.position.clone();
        const lookingAt = playerPos ? Math.atan2(playerPos.y - (this.position.y + 1.5), Math.max(1, this.position.distanceTo(playerPos))) : 0;
        this.poseElapsed += delta;
        const distance = playerPos ? this.position.distanceTo(playerPos) : 0;
        // Nearby characters animate on every rendered frame; distant bodies retain
        // throttling to bound CPU skin/IK work.
        const poseInterval = distance < 45 ? 0 : 1 / 30;
        if (this.poseElapsed >= poseInterval) {
            this.rig?.update(this.poseElapsed, { speed: actualSpeed, isGrounded: true,
                lean:this.lean || 0,
                forward, lateral,
                isSprinting: this.isSprinting, isSliding: this.isSliding, aimPitch: lookingAt });
            this.poseElapsed = 0;
        }
    }
}
