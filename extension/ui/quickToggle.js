import {QuickSettingsManager} from '../lib/quickSettings.js';

let St = null;
let Clutter = null;
let Gio = null;
let GLib = null;
if (typeof process === 'undefined') {
    try {
        St = (await import('gi://St')).default;
        Clutter = (await import('gi://Clutter')).default;
        Gio = (await import('gi://Gio')).default;
        GLib = (await import('gi://GLib')).default;
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
            // Keep a generous click target while displaying a plain 14px metric-sized icon.
            style: 'width: 26px; height: 26px; padding: 0; border: 0; background-color: transparent;',
            style_class: 'linux-island__quick-toggle',
            reactive: true,
            can_focus: true,
            accessible_name: this._label,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
        });

        this._icon = new St.Icon({
            icon_name: this._iconName,
            fallback_icon_name: this._iconName,
            icon_size: 14,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
        });

        this.actor.set_child(this._icon);
        this.actor.connect('clicked', () => this._onToggle());
        this._syncStyle();
    }
    setIcon(iconName) {
        this._iconName = iconName;
        if (this._icon) {
            this._icon.icon_name = iconName;
            this._icon.fallback_icon_name = iconName;
        }
    }

    setLabel(text) {
        this._label = text;
        if (this._labelWidget) {
            this._labelWidget.text = text;
        }
        if (this.actor) {
            this.actor.accessible_name = text;
        }
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
    constructor({manager, onThemeToggle, onOpenSettings} = {}) {
        this._manager = manager ?? new QuickSettingsManager();
        this._onThemeToggle = onThemeToggle ?? (() => this._manager.toggleDarkMode());
        this._onOpenSettings = onOpenSettings ?? (() => {
            try {
                if (Gio) {
                    Gio.Subprocess.new(['linux-island-settings'], Gio.SubprocessFlags.NONE);
                }
            } catch (_) {
                try {
                    if (Gio && GLib) {
                        const home = GLib.get_home_dir();
                        Gio.Subprocess.new([`${home}/.local/bin/linux-island-settings`], Gio.SubprocessFlags.NONE);
                    }
                } catch (_) {}
            }
        });
        this._destroyed = false;
        this._listener = null;
        this.actor = null;
        this._currentTheme = 'dark';

        this._themeToggle = new QuickToggle({
            iconName: 'weather-clear-night-symbolic',
            label: 'Theme: Dark',
            onToggle: () => this._onThemeToggle(),
            active: true,
        });
        this._darkToggle = this._themeToggle;

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

        this._settingsToggle = new QuickToggle({
            iconName: 'preferences-system-symbolic',
            label: 'Settings',
            onToggle: () => this._onOpenSettings(),
        });
        if (St && Clutter) {
            this._build();
        }

        this._sync(this._manager.getState());
        this._listener = this._manager.connect(state => this._sync(state));
    }

    setTheme(theme) {
        if (!['light', 'dark', 'system'].includes(theme)) return;
        this._currentTheme = theme;
        const meta = {
            'dark': { icon: 'weather-clear-night-symbolic', label: 'Theme: Dark' },
            'light': { icon: 'weather-clear-symbolic', label: 'Theme: Light' },
            'system': { icon: 'preferences-desktop-display-symbolic', label: 'Theme: Auto' },
        }[theme];

        this._themeToggle.setIcon(meta.icon);
        this._themeToggle.setLabel(meta.label);
        this._themeToggle.setActive(theme !== 'light');
    }

    _build() {
        this.actor = new St.BoxLayout({
            vertical: true,
            style: 'spacing: 4px; width: 34px;',
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
        });
        if (this._themeToggle.actor) this.actor.add_child(this._themeToggle.actor);
        if (this._dndToggle.actor) this.actor.add_child(this._dndToggle.actor);
        if (this._nightToggle.actor) this.actor.add_child(this._nightToggle.actor);
        if (this._settingsToggle.actor) this.actor.add_child(this._settingsToggle.actor);
    }

    _sync(state) {
        if (this._destroyed || !state) return;
        this._dndToggle.setActive(state.dnd);
        this._dndToggle.setIcon(state.dnd ? 'notifications-disabled-symbolic' : 'preferences-system-notifications-symbolic');
        this._nightToggle.setActive(state.nightLight);
        if (!this._currentTheme || this._currentTheme === 'system') {
            this._darkToggle.setActive(state.darkMode);
        }
    }
    destroy() {
        this._destroyed = true;
        if (this._listener) {
            this._manager.disconnect(this._listener);
            this._listener = null;
        }
        this._themeToggle.destroy();
        this._dndToggle.destroy();
        this._nightToggle.destroy();
        this._settingsToggle.destroy();
        if (this.actor) {
            this.actor.destroy();
            this.actor = null;
        }
    }
}
