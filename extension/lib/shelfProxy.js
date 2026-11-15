// GNOME Shell D-Bus proxy for io.github.linuxisland.Shelf1.

let Gio = null;
let GLib = null;
if (typeof process === 'undefined') {
    try {
        ({default: Gio} = await import('gi://Gio'));
        ({default: GLib} = await import('gi://GLib'));
    } catch (_) {}
}

export const SHELF_BUS_NAME = 'io.github.linuxisland.Core';
export const SHELF_OBJECT_PATH = '/io/github/linuxisland/Core';
export const SHELF_INTERFACE_NAME = 'io.github.linuxisland.Shelf1';

export const EMPTY_SHELF = Object.freeze({
    revision: 0,
    count: 0,
    maxItems: 12,
    items: Object.freeze([]),
});

export const INITIAL_SHELF_STATE = Object.freeze({
    connected: false,
    owner: null,
    shelfRevision: -1,
    shelf: EMPTY_SHELF,
    shelfServiceAvailable: false,
});

function unpackVariant(value) {
    if (value === null || value === undefined)
        return value;
    if (typeof value.deepUnpack === 'function')
        return unpackVariant(value.deepUnpack());
    if (Array.isArray(value))
        return value.map(unpackVariant);
    if (value && typeof value === 'object' && !(value instanceof Uint8Array)) {
        const out = {};
        for (const [k, v] of Object.entries(value))
            out[k] = unpackVariant(v);
        return out;
    }
    return value;
}

export function normalizeShelfItem(raw = {}) {
    return {
        id: String(raw.id ?? ''),
        uri: String(raw.uri ?? ''),
        path: String(raw.path ?? ''),
        name: String(raw.name ?? ''),
        mimeType: String(raw.mimeType ?? 'application/octet-stream'),
        sizeBytes: Number(raw.sizeBytes ?? 0),
        isDir: Boolean(raw.isDir ?? false),
        addedAtMs: Number(raw.addedAtMs ?? 0),
        exists: raw.exists === undefined ? true : Boolean(raw.exists),
    };
}

export function normalizeShelfSnapshot(raw = {}) {
    const items = Array.isArray(raw.items) ? raw.items.map(normalizeShelfItem) : [];
    const maxItems = Number(raw.maxItems ?? 12);
    return {
        revision: Number(raw.revision ?? 0),
        count: Number(raw.count ?? items.length),
        maxItems: Number.isFinite(maxItems) && maxItems > 0 ? maxItems : 12,
        items,
    };
}

export function reconcileShelfState(state, event) {
    if (!event)
        return state;

    if (event.type === 'OWNER_CHANGED') {
        if (!event.nameOwner) {
            return {
                ...state,
                connected: false,
                owner: null,
                shelfRevision: -1,
                shelf: EMPTY_SHELF,
                shelfServiceAvailable: false,
            };
        }
        const ownerChanged = state.owner !== event.nameOwner;
        return {
            ...state,
            connected: true,
            owner: event.nameOwner,
            shelfRevision: ownerChanged ? -1 : state.shelfRevision,
        };
    }

    if (event.type === 'SHELF_CHANGED') {
        const owner = event.owner ?? state.owner;
        const revision = Number(event.revision ?? 0);
        const sameOwner = owner === state.owner;
        if (sameOwner && state.shelfRevision >= 0 && revision <= state.shelfRevision)
            return state;

        const shelf = normalizeShelfSnapshot({...event.shelf, revision});
        return {
            ...state,
            connected: true,
            owner,
            shelfRevision: revision,
            shelf,
            shelfServiceAvailable: true,
        };
    }

    return state;
}

export class ShelfProxy {
    constructor(options = {}) {
        this._onStateChanged = options.onStateChanged ?? null;
        this._gio = options.gio ?? Gio;
        this._glib = options.glib ?? GLib;
        this._state = {...INITIAL_SHELF_STATE, shelf: EMPTY_SHELF};
        this._proxy = null;
        this._handlers = [];
        this._isDestroyed = false;
        this._cancellable = this._gio ? new this._gio.Cancellable() : null;

        if (this._gio && !options.deferInit)
            this._initProxy();
    }

    get state() {
        return this._state;
    }

    get isDestroyed() {
        return this._isDestroyed;
    }

    _setState(next) {
        if (this._isDestroyed || next === this._state)
            return;
        this._state = next;
        this._onStateChanged?.(this._state);
    }

