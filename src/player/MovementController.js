import * as THREE from 'three';
import { soundEngine } from '../audio/SoundEngine.js';
import {planVault} from './VaultTraversal.js';
import { TACTICAL } from './TacticalTuning.js';

// Keys the game owns while the pointer is locked. Tab and the Alt chords otherwise reach the browser.
const BROWSER_GUARD_KEYS = new Set([
    'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyC', 'KeyQ', 'KeyE', 'KeyR', 'KeyX', 'KeyF',
    'Space', 'ShiftLeft', 'ShiftRight', 'AltLeft', 'AltRight', 'Tab',
    'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'KeyG', 'KeyV',
    'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'
]);

export class MovementController {
    constructor(camera, domElement, { input = true } = {}) {
        this.camera = camera;
        this.domElement = domElement;

        Object.assign(this, TACTICAL);
        this.isAiming = false;
        this.isReloading = false;
        this.sprintRecovery = 0;
        this.sprintInterruptTimer = 0;
        this.slideCooldownTimer = 0;
        this.jumpCooldown = 0;
        this.lastColliders = [];

        // Heights
        this.standHeight = 1.65;
        this.slideHeight = 0.75;
        this.crouchHeight = 1.05;
        this.currentHeight = this.standHeight;

        // State
        this.position = new THREE.Vector3(2, this.standHeight, 34);
        this.velocity = new THREE.Vector3();
        this.isGrounded = false;
        this.isSprinting = false;
        this.isCrouchRunning = false;
        this.isSliding = false;
        this.isCrouching = false;
        this.isWalking = false;
        this.stepDistance = 0;
        this.slideTimer = 0;
        this.slideMaxDuration = TACTICAL.slideMaxDuration;
        this.slideDirection = new THREE.Vector3();
        this.coyoteTime = 0;

        // Rotation & Mouse Look
        this.pitch = 0;
        this.yaw = Math.PI;
        this.mouseSensitivity = 0.0022;
        this.hipSensitivity = 1;
        this.adsSensitivity = 1;
        this.invertY = false;
        this.scopeFov = 22;
        this.isLocked = false;

        // Key states
        this.keys = {
            forward: false,
            backward: false,
            left: false,
            right: false,
            sprint: false,
            jump: false,
            slide: false,
            walk: false,
            crouch: false,
            leanLeft: false,
            leanRight: false
        };

        // Peek / lean (Q left, E right)
        this.leanMaxOffset = TACTICAL.leanMaxOffset;
        this.leanMaxRoll = TACTICAL.leanMaxRoll;
        this.leanMaxDip = 0.055;
        this.lean = 0;
        this.leanTarget = 0;
        this.leanOffset = 0;

        // Camera Effects
        this.baseFov = 85;
        this.currentFov = 85;
        this.targetFov = 85;
        this.cameraRoll = 0;
        this.bobTime = 0;
        this.bobAmount = 0;

        // Mouse look delta for weapon sway
        this.mouseDelta = { x: 0, y: 0 };

        if (input) { this.setupPointerLock(); this.setupKeyboard(); }
        this.camera.position.copy(this.position);
    }

    setupPointerLock() {
        this.domElement.addEventListener('click', () => {
            if (!this.isLocked) {
                this.domElement.requestPointerLock();
            }
        });

        document.addEventListener('pointerlockchange', () => {
            this.isLocked = document.pointerLockElement === this.domElement;
            if (!this.isLocked) this.resetInput();
        });
        window.addEventListener('blur', () => this.resetInput());

        document.addEventListener('mousemove', (e) => {
            if (!this.isLocked || this.isDisabled) return;

            const movementX = e.movementX || 0;
            const movementY = e.movementY || 0;

            // Scale with the live FOV so a scoped turn covers the same screen pixels as a hipfire turn.
            // Without this, the 22-degree ADS view turns ~4.7x faster per mouse count than the 85-degree view.
            const adsBlend = this.getAdsBlend();
            const zoomScale = THREE.MathUtils.lerp(1,
                Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2) /
                Math.tan(THREE.MathUtils.degToRad(this.baseFov) / 2),
                adsBlend);
            const userScale = THREE.MathUtils.lerp(this.hipSensitivity, this.adsSensitivity, adsBlend);
            const sensitivity = this.mouseSensitivity * zoomScale * userScale;

            this.yaw -= movementX * sensitivity;
            this.pitch -= movementY * sensitivity * (this.invertY ? -1 : 1);

            // Clamp pitch (-89 to 89 degrees)
            this.pitch = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, this.pitch));

