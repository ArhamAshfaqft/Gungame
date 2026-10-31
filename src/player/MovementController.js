import * as THREE from 'three';
import { soundEngine } from '../audio/SoundEngine.js';

export class MovementController {
    constructor(camera, domElement) {
        this.camera = camera;
        this.domElement = domElement;

        // Configuration
        this.walkSpeed = 8.0;
        this.sprintSpeed = 16.5;
        this.slideInitialSpeed = 26.0;
        this.slideMinSpeed = 10.0;
        this.slideDecel = 22.0; // m/s^2 deceleration
        this.jumpForce = 11.0;
        this.gravity = 28.0;

        // Heights
        this.standHeight = 1.65;
        this.slideHeight = 0.75;
        this.currentHeight = this.standHeight;

        // State
        this.position = new THREE.Vector3(14, this.standHeight, 28);
        this.velocity = new THREE.Vector3();
        this.isGrounded = false;
        this.isSprinting = false;
        this.isSliding = false;
        this.slideTimer = 0;
        this.slideMaxDuration = 0.85;
        this.slideDirection = new THREE.Vector3();
        this.coyoteTime = 0;

        // Rotation & Mouse Look
        this.pitch = 0;
        this.yaw = 0.2;
        this.mouseSensitivity = 0.0022;
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
            leanLeft: false,
            leanRight: false
        };

        // Peek / lean (Q left, E right)
        this.leanMaxOffset = 0.40;
        this.leanMaxRoll = 0.105;
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

        this.setupPointerLock();
        this.setupKeyboard();
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
            if (!this.isLocked) return;

            const movementX = e.movementX || 0;
            const movementY = e.movementY || 0;

            this.yaw -= movementX * this.mouseSensitivity;
            this.pitch -= movementY * this.mouseSensitivity;