    _initProxy() {
        this._gio.DBusProxy.new_for_bus(
            this._gio.BusType.SESSION,
            this._gio.DBusProxyFlags.NONE,
            null,
            SHELF_BUS_NAME,
            SHELF_OBJECT_PATH,
            SHELF_INTERFACE_NAME,
            this._cancellable,
            (_source, res) => {
                if (this._isDestroyed)
                    return;
                try {
                    this._proxy = this._gio.DBusProxy.new_for_bus_finish(res);
                    this._setupHandlers();
                } catch (_) {
                    // Core offline at startup; proxy watches g-name-owner.
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

        if (this._proxy.g_name_owner)
            this._onOwnerChanged();
    }

    _onOwnerChanged() {
        if (this._isDestroyed || !this._proxy)
            return;

        const nameOwner = this._proxy.g_name_owner ?? null;
        this._setState(reconcileShelfState(this._state, {type: 'OWNER_CHANGED', nameOwner}));
        if (nameOwner)
            this._fetchShelf();
    }

    _fetchShelf() {
        if (this._isDestroyed || !this._proxy || !this._proxy.g_name_owner)
            return;
        const owner = this._proxy.g_name_owner;

        this._proxy.call(
            'GetShelf',
            null,
            this._gio.DBusCallFlags.NONE,
            -1,
            this._cancellable,
            (proxy, res) => {
                if (this._isDestroyed || proxy.g_name_owner !== owner)
                    return;
                try {
                    const reply = proxy.call_finish(res);
                    const [raw] = reply.deepUnpack();
                    const shelf = unpackVariant(raw);
                    this._setState(reconcileShelfState(this._state, {
                        type: 'SHELF_CHANGED',
                        owner,
                        revision: Number(shelf?.revision ?? 0),
                        shelf,
                    }));
                } catch (_) {}
            }
        );
    }

    _onSignal(sigName, params) {
        if (this._isDestroyed || sigName !== 'ShelfChanged')
            return;
        try {
            const [rev, shelf] = unpackVariant(params);
            this._setState(reconcileShelfState(this._state, {
                type: 'SHELF_CHANGED',
                owner: this._state.owner,
                revision: rev,
                shelf,
            }));
        } catch (_) {}
    }

    refresh() {
        this._fetchShelf();
    }

    async addFiles(uris) {
        if (this._isDestroyed || !this._proxy || !this._proxy.g_name_owner || !this._glib)
            return false;
        const clean = Array.isArray(uris)
            ? uris.map(u => String(u ?? '').trim()).filter(Boolean)
            : [];
        if (clean.length === 0)
            return false;

        return new Promise(resolve => {
            const params = new this._glib.Variant('(as)', [clean]);
            this._proxy.call(
                'AddFiles',
                params,
                this._gio.DBusCallFlags.NONE,
                -1,
                this._cancellable,
                (proxy, res) => {
                    if (this._isDestroyed) {
                        resolve(false);
                        return;
                    }
                    try {
                        const [accepted] = proxy.call_finish(res).deepUnpack();
                        resolve(Boolean(accepted));
                    } catch (_) {
                        resolve(false);
                    }
                }
            );
        });
    }

    async removeFile(id) {
        if (this._isDestroyed || !this._proxy || !this._proxy.g_name_owner || !this._glib)
            return false;
        const cleanId = String(id ?? '').trim();
        if (!cleanId)
            return false;

        return new Promise(resolve => {
            const params = new this._glib.Variant('(s)', [cleanId]);
            this._proxy.call(
                'RemoveFile',
                params,
                this._gio.DBusCallFlags.NONE,
                -1,
                this._cancellable,
                (proxy, res) => {
                    if (this._isDestroyed) {
                        resolve(false);
                        return;
                    }
                    try {
                        const [accepted] = proxy.call_finish(res).deepUnpack();
                        resolve(Boolean(accepted));
                    } catch (_) {
                        resolve(false);
                    }
                }
            );
        });
    }

    async clearShelf() {
        if (this._isDestroyed || !this._proxy || !this._proxy.g_name_owner)
            return false;

        return new Promise(resolve => {
            this._proxy.call(
                'ClearShelf',
                null,
                this._gio.DBusCallFlags.NONE,
                -1,
                this._cancellable,
                (proxy, res) => {
                    if (this._isDestroyed) {
                        resolve(false);
                        return;
                    }
                    try {
                        const [accepted] = proxy.call_finish(res).deepUnpack();
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
