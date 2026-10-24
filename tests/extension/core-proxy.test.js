import {mustReset, isNewer, reconcileState, CoreProxy} from '../../extension/lib/coreProxy.js';

function expect(actual, expected, label) {
    if (actual !== expected) {
        throw new Error(`${label}: expected ${expected}, got ${actual}`);
    }
}

// 1. Pure helper: mustReset
expect(mustReset('inst-A', 'inst-B'), true, 'Distinct instance IDs must reset');
expect(mustReset(null, 'inst-A'), true, 'Initial instance connection must reset');
expect(mustReset('inst-A', null), true, 'Owner loss must reset');
expect(mustReset('inst-A', 'inst-A'), false, 'Same instance ID must not reset');

// 2. Pure helper: isNewer
expect(isNewer(5, 0, false), true, 'New instance revision 0 accepted over old revision 5');
expect(isNewer(5, 6, true), true, 'Higher revision on same instance is newer');
expect(isNewer(5, 5, true), false, 'Same revision on same instance is not newer');
expect(isNewer(5, 4, true), false, 'Stale revision on same instance is rejected');

// 3. Pure reconciler: owner sequence :1.20 -> null -> :1.21
{
    let current = {
        connected: true,
        instanceId: 'A',
        mediaRevision: 5,
        media: {title: 'Old Song'},
        settingsRevision: 2,
        settings: {theme: 'dark'},
    };

    // Owner disconnected (:1.20 -> null)
    let disconnected = reconcileState(current, {type: 'OWNER_CHANGED', nameOwner: null});
    expect(disconnected.connected, false, 'Disconnected on owner loss');
    expect(disconnected.instanceId, null, 'Instance ID cleared on disconnect');
    expect(disconnected.mediaRevision, 0, 'Media revision reset on disconnect');
    expect(Object.keys(disconnected.media).length, 0, 'Media cleared on disconnect');
    // Local settings retained during disconnect
    expect(disconnected.settings.theme, 'dark', 'Settings retained for offline fallback');

    // New owner (:1.21 with instance B, rev 0)
    let snapshotB = {
        instanceId: 'B',
        status: 'ready',
        mediaRevision: 0,
        media: {},
        settingsRevision: 0,
        settings: {theme: 'system'},
    };
    let connectedB = reconcileState(disconnected, {type: 'SNAPSHOT_LOADED', snapshot: snapshotB});
    expect(connectedB.connected, true, 'Connected to new owner');
    expect(connectedB.instanceId, 'B', 'Adopted instance B');
    expect(connectedB.mediaRevision, 0, 'Adopted revision 0 without discarding as old');
    expect(connectedB.settings.theme, 'system', 'Adopted settings from instance B');
}

// 4. Stale vs newer signals on same instance
{
    let current = {
        connected: true,
        instanceId: 'B',
        mediaRevision: 2,
        media: {title: 'Song 2'},
        settingsRevision: 1,
        settings: {theme: 'dark'},
    };

    // Stale media signal (rev 1 <= 2)
    let stale = reconcileState(current, {
        type: 'MEDIA_CHANGED',
        instanceId: 'B',
        revision: 1,
        media: {title: 'Stale Song'},
    });
    expect(stale.mediaRevision, 2, 'Stale signal revision ignored');
    expect(stale.media.title, 'Song 2', 'Stale media content ignored');

    // Newer media signal (rev 3 > 2)
    let newer = reconcileState(current, {
        type: 'MEDIA_CHANGED',
        instanceId: 'B',
        revision: 3,
        media: {title: 'Newer Song'},
    });
    expect(newer.mediaRevision, 3, 'Newer signal revision accepted');
    expect(newer.media.title, 'Newer Song', 'Newer media content accepted');
}

// 5. CoreProxy lifecycle contract
{
    let stateUpdates = [];
    const proxy = new CoreProxy({
        onStateChanged: state => stateUpdates.push(state),
    });

    expect(proxy.state.connected, false, 'Initially disconnected');
    expect(typeof proxy.destroy, 'function', 'destroy method exists');

    proxy.destroy();
    expect(proxy.isDestroyed, true, 'Proxy marked destroyed');
}

console.log('PASS: 18 core-proxy and reconciler tests');
