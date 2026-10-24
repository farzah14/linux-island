// Nonblocking GJS CoreProxy with owner restart and revision cache.
// Pure functions run under Node.js and GJS; DBus operations use Gio when available.

let Gio = null;
if (typeof process === 'undefined') {
    try {
        const gi = await import('gi://Gio');
        Gio = gi.default ?? gi;
    } catch (_) {}
}

export function mustReset(oldInstanceId, newInstanceId) {
    return oldInstanceId !== newInstanceId;
}

export function isNewer(oldRevision, nextRevision, sameInstance) {
    return !sameInstance || nextRevision > oldRevision;
}

export function unpackVariant(v) {
    if (!v) return v;
    if (typeof v.deepUnpack === 'function') {
        return unpackVariant(v.deepUnpack());
    }
    if (Array.isArray(v)) {
        return v.map(unpackVariant);
    }
    if (typeof v === 'object') {
        const res = {};
        for (const [k, val] of Object.entries(v)) {
            res[k] = unpackVariant(val);
        }
        return res;
    }
    return v;
}

export function reconcileState(current, action) {
    switch (action.type) {
    case 'OWNER_CHANGED': {
        if (!action.nameOwner) {
            return {
                ...current,
                connected: false,
                instanceId: null,
                status: 'disconnected',
                mediaRevision: 0,
                media: {},
                // Settings retained for offline UI fallback
            };
        }
        return current;
    }
    case 'SNAPSHOT_LOADED': {
        const snap = action.snapshot;
        return {
            ...current,
            connected: true,
            instanceId: snap.instanceId ?? null,
            status: snap.status ?? 'ready',
            mediaRevision: Number(snap.mediaRevision ?? 0),
            media: snap.media ?? {},
            settingsRevision: Number(snap.settingsRevision ?? 0),
            settings: snap.settings ?? current.settings,
            capabilities: snap.capabilities ?? {},
        };
    }
    case 'MEDIA_CHANGED': {
        const sameInstance = action.instanceId === current.instanceId;
        if (isNewer(current.mediaRevision, action.revision, sameInstance)) {
            return {
                ...current,
                mediaRevision: Number(action.revision),
                media: action.media ?? {},
            };
        }
        return current;
    }
    case 'SETTINGS_CHANGED': {
        const sameInstance = action.instanceId === current.instanceId;
        if (isNewer(current.settingsRevision, action.revision, sameInstance)) {
            return {
                ...current,
                settingsRevision: Number(action.revision),
                settings: action.settings ?? {},
            };
        }
        return current;
    }
    case 'STATUS_CHANGED': {
        return {
            ...current,
            status: action.status ?? current.status,
        };
    }
    default:
        return current;
    }
}

export class CoreProxy {
    /**
     * @param {Object} [options]
     * @param {Function} [options.onStateChanged]
     * @param {Object} [options.gio] - Mock or injected Gio
     */
    constructor({onStateChanged, gio} = {}) {
        this._gio = gio ?? Gio;
        this._onStateChanged = onStateChanged ?? (() => {});
        this._isDestroyed = false;
        this._handlers = [];

        this._state = {
            connected: false,
            instanceId: null,
            status: 'disconnected',
            mediaRevision: 0,
            media: {},
            settingsRevision: 0,
            settings: {},
            capabilities: {},
        };

        this._cancellable = this._gio?.Cancellable ? new this._gio.Cancellable() : null;
        this._proxy = null;

        if (this._gio?.DBusProxy) {
            this._initProxy();
        }
    }

    get state() {
        return this._state;
    }

    get isDestroyed() {
        return this._isDestroyed;
    }

    _setState(nextState) {
        if (this._isDestroyed)
            return;
        this._state = nextState;
        this._onStateChanged(this._state);
    }

    _initProxy() {
        this._gio.DBusProxy.new_for_bus(
            this._gio.BusType.SESSION,
            this._gio.DBusProxyFlags.NONE,
            null,
            'io.github.linuxisland.Core',
            '/io/github/linuxisland/Core',
            'io.github.linuxisland.Core1',
            this._cancellable,
            (source, res) => {
                if (this._isDestroyed)
                    return;
                try {
                    this._proxy = this._gio.DBusProxy.new_for_bus_finish(res);
                    this._setupHandlers();
                } catch (e) {
                    // Service unavailable at startup is expected; proxy monitors bus owner
                }
            }
        );
    }

