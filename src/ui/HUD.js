export class HUD {
    constructor() {
        this.crosshair = document.getElementById('crosshair');
        this.scopeOverlay = document.getElementById('scope-overlay');
        this.hitmarker = document.getElementById('hitmarker');
        this.hitmarkerX = document.getElementById('hitmarker-x');
        this.speedometer = document.getElementById('speed-value');
        this.speedFill = document.getElementById('speed-fill');
        this.ammoValue = document.getElementById('ammo-val');
        this.ammoReserve = document.getElementById('ammo-res');
        this.killfeed = document.getElementById('killfeed');
        this.banner = document.getElementById('streak-banner');
        this.interactPrompt = document.getElementById('interact-prompt');
        this.interactLabel = document.getElementById('interact-label');
        this.tagSlide = document.getElementById('tag-slide');
        this.tagSprint = document.getElementById('tag-sprint');
        this.tagWalk = document.getElementById('tag-walk');
        this.tagCrouch = document.getElementById('tag-crouch');

        this.damageContainer = document.getElementById('damage-numbers');

        this.hitmarkerTimer = 0;
        this.streakCount = 0;
        this.lastKillTime = 0;

        this.setupGlobalEvents();
    }

    setupGlobalEvents() {
        window.__triggerHitmarker = (isHeadshot, damage, worldPos) => {
            this.showHitmarker(isHeadshot);
            this.showDamageNumber(damage, isHeadshot);
        };

        window.__recordKill = (victimName, isHeadshot) => {
            this.addKillFeedEntry(victimName, isHeadshot);
            this.triggerStreakBanner(isHeadshot);
        };
    }

    showHitmarker(isHeadshot) {
        this.hitmarker.classList.remove('hidden', 'hit-headshot');
        void this.hitmarker.offsetWidth; // force reflow
        if (isHeadshot) {
            this.hitmarker.classList.add('hit-headshot');
        }
        this.hitmarker.classList.add('active');

        clearTimeout(this.hitmarkerTimer);
        this.hitmarkerTimer = setTimeout(() => {
            this.hitmarker.classList.remove('active');
        }, 180);
    }

    showDamageNumber(damage, isHeadshot) {
        const el = document.createElement('div');
        el.className = `damage-num ${isHeadshot ? 'crit' : ''}`;
        el.textContent = isHeadshot ? `${damage} HEADSHOT` : `${damage}`;

        // Place near center with slight random offset
        const offsetX = (Math.random() - 0.5) * 60;
        const offsetY = (Math.random() - 0.5) * 40 - 20;

        el.style.left = `calc(50% + ${offsetX}px)`;
        el.style.top = `calc(50% + ${offsetY}px)`;

        this.damageContainer.appendChild(el);
        setTimeout(() => el.remove(), 750);
    }

    addKillFeedEntry(victimName, isHeadshot) {
        const entry = document.createElement('div');
        entry.className = 'kill-row';

        const isSlideKill = window.__isPlayerSliding;
        const badge = isSlideKill ? ' [SLIDE SHOT]' : (isHeadshot ? ' [QUICKSCOPE]' : '');

        entry.innerHTML = `<span class="killer">YOU</span> <span class="weapon-icon">︻╦╤─</span> <span class="victim">${victimName}</span> <span class="badge">${badge}</span>`;

        this.killfeed.appendChild(entry);
        setTimeout(() => entry.classList.add('show'), 10);
        setTimeout(() => {
            entry.classList.remove('show');
            setTimeout(() => entry.remove(), 400);
        }, 3500);
    }

    triggerStreakBanner(isHeadshot) {
        const now = performance.now();
        if (now - this.lastKillTime < 3500) {
            this.streakCount++;
        } else {
            this.streakCount = 1;
        }
        this.lastKillTime = now;

        let title = '';
        if (this.streakCount === 2) title = 'DOUBLE KILL!';
        else if (this.streakCount === 3) title = 'TRIPLE KILL!';
        else if (this.streakCount >= 4) title = 'TACTICAL SPREE!';
        else if (isHeadshot) title = 'CLEAN HEADSHOT!';
        else if (window.__isPlayerSliding) title = 'SLIDE TRICKSHOT!';

        if (title) {
            this.banner.textContent = title;
            this.banner.classList.add('pop');
            clearTimeout(this.bannerTimer);
            this.bannerTimer = setTimeout(() => {
                this.banner.classList.remove('pop');
            }, 1400);
        }
    }

    update(movement, weapon, room = null) {
        window.__isPlayerSliding = movement.isSliding;

        // 1. Crosshair bloom
        const ads = weapon.adsProgress;
        if (ads > 0.3) {
            // Hide crosshair when scoped
            this.crosshair.style.opacity = Math.max(0, (1.0 - ads * 2.5)).toString();
        } else {
            this.crosshair.style.opacity = '1';
            // Spread expands with velocity & slide
            const speed = movement.getSpeed();
            let spreadPx = 12;
            if (movement.isSliding) spreadPx = 36;
            else if (!movement.isGrounded) spreadPx = 48;
            else if (movement.isSprinting) spreadPx = 28;
            else spreadPx = 12 + speed * 1.5;

            document.documentElement.style.setProperty('--crosshair-gap', `${spreadPx}px`);
        }

        // 2. Scope Overlay Opacity
        if (ads > 0.4) {
            const scopeAlpha = (ads - 0.4) / 0.6;
            this.scopeOverlay.style.opacity = scopeAlpha.toString();
            this.scopeOverlay.style.pointerEvents = 'none';
            this.scopeOverlay.classList.remove('hidden');
        } else {
            this.scopeOverlay.style.opacity = '0';
        }

        // 3. Speedometer
        const speed = Math.round(movement.getSpeed() * 3.6); // km/h (or m/s)
        this.speedometer.textContent = `${speed}`;

        // Color coding: Gold when in super fast slide/jump
        const isHyperspeed = speed > 60 || movement.isSliding;
        if (isHyperspeed) {
            this.speedometer.classList.add('boost');
        } else {
            this.speedometer.classList.remove('boost');
        }

        const fillPercent = Math.min(100, (speed / 90) * 100);
        this.speedFill.style.width = `${fillPercent}%`;

        this.tagSlide.classList.toggle('active', movement.isSliding);
        this.tagSprint.classList.toggle('active', movement.isSprinting);
        this.tagWalk.classList.toggle('active', movement.isWalking);
        this.tagCrouch.classList.toggle('active', movement.isCrouching);

        // 4. Ammo Counter
        this.ammoValue.textContent = weapon.magAmmo;
        this.ammoReserve.textContent = `/ ${weapon.reserveAmmo}`;

        // 6. Door interaction prompt
        if (this.interactPrompt && room) {
            const visible = room.canInteract && !room.door.destroyed;
            this.interactPrompt.classList.toggle('hidden', !visible);
            if (visible) this.interactLabel.textContent = room.door.open ? 'CLOSE DOOR' : 'OPEN DOOR';
        }
    }
}
