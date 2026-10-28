import assert from 'node:assert/strict';
import {NotificationAdapter} from '../../extension/lib/notificationAdapter.js';

class FakeSource {
    constructor({appId, title}) {
        this.app = { get_id: () => appId };
        this.title = title;
        this.handlers = new Map();
        this.notifications = [];
        this.nextId = 1;
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
        for (const [id, item] of this.handlers.entries()) {
            if (item.name === name) item.fn(this, ...args);
        }
    }
}

class FakeTray {
    constructor() {
        this.sources = [];
        this.handlers = new Map();
        this.nextId = 1;
    }
    getSources() { return [...this.sources]; }
    connect(name, fn) {
        const id = this.nextId++;
        this.handlers.set(id, {name, fn});
        return id;
    }
    disconnect(id) {
        this.handlers.delete(id);
    }
    emit(name, ...args) {
        for (const [id, item] of this.handlers.entries()) {
            if (item.name === name) item.fn(this, ...args);
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
        onNotificationPeek: (meta) => { peekMeta = meta; },
        onWhatsAppActivityChanged: (active) => { activityState = active; },
    });

    assert.equal(adapter.hasWhatsAppActivity, false);

    // Non-whatsapp source added
    const otherSource = new FakeSource({appId: 'org.gnome.Calculator', title: 'Calculator'});
    tray.sources.push(otherSource);
    tray.emit('source-added', otherSource);

    const otherNotif = { id: 101, activate() {} };
    otherSource.emit('notification-added', otherNotif);
    assert.equal(adapter.hasWhatsAppActivity, false, 'Non-WhatsApp notification must not trigger WhatsApp activity');

    // WhatsApp source added
    const waSource = new FakeSource({appId: 'com.whatsapp.WhatsApp', title: 'WhatsApp'});
    tray.sources.push(waSource);
    tray.emit('source-added', waSource);

    let activated = false;
    const waNotif1 = { id: 'wa-1', activate: () => { activated = true; } };
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
    const waNotif2 = { id: 'wa-2', activate: () => {} };
    waSource.emit('notification-added', waNotif2);
    assert.equal(adapter.hasWhatsAppActivity, true);

    waSource.emit('notification-removed', waNotif2);
    assert.equal(adapter.hasWhatsAppActivity, false, 'Removing notification clears activity');

    // Teardown cleans up signal handlers
    adapter.destroy();
    assert.equal(tray.handlers.size, 0, 'Tray handlers disconnected');
    assert.equal(waSource.handlers.size, 0, 'Source handlers disconnected');
}

console.log('PASS: NotificationAdapter WhatsApp bridge tests');