    _setupHandlers() {
        if (!this._proxy || this._isDestroyed)
            return;

        const ownerId = this._proxy.connect('notify::g-name-owner', () => {
            this._onOwnerChanged();
        });
        this._handlers.push({source: this._proxy, id: ownerId});

        const sigId = this._proxy.connect('g-signal', (_proxy, _sender, sigName, params) => {
            this._onSignal(sigName, params);
        });
        this._handlers.push({source: this._proxy, id: sigId});

        // If service is already active, fetch snapshot
        if (this._proxy.g_name_owner) {
            this._fetchSnapshot();
        }
    }

    _onOwnerChanged() {
        if (this._isDestroyed || !this._proxy)
            return;

        const owner = this._proxy.g_name_owner;
        if (!owner) {
            const next = reconcileState(this._state, {type: 'OWNER_CHANGED', nameOwner: null});
            this._setState(next);
        } else {
            this._fetchSnapshot();
        }
    }

    _fetchSnapshot() {
        if (this._isDestroyed || !this._proxy || !this._proxy.g_name_owner)
            return;

        this._proxy.call(
            'GetSnapshot',
            null,
            this._gio.DBusCallFlags.NONE,
            -1,
            this._cancellable,
            (proxy, res) => {
                if (this._isDestroyed)
                    return;
                try {
                    const reply = proxy.call_finish(res);
                    const [rawSnap] = reply.deepUnpack();
                    const snap = unpackVariant(rawSnap);
                    const next = reconcileState(this._state, {
                        type: 'SNAPSHOT_LOADED',
                        snapshot: snap,
                    });
                    this._setState(next);
                } catch (_) {
                    // Call cancelled or service exited
                }
            }
        );
    }

    _onSignal(sigName, params) {
        if (this._isDestroyed)
            return;

        try {
            const unpacked = unpackVariant(params);
            if (sigName === 'MediaChanged') {
                const [rev, media] = unpacked;
                const next = reconcileState(this._state, {
                    type: 'MEDIA_CHANGED',
                    instanceId: this._state.instanceId,
                    revision: rev,
                    media,
                });
                this._setState(next);
            } else if (sigName === 'SettingsChanged') {
                const [rev, settings] = unpacked;
                const next = reconcileState(this._state, {
                    type: 'SETTINGS_CHANGED',
                    instanceId: this._state.instanceId,
                    revision: rev,
                    settings,
                });
                this._setState(next);
            } else if (sigName === 'CoreStatusChanged') {
                const [status] = unpacked;
                const next = reconcileState(this._state, {
                    type: 'STATUS_CHANGED',
                    status,
                });
                this._setState(next);
            }
        } catch (_) {}
    }
    async controlMedia(action) {
        if (this._isDestroyed || !this._proxy || !this._proxy.g_name_owner || this._controlInflight) {
            return false;
        }

        this._controlInflight = true;
        return new Promise(resolve => {
            const GLib = (typeof globalThis.imports !== 'undefined' && globalThis.imports.gi?.GLib)
                ? globalThis.imports.gi.GLib
                : null;
            const params = GLib ? new GLib.Variant('(s)', [action]) : null;

            this._proxy.call(
                'ControlMedia',
                params,
                this._gio.DBusCallFlags.NONE,
                -1,
                this._cancellable,
                (proxy, res) => {
                    this._controlInflight = false;
                    if (this._isDestroyed) {
                        resolve(false);
                        return;
                    }
                    try {
                        const reply = proxy.call_finish(res);
                        const [accepted] = reply.deepUnpack();
                        resolve(Boolean(accepted));
                    } catch (_) {
                        resolve(false);
                    }
                }
            );
        });
    }


    destroy() {
        if (this._isDestroyed)
            return;
        this._isDestroyed = true;

        if (this._cancellable) {
            try {
                this._cancellable.cancel();
            } catch (_) {}
            this._cancellable = null;
        }

        for (const {source, id} of this._handlers) {
            try {
                if (typeof source.disconnect === 'function')
                    source.disconnect(id);
            } catch (_) {}
        }
        this._handlers = [];
        this._proxy = null;
    }
}
