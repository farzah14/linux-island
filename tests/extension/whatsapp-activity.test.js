import assert from 'node:assert/strict';
import {WhatsAppActivityModel, isWhatsAppSource} from '../../extension/lib/whatsappActivity.js';

// 1. Identity filtering
{
    assert.equal(isWhatsAppSource(null), false);
    assert.equal(isWhatsAppSource({}), false);
    assert.equal(isWhatsAppSource({appId: 'org.gnome.Nautilus'}), false);
    assert.equal(isWhatsAppSource({appId: 'google-chrome'}), false, 'Browser not blindly trusted');
    assert.equal(isWhatsAppSource({appId: 'whatsapp-for-linux'}), true);
    assert.equal(isWhatsAppSource({appId: 'com.whatsapp.WhatsApp'}), true);
    assert.equal(isWhatsAppSource({title: 'WhatsApp'}), true);
    assert.equal(isWhatsAppSource({appId: 'io.github.alexpose.whatsappforlinux'}), true);
}

// 2. Pure activity model state and bounds
{
    let activityState = false;
    const model = new WhatsAppActivityModel({
        maxEntries: 32,
        onActivityChanged: (active) => { activityState = active; },
    });

    assert.equal(model.hasActivity, false);
    assert.equal(model.count, 0);

    // Ignored when disabled
    model.onNotificationAdded('notif-1', true);
    assert.equal(model.hasActivity, false);
    assert.equal(model.count, 0);

    // Enable model
    model.setEnabled(true);
    assert.equal(model.hasActivity, false);

    // Unverified notification ignored
    model.onNotificationAdded('notif-bad', false);
    assert.equal(model.hasActivity, false);
    assert.equal(model.count, 0);

    // Verified notification added
    assert.equal(model.onNotificationAdded('notif-1', true), true);
    assert.equal(model.hasActivity, true);
    assert.equal(activityState, true);
    assert.equal(model.count, 1);

    // Duplicate update does not increment or change state
    assert.equal(model.onNotificationAdded('notif-1', true), false);
    assert.equal(model.count, 1);

    // Second notification
    assert.equal(model.onNotificationAdded('notif-2', true), true);
    assert.equal(model.count, 2);

    // Removal of notification
    assert.equal(model.onNotificationRemoved('notif-1'), true);
    assert.equal(model.count, 1);
    assert.equal(model.hasActivity, true);

    // Unknown removal returns false
    assert.equal(model.onNotificationRemoved('notif-unknown'), false);

    // Removal of last notification clears activity
    assert.equal(model.onNotificationRemoved('notif-2'), true);
    assert.equal(model.count, 0);
    assert.equal(model.hasActivity, false);
    assert.equal(activityState, false);

    // 32-entry bounded overflow
    for (let i = 0; i < 40; ++i) {
        model.onNotificationAdded(`msg-${i}`, true);
    }
    assert.equal(model.count, 32, 'Must not exceed 32 entries');
    assert.equal(model.hasActivity, true);

    // Source disconnected clears entries
    model.onSourceDisconnected();
    assert.equal(model.count, 0);
    assert.equal(model.hasActivity, false);
    assert.equal(activityState, false);

    // DND suppresses active indicator
    model.onNotificationAdded('msg-dnd', true);
    assert.equal(model.hasActivity, true);
    model.setDnd(true);
    assert.equal(model.hasActivity, false, 'DND suppresses activity display');
    model.setDnd(false);
    assert.equal(model.hasActivity, true, 'DND ended restores activity display');

    // Screen lock clears entries and activity
    model.setLocked(true);
    assert.equal(model.hasActivity, false);
    assert.equal(model.count, 0, 'Locking clears notification references');
    model.setLocked(false);
    assert.equal(model.hasActivity, false);

    // Disabling clears entries
    model.onNotificationAdded('msg-final', true);
    assert.equal(model.hasActivity, true);
    model.setEnabled(false);
    assert.equal(model.hasActivity, false);
    assert.equal(model.count, 0);

    model.destroy();
}

console.log('PASS: WhatsApp activity model policy and bounds');
