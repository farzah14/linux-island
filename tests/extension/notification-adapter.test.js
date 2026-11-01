// NotificationAdapter bridge tests.
//
// Runs under both `node` and `gjs -m`: no Node built-ins are imported, so the
// same file proves the adapter's GNOME-facing logic on a plain JS engine.

import {NotificationAdapter} from '../../extension/lib/notificationAdapter.js';

function fail(message) {
    throw new Error(message);
}

const assert = {
    equal(actual, expected, message = '') {
        if (actual !== expected)
            fail(`${message}\n  expected: ${String(expected)}\n  actual:   ${String(actual)}`);
    },
    deepEqual(actual, expected, message = '') {
        const a = JSON.stringify(actual);
        const b = JSON.stringify(expected);
        if (a !== b)
            fail(`${message}\n  expected: ${b}\n  actual:   ${a}`);
    },
};

class FakeSource {
    constructor({appId, title, unsupportedSignals = []}) {
        this.app = {get_id: () => appId};
        this.title = title;
        this.handlers = new Map();
        this.notifications = [];
        this.nextId = 1;
        this.unsupportedSignals = new Set(unsupportedSignals);
    }
    connect(name, fn) {
        if (this.unsupportedSignals.has(name))
            throw new Error(`no such signal: ${name}`);
        const id = this.nextId++;
        this.handlers.set(id, {name, fn});
        return id;
    }
    disconnect(id) {
        this.handlers.delete(id);
    }
    signalNames() {
        return [...this.handlers.values()].map(item => item.name);
    }
    emit(name, ...args) {
        for (const item of [...this.handlers.values()]) {
            if (item.name === name)
                item.fn(this, ...args);
        }
    }
}

class FakeTray {
    constructor() {
        this.sources = [];
        this.handlers = new Map();
        this.nextId = 1;
    }
    getSources() {
        return [...this.sources];
    }
    connect(name, fn) {
        const id = this.nextId++;
        this.handlers.set(id, {name, fn});
        return id;
    }
    disconnect(id) {
        this.handlers.delete(id);
    }
    emit(name, ...args) {
        for (const item of [...this.handlers.values()]) {
            if (item.name === name)
                item.fn(this, ...args);
        }
    }
}

// 1. WhatsApp notification activity via messageTray
{
    const tray = new FakeTray();
    let activityState = false;
    let peekMeta = null;

    const adapter = new NotificationAdapter({
        enabled: true,
        whatsappEnabled: true,
        messageTray: tray,
        onNotificationPeek: meta => {
            peekMeta = meta;
        },
        onWhatsAppActivityChanged: active => {
            activityState = active;
        },
    });

    assert.equal(adapter.hasWhatsAppActivity, false);

    // Non-whatsapp source added
    const otherSource = new FakeSource({appId: 'org.gnome.Calculator', title: 'Calculator'});
    tray.sources.push(otherSource);
    tray.emit('source-added', otherSource);

    const otherNotif = {id: 101, activate() {}};
    otherSource.emit('notification-added', otherNotif);
    assert.equal(adapter.hasWhatsAppActivity, false,
        'Non-WhatsApp notification must not trigger WhatsApp activity');

    // WhatsApp source added
    const waSource = new FakeSource({appId: 'com.whatsapp.WhatsApp', title: 'WhatsApp'});
    tray.sources.push(waSource);
    tray.emit('source-added', waSource);

    let activated = false;
    const waNotif1 = {
        id: 'wa-1',
        activate: () => {
            activated = true;
        },
    };
    waSource.emit('notification-added', waNotif1);

    assert.equal(adapter.hasWhatsAppActivity, true, 'WhatsApp notification triggers activity');
    assert.equal(activityState, true);

    // Duplicate notification does not re-trigger
    waSource.emit('notification-added', waNotif1);
    assert.equal(adapter.hasWhatsAppActivity, true);

    // Activation executes the native notification activate()
    adapter.activateWhatsApp();
    assert.equal(activated, true);
    assert.equal(adapter.hasWhatsAppActivity, false, 'Activation clears activity');

    // Second notification and removal
    const waNotif2 = {id: 'wa-2', activate() {}};
    waSource.emit('notification-added', waNotif2);
    assert.equal(adapter.hasWhatsAppActivity, true);

    waSource.emit('notification-removed', waNotif2);
    assert.equal(adapter.hasWhatsAppActivity, false, 'Removing notification clears activity');

    // Teardown cleans up signal handlers
    adapter.destroy();
    assert.equal(tray.handlers.size, 0, 'Tray handlers disconnected');
    assert.equal(waSource.handlers.size, 0, 'Source handlers disconnected');
}

// 2. Unrelated source removal does not clear WhatsApp activity and notification-added triggers peek
{
    const tray = new FakeTray();
    let peeked = null;
    const adapter = new NotificationAdapter({
        enabled: true,
        whatsappEnabled: true,
        messageTray: tray,
        onNotificationPeek: meta => {
            peeked = meta;
        },
    });

    const waSource = new FakeSource({appId: 'com.whatsapp.WhatsApp', title: 'WhatsApp'});
    const terminalSource = new FakeSource({appId: 'org.gnome.Terminal', title: 'Terminal'});
    tray.sources.push(waSource, terminalSource);
    tray.emit('source-added', waSource);
    tray.emit('source-added', terminalSource);

    // Notification added on terminal triggers peek
    terminalSource.emit('notification-added', {id: 1001});
    assert.deepEqual(peeked, {appName: 'Terminal', urgency: 'normal'},
        'notification-added triggers onNotificationPeek');

    // Add WhatsApp notification
    waSource.emit('notification-added', {id: 'wa-msg-1'});
    assert.equal(adapter.hasWhatsAppActivity, true);

    // Remove terminal source: must NOT clear WhatsApp activity
    tray.emit('source-removed', terminalSource);
    assert.equal(adapter.hasWhatsAppActivity, true,
        'Removing unrelated source must not clear WhatsApp activity');

    adapter.destroy();
}

// 3. GNOME 45 sources have no notification-removed signal.
//    Connecting must not throw and must not be recorded for disconnect.
{
    const tray = new FakeTray();
    const source = new FakeSource({
        appId: 'com.whatsapp.WhatsApp',
        title: 'WhatsApp',
        unsupportedSignals: ['notification-removed'],
    });
    tray.sources.push(source);

    let adapter = null;
    let threw = null;
    try {
        adapter = new NotificationAdapter({
            enabled: true,
            whatsappEnabled: true,
            messageTray: tray,
        });
    } catch (err) {
        threw = err;
    }
    assert.equal(threw, null, `construction must not throw: ${threw}`);
    assert.equal(tray.sources.length, 1);

    const names = source.signalNames();
    assert.equal(names.includes('notification-added'), true, 'notification-added subscribed');
    assert.equal(names.includes('destroy'), true, 'destroy subscribed');
    assert.equal(names.includes('notification-removed'), false,
        'notification-removed must not be subscribed when the signal is missing');

    // Tracking still works without the removal signal.
    source.emit('notification-added', {id: 'wa-45'});
    assert.equal(adapter.hasWhatsAppActivity, true);

    // Destroy must tolerate the absent id.
    adapter.destroy();
    assert.equal(source.handlers.size, 0, 'source handlers disconnected');
    assert.equal(tray.handlers.size, 0, 'tray handlers disconnected');
}

console.log('PASS: NotificationAdapter WhatsApp bridge tests');