            // Record delta for weapon inertia sway
            this.mouseDelta.x += movementX;
            this.mouseDelta.y += movementY;
        });
    }

    // 0 while hipfiring, 1 when fully scoped; derived from the rendered FOV.
    getAdsBlend() {
        return THREE.MathUtils.clamp((this.baseFov - this.camera.fov) / (this.baseFov - this.scopeFov), 0, 1);
    }

    setupKeyboard() {
        window.addEventListener('keydown', (e) => {
            if (!this.isLocked) return;
            // Pointer lock does not stop the browser's own shortcuts. Swallow every game key, Tab,
            // and any Alt chord so Alt+D / Alt+Left / Tab cannot steal focus and drop the lock.
            if (e.key === 'Tab' || e.altKey || e.ctrlKey || e.metaKey || BROWSER_GUARD_KEYS.has(e.code)) e.preventDefault();
            this.onKeyChange(e.code, true);
        });

        window.addEventListener('keyup', (e) => {
            if (!this.isLocked) return;
            // On Windows the Alt menu is opened on release, so guard the release as well.
            if (e.key === 'Tab' || e.altKey || e.code === 'AltLeft' || e.code === 'AltRight') e.preventDefault();
            this.onKeyChange(e.code, false);
        });
    }

    resetInput() {
        this.isCrouchRunning = false;
        for (const key of Object.keys(this.keys)) this.keys[key] = false;
        this.mouseDelta.x = 0;
        this.mouseDelta.y = 0;
        this.isSprinting = false;
        this.lean = this.leanTarget = this.leanOffset = 0;
        this.sprintRecovery = 0;
        this.cancelSlide();
    }

    onKeyChange(code, isDown) {
        if (this.isDisabled) return;
        switch (code) {
            case 'KeyW':
            case 'ArrowUp':
                this.keys.forward = isDown;
                break;
            case 'KeyS':
            case 'ArrowDown':
                this.keys.backward = isDown;
                break;
            case 'KeyA':
            case 'ArrowLeft':
                this.keys.left = isDown;
                break;
            case 'KeyD':
            case 'ArrowRight':
                this.keys.right = isDown;
                break;
            case 'ShiftLeft':
            case 'ShiftRight':
                this.keys.sprint = isDown;
                break;
            case 'Space':
                if (isDown && !this.keys.jump) {
                    this.handleJump();
                }
                this.keys.jump = isDown;
                break;
            case 'KeyC':
                if (isDown && !this.keys.slide) {
                    this.handleSlidePress();
                }
                this.keys.slide = isDown;
                break;
            case 'KeyQ':
                this.keys.leanLeft = isDown;
                break;
            case 'KeyE':
                this.keys.leanRight = isDown;
                break;
            case 'AltLeft':
            case 'AltRight':
                this.keys.walk = isDown;
                break;
            case 'KeyX':
                if (isDown && !this.keys.crouch) this.toggleCrouch();
                this.keys.crouch = isDown;
                break;
        }
    }

    handleSlidePress() {
        if (this.isSliding) {
            this.cancelSlide();
            this.isCrouching = true;
            return;
        }
        if (this.isGrounded && this.isSprinting && !this.isAiming && !this.isReloading && !this.isThrowing &&
            this.slideCooldownTimer <= 0 && this.getSpeed() > this.sprintSpeed * 0.85) {
            this.startSlide();
        } else {
            this.toggleCrouch();
        }
    }

    startSlide() {
        this.isSliding = true;
        this.isCrouching = false;
        this.slideTimer = 0;
        this.slideCooldownTimer = this.slideCooldown;
        const speed = Math.min(this.slideInitialSpeed, this.getSpeed());
        this.slideDirection.set(this.velocity.x, 0, this.velocity.z);
        if (this.slideDirection.lengthSq() < 0.001) this.slideDirection.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
        this.slideDirection.normalize();
        this.velocity.x = this.slideDirection.x * speed;
        this.velocity.z = this.slideDirection.z * speed;
        soundEngine.playSlide();
    }

    cancelSlide() {
        this.isSliding = false;
        this.slideTimer = 0;
    }

    canStand(colliders = this.lastColliders) {
        const feet = this.position.y - this.currentHeight;
        return !colliders.some(box => !box.ramp &&
            this.position.x > box.min.x - 0.4 && this.position.x < box.max.x + 0.4 &&
            this.position.z > box.min.z - 0.4 && this.position.z < box.max.z + 0.4 &&
            box.min.y < feet + this.standHeight + 0.05 && box.max.y > this.position.y + 0.02);
    }

    toggleCrouch() {
        if (this.isSliding) this.cancelSlide();
        if (this.isCrouching && !this.canStand()) return false;
        this.isCrouching = !this.isCrouching;
        return true;
    }

    requestWeaponReady() {
        if (this.isSprinting || this.isSliding) this.sprintRecovery = this.sprintReadyTime;
        this.sprintInterruptTimer = 0.4;
        this.isSprinting = false;
        if (this.isSliding) {
            this.cancelSlide();
            this.isCrouching = true;
        }
    }

    handleJump() {
        if(this.jumpCooldown>0||this.vault||this.isSliding)return;
        this.vaultIntent=.24;this.vaultProbeTimer=0;
        if(this.isGrounded&&this.keys.forward){
            const vault=planVault(this.position,this.currentHeight,this.yaw,this.lastColliders,this.getSpeed());
            if(vault){this.vault=vault;this.vaultIntent=0;this.jumpCooldown=.55;this.isGrounded=false;this.coyoteTime=0;soundEngine.playJump();return;}
        }
        if(this.isCrouching)return;
        if (this.isGrounded || this.coyoteTime > 0) {
            this.velocity.y = this.jumpForce;
            const speed = this.getSpeed();
            this.airSpeedLimit=Math.max(this.runSpeed,Math.min(this.sprintSpeed,speed));
            if(speed>this.airSpeedLimit){this.velocity.x*=this.airSpeedLimit/speed;this.velocity.z*=this.airSpeedLimit/speed;}
            this.jumpCooldown = 0.55;
            this.isGrounded = false;
            this.coyoteTime = 0;
            soundEngine.playJump();
        }
    }

    update(delta, colliders = [], jumpPads = []) {
        delta = Math.max(0, Math.min(delta, 0.1));
        this.lastColliders = colliders;
        this.slideCooldownTimer = Math.max(0, this.slideCooldownTimer - delta);
        this.sprintInterruptTimer = Math.max(0, this.sprintInterruptTimer - delta);
        this.sprintRecovery = Math.max(0, this.sprintRecovery - delta);
        this.jumpCooldown = Math.max(0, this.jumpCooldown - delta);

        this.vaultIntent=Math.max(0,(this.vaultIntent||0)-delta);
        this.vaultProbeTimer=Math.max(0,(this.vaultProbeTimer||0)-delta);
        if(!this.vault&&this.vaultIntent>0&&this.keys.forward&&this.vaultProbeTimer===0){
            this.vaultProbeTimer=.05;
            const vault=planVault(this.position,this.currentHeight,this.yaw,colliders,this.getSpeed());
            if(vault){this.vault=vault;this.vaultIntent=0;this.isGrounded=false;this.coyoteTime=0;}
        }

        // 1. Horizontal Input & Direction
        const moveDir = new THREE.Vector3();
        if (this.keys.forward) moveDir.z -= 1;
        if (this.keys.backward) moveDir.z += 1;
        if (this.keys.left) moveDir.x -= 1;
        if (this.keys.right) moveDir.x += 1;

        if (moveDir.lengthSq() > 0) {
            moveDir.normalize();
            moveDir.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw);
        }

        // Slow states: holding Alt walks quietly, X toggles a crouch. Both cancel sprinting.
        this.isWalking = this.keys.walk && !this.isCrouching && !this.isSliding;

        const wantsLean = this.keys.leanLeft !== this.keys.leanRight;
        this.isCrouchRunning = this.isCrouching && this.keys.sprint && moveDir.lengthSq()>0 &&
            this.isGrounded && !this.isSliding && !this.keys.walk && !this.isAiming && !this.isReloading &&
            !this.isThrowing && !wantsLean && this.sprintInterruptTimer<=0;
        const wasSprinting = this.isSprinting;
        this.isSprinting = this.keys.sprint && this.keys.forward && !this.keys.backward && !this.isSliding &&
            !this.isCrouching && !this.keys.walk && this.isGrounded && !this.isAiming && !this.isReloading && !this.isThrowing &&
            !wantsLean && this.sprintInterruptTimer <= 0 && this.getAdsBlend() < 0.15;
        if (wasSprinting && !this.isSprinting) this.sprintRecovery = this.sprintReadyTime;

        // Water occupies a bounded vertical volume, not the entire column below
        // its surface. In particular, an upstairs tub cannot wet the room below.
        const waterFeet = this.position.y - this.currentHeight;
        this.isWading=!!colliders.waterAreas?.some(a=>this.position.x>a.minX&&this.position.x<a.maxX&&this.position.z>a.minZ&&this.position.z<a.maxZ&&waterFeet>=a.bottom-.03&&waterFeet<a.surface-.1);

        // 2. Movement state updates
        if (this.isSliding) {
            this.slideTimer += delta;

            // Decelerate slide
            const currentSpeed = Math.hypot(this.velocity.x, this.velocity.z);
            const newSpeed = Math.max(this.slideMinSpeed, currentSpeed - this.slideDecel * delta);

            // Allow subtle steering during slide
            if (moveDir.lengthSq() > 0) {
                this.slideDirection.lerp(moveDir, delta * 0.7).normalize();
            }

            this.velocity.x = this.slideDirection.x * newSpeed;
            this.velocity.z = this.slideDirection.z * newSpeed;

            // Slide ends if timer runs out or player stops moving
            if (this.slideTimer >= this.slideMaxDuration) {
                this.cancelSlide();
                this.isCrouching = true;
            }
        } else if (this.isGrounded) {
            // Normal Ground Movement
            let targetSpeed = this.isCrouching ? (this.isCrouchRunning ? this.crouchRunSpeed : this.crouchSpeed)
                : this.isWalking ? this.slowWalkSpeed
                : this.isSprinting ? this.sprintSpeed : this.runSpeed;
            if (this.isAiming) targetSpeed = Math.min(targetSpeed, this.aimedSpeed);
            if (wantsLean || Math.abs(this.lean) > 0.2) targetSpeed = Math.min(targetSpeed, this.leanSpeed);
            if (this.isReloading) targetSpeed = Math.min(targetSpeed, 2.4);
            if (this.keys.backward) targetSpeed *= 0.8;
            else if (!this.keys.forward && (this.keys.left || this.keys.right)) targetSpeed *= 0.9;
            if(this.isWading)targetSpeed*=.58;
            const targetVx = moveDir.x * targetSpeed;
            const targetVz = moveDir.z * targetSpeed;

            const accel = moveDir.lengthSq() === 0 ? 24 : this.isSprinting ? 10 : 16;
            this.velocity.x = THREE.MathUtils.damp(this.velocity.x, targetVx, accel, delta);
            this.velocity.z = THREE.MathUtils.damp(this.velocity.z, targetVz, accel, delta);
        } else {
            // Limited airborne steering, without accumulating extra horizontal speed.
            if (moveDir.lengthSq() > 0) {
                const airAccel = 2.0;
                this.velocity.x += moveDir.x * airAccel * delta;
                this.velocity.z += moveDir.z * airAccel * delta;

                // Preserve takeoff momentum, but never accelerate beyond that speed in air.
                const horizSpeed = Math.hypot(this.velocity.x, this.velocity.z);
                const maxAirSpeed = this.airSpeedLimit || this.runSpeed;
                if (horizSpeed > maxAirSpeed) {
                    this.velocity.x = (this.velocity.x / horizSpeed) * maxAirSpeed;
                    this.velocity.z = (this.velocity.z / horizSpeed) * maxAirSpeed;
                }
            }
        }

        // Keep feet fixed as eye height changes during a slide or crouch.
        const previousHeight = this.currentHeight;
        const targetHeight = this.vault ? this.vault.height : this.isSliding ? this.slideHeight
            : this.isCrouching ? this.crouchHeight
            : this.standHeight;
        this.currentHeight = THREE.MathUtils.damp(this.currentHeight, targetHeight, 14.0, delta);
        this.position.y += this.currentHeight - previousHeight;

        if(this.vault){
            const vault=this.vault;vault.time=Math.min(vault.duration,vault.time+delta);
            const next=vault.at(vault.time/vault.duration);
            if(delta>0)this.velocity.copy(next.sub(this.position).divideScalar(delta));
            this.velocity.y+=this.gravity*delta;
            if(vault.time>=vault.duration){this.vault=null;this.vaultExitVelocity=vault.exitVelocity;}
        }

        // 3. Gravity
        const wasGroundedBeforeMove = this.isGrounded;
        this.velocity.y -= this.gravity * delta;

        // 4. Position Integration & Collisions
        const prevY = this.position.y;
        this.position.x += this.velocity.x * delta;
        this.position.z += this.velocity.z * delta;
        this.position.y += this.velocity.y * delta;

        // Simple world bounds & ground check
        const groundY = 0;
        let onGroundNow = false;

        // Basic arena floor & obstacle collision
        if (this.position.y <= groundY + this.currentHeight) {
            this.position.y = groundY + this.currentHeight;
            if (this.velocity.y < -5.0) {
                soundEngine.playLand();
            }
            this.velocity.y = 0;
            onGroundNow = true;
        }

        // Box Colliders
        for (const col of colliders) {
            // Cull distant leaves before matrix inversions and local-space collision.
            if(this.position.x+.45<col.min.x||this.position.x-.45>col.max.x||this.position.z+.45<col.min.z||this.position.z-.45>col.max.z)continue;
            if (this.resolveBoxCollision(col, prevY - this.currentHeight)) onGroundNow = true;
        }

        // Descending a slope moves the support surface down faster than a single
        // gravity step. Follow a nearby lower tread instead of entering jump/fall
        // between contacts. Jumps and larger ledges keep normal airborne physics.
        if (!onGroundNow && wasGroundedBeforeMove && this.velocity.y <= 0) {
            onGroundNow = this.snapDownToSupport(colliders, prevY - this.currentHeight);
        }

        // Test feet after floor resolution, and only launch when descending.
        for (const pad of jumpPads) {
            const dist = Math.hypot(this.position.x - pad.x, this.position.z - pad.z);
            const feet = this.position.y - this.currentHeight;
            if (this.velocity.y <= 0 && dist < pad.radius && Math.abs(feet - pad.y) < 0.35) {
                this.velocity.y = pad.force || 24.0;
                onGroundNow = false;
                this.coyoteTime = 0;
                soundEngine.playJumpPad();
                break;
            }
        }

        if(this.vaultExitVelocity){
            this.velocity.x=this.vaultExitVelocity.x;this.velocity.z=this.vaultExitVelocity.z;
            this.airSpeedLimit=Math.max(this.runSpeed,this.vaultExitVelocity.length());
            this.vaultExitVelocity=null;
        }

        // Update ground & coyote time
        if (onGroundNow) {
            this.isGrounded = true;
            this.coyoteTime = 0.12;
        } else {
            this.isGrounded = false;
            this.coyoteTime = Math.max(0, this.coyoteTime - delta);
            if (this.isSliding) {
                // airborne cancels slide
                this.isSliding = false;
            }
        }

        // 6. Camera Tilt & FOV Effects
        // Strafe roll
        let targetRoll = 0;
        if (this.keys.left) targetRoll += 0.008;
        if (this.keys.right) targetRoll -= 0.008;
        if (this.isSliding) targetRoll += 0.018;
        this.cameraRoll = THREE.MathUtils.damp(this.cameraRoll, targetRoll, 10.0, delta);

        // Head bobbing
        const speed = Math.hypot(this.velocity.x, this.velocity.z);
        const bobTarget = this.isCrouchRunning ? .012 : this.isCrouching ? 0.006 : this.isWalking ? 0.008 : this.isSprinting ? 0.03 : 0.015;
        if (this.isGrounded && speed > 0.4 && !this.isSliding) {
            const bobFreq = this.isSprinting ? 14 : this.isCrouchRunning ? 10 : this.isWalking || this.isCrouching ? 7 : 10;
            this.bobTime += delta * bobFreq;
            this.bobAmount = THREE.MathUtils.damp(this.bobAmount, bobTarget, 8.0, delta);
        } else {
            this.bobAmount = THREE.MathUtils.damp(this.bobAmount, 0, 10.0, delta);
        }

        // Footsteps follow the stride: sprint stomps, running is normal, slow walking is barely audible,
        // and crouching is silent.
        if (!this.footstepsFromAnimation && this.isGrounded && !this.isSliding && speed > 0.6) {
            this.stepDistance += speed * delta;
            const strideLength = this.isSprinting ? 2.4 : this.isCrouching ? 1.5 : this.isWalking ? 1.35 : 1.9;
            if (this.stepDistance >= strideLength) {
                this.stepDistance = 0;
                if (!this.isCrouching) {
                    soundEngine.playFootstep(this.isWalking ? 'walk' : this.isSprinting ? 'sprint' : 'run','Left',this.isWading);
                }
            }
        } else {
            this.stepDistance = 0;
        }

        const steady = (this.isAiming || Math.abs(this.lean) > 0.1) ? 0.25 : 1;
        const bobY = Math.sin(this.bobTime) * this.bobAmount * steady;
        const bobX = Math.cos(this.bobTime * 0.5) * this.bobAmount * 0.35 * steady;

        // Peek / lean: slide the eye sideways and roll the head, stopping at cover.
        this.leanTarget = this.isGrounded && !this.isSliding
            ? (this.keys.leanRight ? 1 : 0) - (this.keys.leanLeft ? 1 : 0) : 0;
        this.lean = THREE.MathUtils.damp(this.lean, this.leanTarget, 9, delta);
        const leanRight = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
        const leanWanted = this.lean * this.leanMaxOffset;
        const requestedDip = -Math.abs(this.lean) * this.leanMaxDip;
        this.leanOffset = this.resolveLean(leanWanted, leanRight, bobX, bobY + requestedDip, colliders);
        this.effectiveLean = this.leanOffset / this.leanMaxOffset;
        const leanDip = -Math.abs(this.effectiveLean) * this.leanMaxDip;
        this.camera.position.set(this.position.x + bobX, this.position.y + bobY + leanDip, this.position.z)
            .addScaledVector(leanRight, this.leanOffset);
        this.camera.rotation.order = 'YXZ';
        this.camera.rotation.y = this.yaw;
        this.camera.rotation.x = this.pitch;
        this.camera.rotation.z = this.cameraRoll - this.effectiveLean * this.leanMaxRoll;

        // Dynamic FOV for speed sensation
        let desiredFov = this.baseFov;
        if (this.isSprinting) desiredFov += 2;
        this.currentFov = THREE.MathUtils.damp(this.currentFov, desiredFov, 8.0, delta);

        // Decay mouse delta for weapon sway
        this.mouseDelta.x *= 0.82;
        this.mouseDelta.y *= 0.82;
    }

    // Sweep a head volume analytically: no stepped offsets and no gaps through thin cover.
    resolveLean(distance, direction, bobX = 0, bobY = 0, colliders = []) {
        if (!distance || !colliders.length) return distance;
        const origin = new THREE.Vector3(this.position.x + bobX, this.position.y + bobY, this.position.z);
        const ray = new THREE.Ray(origin, direction.clone().multiplyScalar(Math.sign(distance)));
        const expanded = new THREE.Box3();
        const point = new THREE.Vector3();
        let allowed = Math.abs(distance);
        for (const box of colliders) {
            expanded.copy(box).expandByScalar(0.12);
            if (expanded.containsPoint(origin)) return 0;
            if (ray.intersectBox(expanded, point)) allowed = Math.min(allowed, Math.max(0, origin.distanceTo(point) - 0.015));
        }
        return Math.sign(distance) * allowed;
    }

    snapDownToSupport(colliders, previousFeet, maxDrop = 0.35) {
        const feet = this.position.y - this.currentHeight;
        let support = -Infinity;
        const consider = height => {
            if (height <= feet + .001 && previousFeet >= height - .001 && feet - height <= maxDrop) support = Math.max(support, height);
        };
        consider(0);
        for (const box of colliders) {
            if (box.doorGroup||box.noStep||box.supportMesh?.userData.breakable?.isDoor) continue;
            if (box.ramp) {
                const ramp = box.ramp;
                const local = this.position.clone().sub(ramp.position).applyAxisAngle(new THREE.Vector3(0,1,0), -ramp.rotation);
                if (Math.abs(local.x) <= ramp.width / 2 && Math.abs(local.z) <= ramp.length / 2) consider(ramp.position.y + ramp.height * (.5 - local.z / ramp.length));
            } else if (this.position.x >= box.min.x && this.position.x <= box.max.x && this.position.z >= box.min.z && this.position.z <= box.max.z) consider(box.max.y);
        }
        if (!Number.isFinite(support)) return false;
        this.position.y = support + this.currentHeight;
        this.velocity.y = 0;
        return true;
    }

    resolveBoxCollision(box, previousFeet = this.position.y - this.currentHeight, allowStep = true) {
        if(box.doorGroup){
            // Resolve against the leaf in its own coordinates. Its world AABB
            // encloses empty space when rotated and must not become an invisible wall.
            const group=box.doorGroup,world=this.position.clone(),velocity=this.velocity.clone();
            group.updateWorldMatrix(true,false);this.position.copy(group.worldToLocal(world.clone()));
            // Replicated leaves can carry a matrix without local transform
            // fields. Read the world frame for both previous feet and velocity.
            const rotation=group.getWorldQuaternion(new THREE.Quaternion());
            const localFeet=group.worldToLocal(new THREE.Vector3(world.x,previousFeet,world.z)).y;
            this.velocity.applyQuaternion(rotation.clone().invert());
            // A hinged leaf (including its low fracture cells) is a moving
            // obstacle, never a stair tread. Multiple cells otherwise ratchet
            // the player upward as the leaf sweeps through the capsule.
            const grounded=this.resolveBoxCollision(box.doorBounds,localFeet,false);
            this.position.copy(group.localToWorld(this.position.clone()));this.position.y=world.y;this.velocity.applyQuaternion(rotation);this.velocity.y=velocity.y;
            if(this.position.distanceToSquared(world)<1e-12)this.velocity.copy(velocity);
            return grounded;
        }
        if(box.stairRail){const r=box.stairRail,surface=r.base+r.rise*(.5-(this.position.z-r.z)/r.length);if(this.position.y<surface-.02||this.position.y-this.currentHeight>surface+1.1)return false;}
        const panel=box.supportMesh?.userData.breakable;
        // Hinged leaves must never lift the player. Once detached, low door
        // remnants use the same step clearance as other fallen objects.
        allowStep=allowStep&&!box.noStep&&!box.stairGuard&&!(panel?.isDoor&&!panel.detachedEnvironment);
        // Player cylinder/AABB radius = 0.45
        const r = 0.45;
        const p = this.position;
        const h = this.currentHeight;

        if (box.ramp) {
            const ramp = box.ramp;
            const local = p.clone().sub(ramp.position).applyAxisAngle(new THREE.Vector3(0, 1, 0), -ramp.rotation);
            if (Math.abs(local.x) > ramp.width / 2 || Math.abs(local.z) > ramp.length / 2) return false;
            const surface = ramp.position.y + ramp.height * (0.5 - local.z / ramp.length);
            // Stacked stair flights are slabs: walking underneath a higher flight
            // must not collide with its entire bounding volume.
            if(ramp.thickness && p.y < surface-ramp.thickness-.001)return false;
            if(ramp.thickness && this.velocity.y>0 && previousFeet+h<=surface-ramp.thickness && p.y>=surface-ramp.thickness){p.y=surface-ramp.thickness;this.velocity.y=0;return false;}
            if (this.velocity.y <= 0 && p.y - h <= surface &&
                (previousFeet >= surface - 0.001 || ((this.isGrounded || Math.abs(this.velocity.y)<1.2) && p.y-h >= ramp.position.y-.08 && surface-(p.y-h)<=.35))) {
                p.y = surface + h;
                this.velocity.y = 0;
                return true;
            }
            // Resolve the solid sides only below the sloped surface.
            if (p.y - h >= surface) return false;
        }

        // Check if player Y overlaps with box
        if (p.y - h > box.max.y || p.y < box.min.y) return;

        // Check horizontal overlap
        const minX = box.min.x - r;
        const maxX = box.max.x + r;
        const minZ = box.min.z - r;
        const maxZ = box.max.z + r;

        if (p.x > minX && p.x < maxX && p.z > minZ && p.z < maxZ) {
            // Step-up mechanic (if box is low like a ramp/step <= 0.5m)
            const stepUpHeight = box.max.y;
            if (allowStep && stepUpHeight-previousFeet<=.55 && this.velocity.y <= 0 && (previousFeet >= stepUpHeight - 0.001 ||
                (this.isGrounded && p.y - h >= stepUpHeight - 0.55))) {
                p.y = stepUpHeight + h;
                this.velocity.y = 0;
                this.isGrounded = true;
                return true;
            }

            // Stop upward movement at the underside of platforms.
            if (allowStep && this.velocity.y > 0 && previousFeet + h <= box.min.y && p.y >= box.min.y) {
                p.y = box.min.y;
                this.velocity.y = 0;
                return false;
            }

            // Find smallest penetration depth to push out
            const dLeft = p.x - minX;
            const dRight = maxX - p.x;
            const dBack = p.z - minZ;
            const dFront = maxZ - p.z;

            const minD = Math.min(dLeft, dRight, dBack, dFront);
            if (minD === dLeft) {
                p.x = minX;
                this.velocity.x = Math.min(0, this.velocity.x);
            } else if (minD === dRight) {
                p.x = maxX;
                this.velocity.x = Math.max(0, this.velocity.x);
            } else if (minD === dBack) {
                p.z = minZ;
                this.velocity.z = Math.min(0, this.velocity.z);
            } else if (minD === dFront) {
                p.z = maxZ;
                this.velocity.z = Math.max(0, this.velocity.z);
            }
        }
    }

    getSpeed() {
        return Math.hypot(this.velocity.x, this.velocity.z);
    }
}