            // Clamp pitch (-89 to 89 degrees)
            this.pitch = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, this.pitch));

            // Record delta for weapon inertia sway
            this.mouseDelta.x += movementX;
            this.mouseDelta.y += movementY;
        });
    }

    setupKeyboard() {
        window.addEventListener('keydown', (e) => {
            if (!this.isLocked) return;
            if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ControlLeft'].includes(e.code)) e.preventDefault();
            this.onKeyChange(e.code, true);
        });

        window.addEventListener('keyup', (e) => {
            this.onKeyChange(e.code, false);
        });
    }

    resetInput() {
        for (const key of Object.keys(this.keys)) this.keys[key] = false;
        this.mouseDelta.x = 0;
        this.mouseDelta.y = 0;
        this.isSprinting = false;
        this.cancelSlide();
    }

    onKeyChange(code, isDown) {
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
            case 'ControlLeft':
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
        }
    }

    handleSlidePress() {
        // Can slide if moving forward at high speed on ground
        const horizontalSpeed = Math.hypot(this.velocity.x, this.velocity.z);
        if (this.isGrounded && !this.isSliding && this.keys.forward && horizontalSpeed > 6.0) {
            this.startSlide();
        } else if (this.isSliding) {
            // Slide cancel!
            this.cancelSlide();
        }
    }

    startSlide() {
        this.isSliding = true;
        this.slideTimer = 0;

        // Slide direction follows current forward look direction
        const forward = new THREE.Vector3(0, 0, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw);
        this.slideDirection.copy(forward).normalize();

        // Speed burst
        this.velocity.x = this.slideDirection.x * this.slideInitialSpeed;
        this.velocity.z = this.slideDirection.z * this.slideInitialSpeed;

        soundEngine.playSlide();
    }

    cancelSlide() {
        this.isSliding = false;
        this.slideTimer = 0;
    }

    handleJump() {
        if (this.isGrounded || this.coyoteTime > 0) {
            if (this.isSliding) {
                // COD SIGNATURE SLIDE-JUMP:
                // Preserves horizontal slide momentum, lifts into the air!
                this.isSliding = false;
                this.velocity.y = this.jumpForce * 1.05;
                // Slight forward boost out of slide
                this.velocity.x *= 1.05;
                this.velocity.z *= 1.05;
            } else {
                this.velocity.y = this.jumpForce;
            }

            this.isGrounded = false;
            this.coyoteTime = 0;
            soundEngine.playJump();
        }
    }

    update(delta, colliders = [], jumpPads = []) {
        if (delta > 0.1) delta = 0.1; // clamp lag spikes

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

        // Sprint logic
        this.isSprinting = this.keys.sprint && this.keys.forward && !this.isSliding && this.isGrounded;

        // 2. Movement state updates
        if (this.isSliding) {
            this.slideTimer += delta;

            // Decelerate slide
            const currentSpeed = Math.hypot(this.velocity.x, this.velocity.z);
            const newSpeed = Math.max(this.slideMinSpeed, currentSpeed - this.slideDecel * delta);

            // Allow subtle steering during slide
            if (moveDir.lengthSq() > 0) {
                this.slideDirection.lerp(moveDir, delta * 3.5).normalize();
            }

            this.velocity.x = this.slideDirection.x * newSpeed;
            this.velocity.z = this.slideDirection.z * newSpeed;

            // Slide ends if timer runs out or player stops moving
            if (this.slideTimer >= this.slideMaxDuration) {
                this.cancelSlide();
            }
        } else if (this.isGrounded) {
            // Normal Ground Movement
            const targetSpeed = this.isSprinting ? this.sprintSpeed : this.walkSpeed;
            const targetVx = moveDir.x * targetSpeed;
            const targetVz = moveDir.z * targetSpeed;

            const accel = this.isSprinting ? 45.0 : 35.0;
            this.velocity.x = THREE.MathUtils.damp(this.velocity.x, targetVx, accel, delta);
            this.velocity.z = THREE.MathUtils.damp(this.velocity.z, targetVz, accel, delta);
        } else {
            // Air Control (Bhop / Strafe)
            if (moveDir.lengthSq() > 0) {
                const airAccel = 18.0;
                this.velocity.x += moveDir.x * airAccel * delta;
                this.velocity.z += moveDir.z * airAccel * delta;

                // Air drag limit (preserve high slide-jump speed without infinite acceleration)
                const horizSpeed = Math.hypot(this.velocity.x, this.velocity.z);
                const maxAirSpeed = 28.0;
                if (horizSpeed > maxAirSpeed) {
                    this.velocity.x = (this.velocity.x / horizSpeed) * maxAirSpeed;
                    this.velocity.z = (this.velocity.z / horizSpeed) * maxAirSpeed;
                }
            }
        }

        // Keep feet fixed as eye height changes during a slide.
        const previousHeight = this.currentHeight;
        const targetHeight = this.isSliding ? this.slideHeight : this.standHeight;
        this.currentHeight = THREE.MathUtils.damp(this.currentHeight, targetHeight, 14.0, delta);
        this.position.y += this.currentHeight - previousHeight;

        // 3. Gravity
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
            if (this.resolveBoxCollision(col, prevY - this.currentHeight)) onGroundNow = true;
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
        if (this.keys.left) targetRoll += 0.025;
        if (this.keys.right) targetRoll -= 0.025;
        if (this.isSliding) targetRoll += 0.04; // COD slide tilt
        this.cameraRoll = THREE.MathUtils.damp(this.cameraRoll, targetRoll, 10.0, delta);

        // Head bobbing
        const speed = Math.hypot(this.velocity.x, this.velocity.z);
        if (this.isGrounded && speed > 2.0 && !this.isSliding) {
            this.bobTime += delta * (this.isSprinting ? 18.0 : 12.0);
            this.bobAmount = THREE.MathUtils.damp(this.bobAmount, this.isSprinting ? 0.08 : 0.04, 8.0, delta);
        } else {
            this.bobAmount = THREE.MathUtils.damp(this.bobAmount, 0, 10.0, delta);
        }

        const bobY = Math.sin(this.bobTime) * this.bobAmount;
        const bobX = Math.cos(this.bobTime * 0.5) * this.bobAmount * 0.5;

        // Peek / lean: slide the eye sideways and roll the head, stopping at cover.
        this.leanTarget = (this.keys.leanRight ? 1 : 0) - (this.keys.leanLeft ? 1 : 0);
        this.lean = THREE.MathUtils.damp(this.lean, this.leanTarget, 12.0, delta);
        const leanRight = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
        // Leaning drops the shoulder a little, so the eye arcs instead of sliding flat.
        const leanDip = -Math.abs(this.lean) * this.leanMaxDip;
        const leanWanted = this.lean * this.leanMaxOffset;
        this.leanOffset = this.resolveLean(leanWanted, leanRight, bobX, bobY + leanDip, colliders);

        // Apply to Camera
        this.camera.position.set(
            this.position.x + bobX,
            this.position.y + bobY + leanDip,
            this.position.z
        ).addScaledVector(leanRight, this.leanOffset);

        // Camera Rotation (Euler order YXZ)
        this.camera.rotation.order = 'YXZ';
        this.camera.rotation.y = this.yaw;
        this.camera.rotation.x = this.pitch;
        this.camera.rotation.z = this.cameraRoll - this.lean * this.leanMaxRoll;

        // Dynamic FOV for speed sensation
        let desiredFov = this.baseFov;
        if (this.isSliding) desiredFov += 10;
        else if (this.isSprinting) desiredFov += 5;
        this.currentFov = THREE.MathUtils.damp(this.currentFov, desiredFov, 8.0, delta);

        // Decay mouse delta for weapon sway
        this.mouseDelta.x *= 0.82;
        this.mouseDelta.y *= 0.82;
    }

    // Step the eye sideways and stop just before entering cover.
    resolveLean(distance, direction, bobX = 0, bobY = 0, colliders = []) {
        if (!distance) return 0;
        if (!colliders.length) return distance;
        const steps = 5;
        const eye = new THREE.Vector3(this.position.x + bobX, this.position.y + bobY, this.position.z);
        for (let i = 1; i <= steps; i++) {
            const probe = eye.clone().addScaledVector(direction, distance * i / steps);
            const blocked = colliders.some(box =>
                probe.x > box.min.x - 0.18 && probe.x < box.max.x + 0.18 &&
                probe.z > box.min.z - 0.18 && probe.z < box.max.z + 0.18 &&
                probe.y > box.min.y && probe.y < box.max.y + 0.18);
            if (blocked) return distance * (i - 1) / steps;
        }
        return distance;
    }

    resolveBoxCollision(box, previousFeet = this.position.y - this.currentHeight) {
        // Player cylinder/AABB radius = 0.45
        const r = 0.45;
        const p = this.position;
        const h = this.currentHeight;

        if (box.ramp) {
            const ramp = box.ramp;
            const local = p.clone().sub(ramp.position).applyAxisAngle(new THREE.Vector3(0, 1, 0), -ramp.rotation);
            if (Math.abs(local.x) > ramp.width / 2 || Math.abs(local.z) > ramp.length / 2) return false;
            const surface = ramp.position.y + ramp.height * (0.5 - local.z / ramp.length);
            if (this.velocity.y <= 0 && p.y - h <= surface &&
                (previousFeet >= surface - 0.001 || (this.isGrounded && surface - (p.y - h) <= 0.55))) {
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
            if (this.velocity.y <= 0 && (previousFeet >= stepUpHeight - 0.001 ||
                (this.isGrounded && p.y - h >= stepUpHeight - 0.55))) {
                p.y = stepUpHeight + h;
                this.velocity.y = 0;
                this.isGrounded = true;
                return true;
            }

            // Stop upward movement at the underside of platforms.
            if (this.velocity.y > 0 && previousFeet + h <= box.min.y && p.y >= box.min.y) {
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
