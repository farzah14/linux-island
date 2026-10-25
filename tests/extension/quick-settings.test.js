import {QuickSettingsManager} from '../../extension/lib/quickSettings.js';

function assert(condition, message = 'Assertion failed') {
    if (!condition) throw new Error(message);
}

function assertEqual(actual, expected, message) {
    if (actual !== expected) {
        throw new Error(`${message ? message + ': ' : ''}expected ${expected}, got ${actual}`);
    }
}

// 1. Mock settings store
class MockGSettings {
    constructor(initial = {}) {
        this._values = {...initial};
        this._listeners = new Map();
        this._nextId = 0;
    }
    get_boolean(key) {
        return Boolean(this._values[key]);
    }
    set_boolean(key, val) {
        this._values[key] = Boolean(val);
        this._notify(key);
    }
    get_string(key) {
        return String(this._values[key] ?? '');
    }
    set_string(key, val) {
        this._values[key] = String(val);
        this._notify(key);
    }
    connect(signal, callback) {
        const id = ++this._nextId;
        this._listeners.set(id, {signal, callback});
        return id;
    }
    disconnect(id) {
        this._listeners.delete(id);
    }
    _notify(key) {
        for (const {signal, callback} of this._listeners.values()) {
            if (signal === `changed::${key}` || signal === 'changed') {
                callback(this, key);
            }
        }
    }
}

// 2. Test manager logic with mocks
{
    const notifMock = new MockGSettings({'show-banners': true}); // DND off initially
    const colorMock = new MockGSettings({'night-light-enabled': false});
    const ifaceMock = new MockGSettings({'color-scheme': 'prefer-dark'});

    const stores = {
        'org.gnome.desktop.notifications': notifMock,
        'org.gnome.settings-daemon.plugins.color': colorMock,
        'org.gnome.desktop.interface': ifaceMock,
    };

    let changeCount = 0;
    let lastState = null;

    const mgr = new QuickSettingsManager({
        settingsFactory: (schema) => stores[schema] || null,
    });

    mgr.connect((state) => {
        changeCount++;
        lastState = state;
    });

    const init = mgr.getState();
    assertEqual(init.dnd, false, 'DND should be false when show-banners is true');
    assertEqual(init.nightLight, false, 'Night light initially false');
    assertEqual(init.darkMode, true, 'Dark mode initially true');

    // Toggle DND
    mgr.toggleDnd();
    assertEqual(notifMock.get_boolean('show-banners'), false, 'show-banners should be false');
    assertEqual(mgr.getState().dnd, true, 'DND should now be true');
    assertEqual(changeCount, 1, 'Change event emitted');
    assertEqual(lastState.dnd, true);

    // Toggle Night Light
    mgr.toggleNightLight();
    assertEqual(colorMock.get_boolean('night-light-enabled'), true);
    assertEqual(mgr.getState().nightLight, true);
    assertEqual(changeCount, 2);

    // Toggle Dark Mode
    mgr.toggleDarkMode();
    assertEqual(ifaceMock.get_string('color-scheme'), 'default');
    assertEqual(mgr.getState().darkMode, false);
    assertEqual(changeCount, 3);

    mgr.destroy();
}

console.log('PASS: QuickSettingsManager logic and reactivity tests');
