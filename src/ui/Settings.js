const STORAGE_KEY = 'fast-snipe.settings';
const DEFAULTS = { hipSensitivity: 1, adsSensitivity: 1, invertY: false };

// Aim settings live on the menu so they can be changed while paused, and persist between sessions.
export class Settings {
    constructor(movement) {
        this.movement = movement;
        this.el = {
            hip: document.getElementById('set-hip'),
            ads: document.getElementById('set-ads'),
            invert: document.getElementById('set-invert'),
            hipValue: document.getElementById('set-hip-val'),
            adsValue: document.getElementById('set-ads-val'),
        };
        this.values = this.load();
        this.apply();
        this.bind();
    }

    load() {
        try {
            const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
            return { ...DEFAULTS, ...saved };
        } catch {
            return { ...DEFAULTS };
        }
    }

    save() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(this.values));
        } catch {
            // Private browsing or a blocked storage backend: settings stay in memory.
        }
    }

    apply() {
        this.movement.hipSensitivity = this.values.hipSensitivity;
        this.movement.adsSensitivity = this.values.adsSensitivity;
        this.movement.invertY = !!this.values.invertY;
        if (this.el.hip) this.el.hip.value = this.values.hipSensitivity;
        if (this.el.ads) this.el.ads.value = this.values.adsSensitivity;
        if (this.el.invert) this.el.invert.checked = !!this.values.invertY;
        this.render();
    }

    render() {
        if (this.el.hipValue) this.el.hipValue.textContent = `${Number(this.values.hipSensitivity).toFixed(2)}x`;
        if (this.el.adsValue) this.el.adsValue.textContent = `${Number(this.values.adsSensitivity).toFixed(2)}x`;
    }

    bind() {
        this.el.hip?.addEventListener('input', () => {
            this.values.hipSensitivity = Number(this.el.hip.value);
            this.apply();
            this.save();
        });
        this.el.ads?.addEventListener('input', () => {
            this.values.adsSensitivity = Number(this.el.ads.value);
            this.apply();
            this.save();
        });
        this.el.invert?.addEventListener('change', () => {
            this.values.invertY = this.el.invert.checked;
            this.apply();
            this.save();
        });
    }
}
