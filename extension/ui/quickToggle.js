import {QuickSettingsManager} from '../lib/quickSettings.js';

let St = null;
let Clutter = null;
if (typeof process === 'undefined') {
    try {
        St = (await import('gi://St')).default;
        Clutter = (await import('gi://Clutter')).default;
    } catch (_) {}
}

export class QuickToggle {
    constructor({iconName, label, onToggle, active = false} = {}) {
        this._iconName = iconName;
        this._label = label;
        this._onToggle = onToggle ?? (() => {});
        this._active = Boolean(active);
        this.actor = null;
        this._icon = null;
        this._labelWidget = null;

        if (St && Clutter) {
            this._build();
        }
    }

    get isActive() {
        return this._active;
    }

    _build() {
        this.actor = new St.Button({
            style: 'height: 32px; padding: 4px 10px; border-radius: 10px;',
            style_class: 'linux-island__quick-toggle',
            reactive: true,
            can_focus: true,
            accessible_name: this._label,
            x_expand: true,
        });

        const box = new St.BoxLayout({
            style: 'spacing: 6px;',
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
        });

        this._icon = new St.Icon({
            icon_name: this._iconName,
            fallback_icon_name: this._iconName,
            icon_size: 14,
            y_align: Clutter.ActorAlign.CENTER,
        });
        box.add_child(this._icon);

        this._labelWidget = new St.Label({
            text: this._label,
            style_class: 'linux-island__quick-toggle-label',
            y_align: Clutter.ActorAlign.CENTER,
        });
        box.add_child(this._labelWidget);

        this.actor.set_child(box);
        this.actor.connect('clicked', () => this._onToggle());
        this._syncStyle();
    }

    setActive(active) {
        this._active = Boolean(active);
        this._syncStyle();
    }

    _syncStyle() {
        if (!this.actor) return;
        if (this._active) {
            this.actor.add_style_class_name('linux-island__quick-toggle--active');
        } else {
            this.actor.remove_style_class_name('linux-island__quick-toggle--active');
        }
    }

    destroy() {
        if (this.actor) {
            this.actor.destroy();
            this.actor = null;
        }
    }
}

export class QuickTogglesRow {
    constructor({manager} = {}) {
        this._manager = manager ?? new QuickSettingsManager();
        this._destroyed = false;
        this._listener = null;
        this.actor = null;

        this._dndToggle = new QuickToggle({
            iconName: 'notifications-disabled-symbolic',
            label: 'DND',
            onToggle: () => this._manager.toggleDnd(),
        });

        this._nightToggle = new QuickToggle({
            iconName: 'night-light-symbolic',
            label: 'Night Light',
            onToggle: () => this._manager.toggleNightLight(),
        });

        this._darkToggle = new QuickToggle({
            iconName: 'weather-clear-night-symbolic',
            label: 'Dark Mode',
            onToggle: () => this._manager.toggleDarkMode(),
        });

        if (St && Clutter) {
            this._build();
        }

        this._sync(this._manager.getState());
        this._listener = this._manager.connect(state => this._sync(state));
    }

    _build() {
        this.actor = new St.BoxLayout({
            style: 'spacing: 8px;',
            x_expand: true,
        });

        if (this._dndToggle.actor) this.actor.add_child(this._dndToggle.actor);
        if (this._nightToggle.actor) this.actor.add_child(this._nightToggle.actor);
        if (this._darkToggle.actor) this.actor.add_child(this._darkToggle.actor);
    }

    _sync(state) {
        if (this._destroyed || !state) return;
        this._dndToggle.setActive(state.dnd);
        this._nightToggle.setActive(state.nightLight);
        this._darkToggle.setActive(state.darkMode);
    }

    destroy() {
        this._destroyed = true;
        if (this._listener) {
            this._manager.disconnect(this._listener);
            this._listener = null;
        }
        this._dndToggle.destroy();
        this._nightToggle.destroy();
        this._darkToggle.destroy();
        if (this.actor) {
            this.actor.destroy();
            this.actor = null;
        }
    }
}
