// Reactive Quick Settings manager for GNOME Shell (v0.2)
// Manages DND, Night Light, and Dark Mode via standard GSettings schemas.

let Gio = null;
if (typeof process === 'undefined') {
    try {
        Gio = (await import('gi://Gio')).default;
    } catch (_) {}
}

function defaultSettingsFactory(schemaId) {
    if (Gio && Gio.Settings) {
        try {
            return new Gio.Settings({schema_id: schemaId});
        } catch {
            return null;
        }
    }
    return null;
}

export class QuickSettingsManager {
    constructor({settingsFactory = defaultSettingsFactory} = {}) {
        this._factory = settingsFactory;
        this._listeners = new Set();
        this._signalIds = [];

        this._notifSettings = this._factory('org.gnome.desktop.notifications');
        this._colorSettings = this._factory('org.gnome.settings-daemon.plugins.color');
        this._ifaceSettings = this._factory('org.gnome.desktop.interface');

        this._hookSignals();
    }

    _hookSignals() {
        if (this._notifSettings && typeof this._notifSettings.connect === 'function') {
            const id = this._notifSettings.connect('changed::show-banners', () => this._emit());
            this._signalIds.push({store: this._notifSettings, id});
        }
        if (this._colorSettings && typeof this._colorSettings.connect === 'function') {
            const id = this._colorSettings.connect('changed::night-light-enabled', () => this._emit());
            this._signalIds.push({store: this._colorSettings, id});
        }
        if (this._ifaceSettings && typeof this._ifaceSettings.connect === 'function') {
            const id = this._ifaceSettings.connect('changed::color-scheme', () => this._emit());
            this._signalIds.push({store: this._ifaceSettings, id});
        }
    }

    getState() {
        let dnd = false;
        if (this._notifSettings && typeof this._notifSettings.get_boolean === 'function') {
            // When show-banners is false, DND is active
            dnd = !this._notifSettings.get_boolean('show-banners');
        }

        let nightLight = false;
        if (this._colorSettings && typeof this._colorSettings.get_boolean === 'function') {
            nightLight = this._colorSettings.get_boolean('night-light-enabled');
        }

        let darkMode = false;
        if (this._ifaceSettings && typeof this._ifaceSettings.get_string === 'function') {
            const scheme = this._ifaceSettings.get_string('color-scheme');
            darkMode = (scheme === 'prefer-dark');
        }

        return {
            dnd,
            nightLight,
            darkMode,
        };
    }

    toggleDnd() {
        if (this._notifSettings && typeof this._notifSettings.set_boolean === 'function') {
            const current = this._notifSettings.get_boolean('show-banners');
            this._notifSettings.set_boolean('show-banners', !current);
        }
    }

    toggleNightLight() {
        if (this._colorSettings && typeof this._colorSettings.set_boolean === 'function') {
            const current = this._colorSettings.get_boolean('night-light-enabled');
            this._colorSettings.set_boolean('night-light-enabled', !current);
        }
    }

    toggleDarkMode() {
        if (this._ifaceSettings && typeof this._ifaceSettings.set_string === 'function') {
            const current = this._ifaceSettings.get_string('color-scheme');
            const next = (current === 'prefer-dark') ? 'default' : 'prefer-dark';
            this._ifaceSettings.set_string('color-scheme', next);
        }
    }

    connect(fn) {
        this._listeners.add(fn);
        return fn;
    }

    disconnect(fn) {
        this._listeners.delete(fn);
    }

    _emit() {
        const state = this.getState();
        for (const fn of this._listeners) {
            try {
                fn(state);
            } catch {
                // Ignore listener exceptions
            }
        }
    }

    destroy() {
        for (const {store, id} of this._signalIds) {
            try {
                if (typeof store.disconnect === 'function') store.disconnect(id);
            } catch {
                // Ignore disconnect error
            }
        }
        this._signalIds = [];
        this._listeners.clear();
        this._notifSettings = null;
        this._colorSettings = null;
        this._ifaceSettings = null;
    }
}
