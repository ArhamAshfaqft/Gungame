import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

// Inspection changes only the presentation camera; the live rig is left untouched.
export class PoseInspector {
    constructor(game) {
        this.game = game;
        this.active = false;
        this.button = document.createElement('button');
        this.button.id = 'pose-inspector';
        this.button.textContent = 'P · Freeze & inspect';
        this.button.disabled = true;
        document.body.append(this.button);
        game.thirdPerson.ready.then(() => { this.button.disabled = false; }).catch(() => {});
        this.button.onclick = () => { this.toggle(); this.button.blur(); };
        this.help = document.createElement('div');
        this.help.id = 'pose-inspector-help';
        this.help.hidden = true;
        this.help.textContent = 'POSE FROZEN · Drag: orbit · Right-drag: pan · Scroll: zoom · P: return to game';
        document.body.append(this.help);
        window.addEventListener('keydown', event => {
            if (event.code === 'KeyP' && !event.repeat && (this.active || game.movement.isLocked)) {
                event.preventDefault(); event.stopImmediatePropagation(); this.toggle();
            } else if (this.active && !['KeyB','KeyH'].includes(event.code)) { event.stopImmediatePropagation(); }
        }, true);
        // A canvas click normally recaptures the mouse. Keep it free for orbiting.
        game.canvas.addEventListener('click', event => {
            if (this.active) event.stopImmediatePropagation();
        }, true);
        window.addEventListener('mousedown', event => {
            if (this.active) event.stopImmediatePropagation();
        }, true);
    }
    toggle() {
        const game = this.game, view = game.thirdPerson;
        if (!view.rig || game.movement.isDisabled) return;
        if (this.active) {
            this.active = false;
            view.inspecting=false;
            this.controls.dispose();
            view.enabled = this.previousView;
            game.weapon.thirdPerson = this.previousView;
            view.update(0);
            game.viewButton.disabled = false;
            this.button.textContent = 'P · Freeze & inspect';
            this.button.setAttribute('aria-pressed', 'false');
            this.help.hidden = true;
            document.body.classList.remove('inspecting-pose');
            this.onChange?.(false);
            game.canvas.requestPointerLock();
            return;
        }
        view.inspecting=true;
        this.previousView = view.enabled;
        // In first person the body normally updates legs only. Present its full pose once.
        if (!view.enabled) { view.enabled = true; game.weapon.thirdPerson = true; view.update(0); }
        view.update(0);
        this.active = true;
        this.controls = new OrbitControls(view.camera, game.canvas);
        this.controls.target.copy(view.rig.object.position).add(new THREE.Vector3(0, game.movement.currentHeight * .65, 0));
        this.controls.minDistance = .2;
        this.controls.maxDistance = 15;
        this.controls.update();
        game.viewButton.disabled = true;
        this.button.textContent = 'P · Return to game';
        this.button.setAttribute('aria-pressed', 'true');
        this.help.hidden = false;
        document.body.classList.add('inspecting-pose');
        game.startScreen.classList.add('hidden');
        this.onChange?.(true);
        document.exitPointerLock();
    }
    update() {
        const camera = this.game.thirdPerson.camera;
        camera.aspect = this.game.camera.aspect;
        camera.updateProjectionMatrix();
        this.controls.update();
    }
}
