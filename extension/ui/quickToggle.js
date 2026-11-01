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

// Quick-setting icon column. Geometry mirrors the CPU/RAM/BAT metric tiles:
//   metric tile = 20px row, 4px gap, 4px side inset, 14px glyph
//   toggle      = 20px row, 4px gap, 4px side inset, 14px glyph
// The inset comes from centring the 14px glyph in a 22px box rather than from
// CSS padding: St adds padding outside an explicit height, and 4 padded rows
// would overflow the 98px system section and get clipped by the carousel.
export const TOGGLE_WIDTH = 22;
export const TOGGLE_HEIGHT = 20;
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
            // Metric-tile geometry: 20px row, 14px glyph centred in 22px gives
            // the same 4px side inset as the tile's 2px 4px padding.
            style: `width: ${TOGGLE_WIDTH}px; height: ${this._size}px; padding: 0; border: 0; background-color: transparent;`,
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
            label: 'Theme: Dark',
            onToggle: () => this._onThemeToggle(),
            active: true,
            size: TOGGLE_HEIGHT,
        });
        this._darkToggle = this._themeToggle;

        this._dndToggle = new QuickToggle({
            iconName: 'notifications-disabled-symbolic',
            label: 'DND',
            onToggle: () => this._manager.toggleDnd(),
            size: TOGGLE_HEIGHT,
        });

        this._nightToggle = new QuickToggle({
            iconName: 'night-light-symbolic',
            label: 'Night Light',
            onToggle: () => this._manager.toggleNightLight(),
            size: TOGGLE_HEIGHT,
        });

        this._settingsToggle = new QuickToggle({
            iconName: 'preferences-system-symbolic',
            label: 'Settings',
            onToggle: () => this._onOpenSettings(),
            size: TOGGLE_HEIGHT,
        });

        // Storage tracker sits directly below the icon row, right side.
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
            'dark': { icon: 'weather-clear-night-symbolic', label: 'Theme: Dark' },
            'light': { icon: 'weather-clear-symbolic', label: 'Theme: Light' },
            'system': { icon: 'preferences-desktop-display-symbolic', label: 'Theme: Auto' },
        }[theme];

        this._themeToggle.setIcon(meta.icon);
        this._themeToggle.setLabel(meta.label);
        this._themeToggle.setActive(theme !== 'light');
    }

    _build() {
        // Right slot, left to right: disk readout immediately right of NET,
        // then the quick-setting icon column flush against the capsule edge.
        //
        // The disk block expands to absorb all leftover width and the icon
        // column keeps a fixed width, so the two always sum to the slot width.
        // That pins the icons to the right edge without relying on a spacer
        // widget, whose expansion inside a fixed-width box is not reliable.
        //
        // Rows are 20px with 4px gaps and no border, matching the CPU/RAM/BAT
        // tiles: 4*20 + 3*4 = 92px, which fits the 98px section.
        this.actor = new St.BoxLayout({
            vertical: false,
            style: `spacing: ${TOGGLE_COLUMN_SPACING}px;`,
            x_expand: true,
            x_align: Clutter.ActorAlign.END,
            y_align: Clutter.ActorAlign.CENTER,
        });

        // Disk readout gets an explicit width in setWidth(). Expansion is not
        // used because St.BoxLayout ignores x_align on its main axis, which
        // would leave the block's real width ambiguous and make the centred
        // glyph/percentage drift off the used/total line.
        if (this._storageIndicator.actor) {
            this._storageIndicator.actor.x_expand = false;
            this._storageIndicator.actor.x_align = Clutter.ActorAlign.START;
            this.actor.add_child(this._storageIndicator.actor);
        }

        // Theme, DND, Night Light, Settings stacked as one column.
        this._iconsBox = new St.BoxLayout({
            vertical: true,
            style: `spacing: ${TOGGLE_COLUMN_SPACING}px;`,
            x_expand: false,
            x_align: Clutter.ActorAlign.END,
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
        // Two children => one gap. The disk takes exactly the remainder, so the
        // icon column's right edge lands on the slot's right edge.
        const iconsWidth = TOGGLE_WIDTH;
        const storageWidth = Math.max(0,
            w - iconsWidth - TOGGLE_COLUMN_SPACING);
        this.actor.style = `spacing: ${TOGGLE_COLUMN_SPACING}px; width: ${w}px;`;
        this.actor.width = w;
        this._iconsBox.style = `spacing: ${TOGGLE_COLUMN_SPACING}px; width: ${iconsWidth}px;`;
        this._iconsBox.width = iconsWidth;
        // Give the disk block its exact width so disk + gap + icons fill the
        // slot precisely. The block's children are centred inside that width,
        // which keeps glyph, percentage and used/total on one vertical axis.
        this._storageIndicator.setWidth(storageWidth);
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
