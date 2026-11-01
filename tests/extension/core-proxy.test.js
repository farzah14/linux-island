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

// 6. queryAvailablePlayers on MediaChanged and snapshot load
{
    let listNamesCount = 0;
    let receivedPlayers = null;
    const fakeGio = {
        DBusCallFlags: { NONE: 0 },
        DBus: {
            session: {
                call(bus, path, iface, method, params, replyType, flags, timeout, cancellable, callback) {
                    if (method === 'ListNames') {
                        listNamesCount++;
                        callback(this, {
                            deepUnpack: () => [['org.mpris.MediaPlayer2.spotify', 'org.freedesktop.DBus']],
                        });
                    }
                },
                call_finish(res) {
                    return res;
                },
            },
        },
    };

    const proxy = new CoreProxy({
        gio: fakeGio,
        onPlayersChanged: players => { receivedPlayers = players; },
    });

    proxy._state.instanceId = 'test-inst';
    proxy._onSignal('MediaChanged', [1, { title: 'Song' }]);
    expect(listNamesCount, 1, 'queryAvailablePlayers invoked on MediaChanged signal');
    expect(receivedPlayers && receivedPlayers[0], 'org.mpris.MediaPlayer2.spotify', 'available players populated');
    proxy.destroy();

    // Snapshot load invokes queryAvailablePlayers
    let snapshotListNamesCount = 0;
    const snapGio = {
        DBusCallFlags: { NONE: 0 },
        DBus: {
            session: {
                call(bus, path, iface, method, params, replyType, flags, timeout, cancellable, callback) {
                    if (method === 'ListNames') {
                        snapshotListNamesCount++;
                        callback(this, {
                            deepUnpack: () => [['org.mpris.MediaPlayer2.vlc']],
                        });
                    }
                },
                call_finish(res) {
                    return res;
                },
            },
        },
    };
    const snapProxy = new CoreProxy({
        gio: snapGio,
    });
    snapProxy._proxy = {
        g_name_owner: ':1.99',
        call(method, params, flags, timeout, cancellable, callback) {
            if (method === 'GetSnapshot') {
                callback(this, {
                    deepUnpack: () => [{
                        instanceId: 'inst-snap',
                        mediaRevision: 0,
                        settingsRevision: 0,
                        status: 'ready',
                        media: {},
                        settings: {},
                    }],
                });
            }
        },
        call_finish(res) {
            return res;
        },
    };
    snapProxy._fetchSnapshot();
    expect(snapshotListNamesCount, 1, 'queryAvailablePlayers invoked on snapshot load');
    snapProxy.destroy();

    // Test numeric settings encoding under GJS
    if (typeof process === 'undefined') {
        const gi = await import('gi://Gio');
        const gjsGio = gi.default ?? gi;
        let updateParams = null;
        const gjsProxy = new CoreProxy({ gio: gjsGio });
        gjsProxy._proxy = {
            g_name_owner: ':1.100',
            call(method, params, flags, timeout, cancellable, callback) {
                if (method === 'UpdateSettings') {
                    updateParams = params;
                    callback(this, {});
                }
            },
            call_finish() {
                return { deepUnpack: () => [true] };
            },
        };
        await gjsProxy.updateSettings({
            theme: 'dark',
            animationEnabled: false,
            verticalOffset: 32,
            opacityFraction: 0.85,
        });
        expect(Boolean(updateParams), true, 'UpdateSettings called with params in GJS');
        const [unpacked] = updateParams.deepUnpack();
        expect(unpacked.verticalOffset?.deepUnpack?.() ?? unpacked.verticalOffset, 32, 'Integer offset encoded');
        expect(Math.abs((unpacked.opacityFraction?.deepUnpack?.() ?? unpacked.opacityFraction) - 0.85) < 0.001, true, 'Float encoded');
        gjsProxy.destroy();
    }
}

console.log('PASS: 18 core-proxy and reconciler tests');
