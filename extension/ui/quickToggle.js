import {QuickSettingsManager} from '../lib/quickSettings.js';
import {StorageIndicator} from './systemMetricTile.js';

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

export function getLocalUiGIcon(name) {
    if (!Gio || typeof Gio.File?.new_for_uri !== 'function') return null;
    try {
        const thisFile = Gio.File.new_for_uri(import.meta.url);
        const iconFile = thisFile.get_parent().get_parent().get_child('icons').get_child('ui').get_child(name);
        if (iconFile.query_exists(null)) {
            return new Gio.FileIcon({file: iconFile});
        }
    } catch (_) {}
    return null;
}

function mapToggleIconToSvg(iconName) {
    switch (iconName) {
    case 'weather-clear-night-symbolic':
    case 'weather-clear-symbolic':
    case 'preferences-desktop-display-symbolic':
        return 'theme-symbolic.svg';
    case 'notifications-disabled-symbolic':
    case 'preferences-system-notifications-symbolic':
        return 'dnd-symbolic.svg';
    case 'night-light-symbolic':
        return 'night-light-symbolic.svg';
    case 'preferences-system-symbolic':
        return 'system-symbolic.svg';
    default:
        return null;
    }
}

// Quick-setting icon column. Geometry mirrors the CPU/RAM/BAT metric tiles:
//   metric tile = 20px row, 4px gap, 4px side inset, 14px glyph
//   toggle      = 20px row, 4px gap, 4px side inset, 14px glyph
// The inset comes from centring the 14px glyph in a 22px box rather than from
// CSS padding: St adds padding outside an explicit height, and 4 padded rows
// would overflow the 98px system section and get clipped by the carousel.
export const TOGGLE_WIDTH = 22;
export const TOGGLE_HEIGHT = 22;
export const TOGGLE_COLUMN_SPACING = 4;

export class QuickToggle {
    constructor({iconName, label, onToggle, active = false, size = 26} = {}) {
        this._iconName = iconName;
        this._label = label;
        this._onToggle = onToggle ?? (() => {});
        this._active = Boolean(active);
        this._size = size;
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
            label: this._label,
            style_class: 'linux-island__quick-pill',
            reactive: true,
            can_focus: true,
            accessible_name: this._label,
            x_expand: true,
            x_align: Clutter.ActorAlign.FILL,
            y_align: Clutter.ActorAlign.CENTER,
        });

        this.actor.connect('clicked', () => this._onToggle());
        this._syncStyle();
    }
    setIcon(iconName) {
        this._iconName = iconName;
        if (this._icon) {
            this._icon.icon_name = iconName;
            this._icon.fallback_icon_name = iconName;
            const svg = mapToggleIconToSvg(iconName);
            const gicon = svg ? getLocalUiGIcon(svg) : null;
            if (gicon && this._icon.set_gicon) {
                this._icon.set_gicon(gicon);
            }
        }
    }

    setLabel(text) {
        this._label = text;
        if (this.actor) {
            this.actor.label = text;
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
            this.actor.add_style_class_name?.('linux-island__quick-pill--active');
        } else {
            this.actor.remove_style_class_name?.('linux-island__quick-pill--active');
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
    constructor({manager, onThemeToggle, onOpenSettings, onOpenStorage} = {}) {
        this._manager = manager ?? new QuickSettingsManager();
        this._onThemeToggle = onThemeToggle ?? (() => this._manager.toggleDarkMode());
        this._onOpenStorage = onOpenStorage ?? (() => {});
        this._onOpenSettings = onOpenSettings ?? (() => {
            // Prefer whatever is on PATH (system packages install to /usr/bin)
            // and fall back to the per-user install location.
            const attempts = [];
            if (GLib?.find_program_in_path) {
                const found = GLib.find_program_in_path('linux-island-settings');
                if (found)
                    attempts.push([found]);
            }
            attempts.push(['linux-island-settings']);
            if (GLib?.get_home_dir)
                attempts.push([`${GLib.get_home_dir()}/.local/bin/linux-island-settings`]);

            for (const argv of attempts) {
                try {
                    if (Gio?.Subprocess) {
                        Gio.Subprocess.new(argv, Gio.SubprocessFlags.NONE);
                        return;
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
            label: 'Theme',
            onToggle: () => this._onThemeToggle(),
            active: true,
            size: 22,
        });
        this._darkToggle = this._themeToggle;

        this._dndToggle = new QuickToggle({
            iconName: 'notifications-disabled-symbolic',
            label: 'DND',
            onToggle: () => this._manager.toggleDnd(),
            size: 22,
        });

        this._nightToggle = new QuickToggle({
            iconName: 'night-light-symbolic',
            label: 'Night',
            onToggle: () => this._manager.toggleNightLight(),
            size: 22,
        });

        this._settingsToggle = new QuickToggle({
            iconName: 'preferences-system-symbolic',
            label: 'Settings',
            onToggle: () => this._onOpenSettings(),
            size: 22,
        });

        // Storage tracker sits above the horizontal pill row.
        this._storageIndicator = new StorageIndicator({
            onActivate: () => this._onOpenStorage(),
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
            'dark': { icon: 'weather-clear-night-symbolic', label: 'Theme', a11y: 'Theme: Dark' },
            'light': { icon: 'weather-clear-symbolic', label: 'Light', a11y: 'Theme: Light' },
            'system': { icon: 'preferences-desktop-display-symbolic', label: 'Auto', a11y: 'Theme: Auto' },
        }[theme];

        this._themeToggle.setIcon(meta.icon);
        this._themeToggle.setLabel(meta.label);
        if (this._themeToggle.actor) {
            this._themeToggle.actor.accessible_name = meta.a11y;
        }
        this._themeToggle.setActive(theme !== 'light');
    }

    _build() {
        this.actor = new St.BoxLayout({
            vertical: true,
            style: 'spacing: 6px;',
            x_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
        });

        if (this._storageIndicator.actor) {
            this.actor.add_child(this._storageIndicator.actor);
        }

        this._iconsBox = new St.BoxLayout({
            vertical: false,
            style: 'spacing: 6px;',
            x_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
        });
        for (const toggle of [this._themeToggle, this._dndToggle,
            this._nightToggle, this._settingsToggle]) {
            if (toggle.actor) this._iconsBox.add_child(toggle.actor);
        }
        this.actor.add_child(this._iconsBox);
    }

    setWidth(w) {
        if (!this.actor || w <= 0) return;
        this.actor.style = `spacing: 6px; width: ${w}px;`;
        this.actor.width = w;
        if (this._iconsBox) {
            this._iconsBox.style = `spacing: 6px; width: ${w}px;`;
            this._iconsBox.width = w;
        }
        this._storageIndicator.setWidth(w);
    }

    setStorage(storage) {
        this._storageIndicator.setStorage(storage);
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
        this._storageIndicator.destroy();
        if (this.actor) {
            this.actor.destroy();
            this.actor = null;
        }
    }
}
