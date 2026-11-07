// Nonblocking GJS TimeProxy for io.github.linuxisland.Time1.
// Pure functions run under Node.js and GJS; DBus operations use Gio when available.

let Gio = null;
let GLib = null;
if (typeof process === 'undefined') {
    try {
        const gi = await import('gi://Gio');
        Gio = gi.default ?? gi;
        const gl = await import('gi://GLib');
        GLib = gl.default ?? gl;
    } catch (_) {}
}

export const IDLE_TIMER = Object.freeze({
    state: 'idle',
    mode: 'countdown',
    phase: '',
    label: '',
    durationSec: 0,
    remainingSec: 0,
    cycle: 0,
});


function unpackVariant(v) {
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

export function reconcileTimeState(current, action) {
    switch (action.type) {
    case 'OWNER_CHANGED': {
        if (!action.nameOwner) {
            return {
                ...current,
                connected: false,
                owner: null,
                timerServiceAvailable: false,
                timerRevision: 0,
                timer: {...IDLE_TIMER},
                stats: null,
            };
        }
        return current;
    }
    case 'TIMER_CHANGED': {
        const sameOwner = action.owner === current.owner;
        const nextRevision = Number(action.revision ?? 0);
        if (sameOwner && !(nextRevision > current.timerRevision)) {
            return current;
        }
        return {
            ...current,
            connected: true,
            timerRevision: nextRevision,
            timer: {...IDLE_TIMER, ...(action.timer ?? {})},
        };
    }
    default:
        return current;
    }
}

export class TimeProxy {
    /**
     * @param {Object} [options]
     * @param {Function} [options.onStateChanged]
     * @param {Function} [options.onTimerFinished]
     * @param {Function} [options.onPhaseChanged]
     * @param {Object} [options.gio] - Mock or injected Gio
     * @param {Object} [options.glib] - Mock or injected GLib
     */
    constructor({onStateChanged, onTimerFinished, onPhaseChanged, gio, glib} = {}) {
        this._gio = gio ?? Gio;
        this._glib = glib ?? GLib;
        this._onStateChanged = onStateChanged ?? (() => {});
        this._onTimerFinished = onTimerFinished ?? (() => {});
        this._onPhaseChanged = onPhaseChanged ?? (() => {});
        this._isDestroyed = false;
        this._handlers = [];
        this._lastTimerState = null;
        this._lastPhase = null;

        this._state = {
            connected: false,
            owner: null,
            timerRevision: 0,
            timer: {...IDLE_TIMER},
            stats: null,
            timerServiceAvailable: false,
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

        const previous = this._state;
        this._state = nextState;

        if (nextState !== previous) {
            this._detectTransitions(previous, nextState);
            this._onStateChanged(this._state);
        }
    }

    _detectTransitions(previous, next) {
        const prevTimer = previous.timer ?? {};
        const nextTimer = next.timer ?? {};

        // The first snapshot must not fire a "finished" notification.
        if (this._lastTimerState !== null &&
            prevTimer.state !== 'finished' && nextTimer.state === 'finished') {
            this._onTimerFinished();
        }
        this._lastTimerState = nextTimer.state;

        if (nextTimer.mode === 'pomodoro') {
            const prevPhase = prevTimer.phase;
            const nextPhase = nextTimer.phase;
            if (this._lastPhase !== null && prevPhase && nextPhase && prevPhase !== nextPhase) {
                this._onPhaseChanged();
            }
        }
        this._lastPhase = nextTimer.phase ?? null;
    }

    _initProxy() {
        this._gio.DBusProxy.new_for_bus(
            this._gio.BusType.SESSION,
            this._gio.DBusProxyFlags.NONE,
            null,
            'io.github.linuxisland.Core',
            '/io/github/linuxisland/Core',
            'io.github.linuxisland.Time1',
            this._cancellable,
            (source, res) => {
                if (this._isDestroyed)
                    return;
                try {
                    this._proxy = this._gio.DBusProxy.new_for_bus_finish(res);
                    this._setupHandlers();
                } catch (_) {
                    // Service unavailable at startup is expected; the proxy
                    // watches the bus owner and reconnects on its own.
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

        if (this._proxy.g_name_owner) {
            this._fetchTimer();
            this._fetchStats();
        }
    }

    _onOwnerChanged() {
        if (this._isDestroyed || !this._proxy)
            return;

        const owner = this._proxy.g_name_owner;
        if (!owner) {
            this._setState(reconcileTimeState(this._state, {
                type: 'OWNER_CHANGED',
                nameOwner: null,
            }));
            return;
        }
        this._state = {...this._state, connected: true, owner};
        this._fetchTimer();
        this._fetchStats();
    }

    _fetchTimer() {
        if (this._isDestroyed || !this._proxy || !this._proxy.g_name_owner)
            return;
        const owner = this._proxy.g_name_owner;

        this._proxy.call(
            'GetTimer',
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
                    const timer = unpackVariant(raw);
                    this._state = {...this._state, timerServiceAvailable: true};
                    const next = reconcileTimeState(this._state, {
                        type: 'TIMER_CHANGED',
                        owner,
                        revision: Number(timer.revision ?? 0),
                        timer,
                    });
                    this._setState(next);
                } catch (_) {}
            }
        );
    }

    _fetchStats() {
        if (this._isDestroyed || !this._proxy || !this._proxy.g_name_owner)
            return;
        const owner = this._proxy.g_name_owner;

        this._proxy.call(
            'GetTimerStats',
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
                    const stats = unpackVariant(raw);
                    this._setState({...this._state, stats});
                } catch (_) {}
            }
        );
    }

    _onSignal(sigName, params) {
        if (this._isDestroyed)
            return;

        try {
            const unpacked = unpackVariant(params);
            if (sigName === 'TimerChanged') {
                const [rev, timer] = unpacked;
                const next = reconcileTimeState(this._state, {
                    type: 'TIMER_CHANGED',
                    owner: this._state.owner,
                    revision: rev,
                    timer,
                });
                this._setState(next);
            }
        } catch (_) {}
    }

    async startTimer(request) {
        if (this._isDestroyed || !this._proxy || !this._proxy.g_name_owner || !this._glib)
            return false;

        return new Promise(resolve => {
            const dict = {};
            for (const [key, val] of Object.entries(request ?? {})) {
                if (typeof val === 'string') {
                    dict[key] = new this._glib.Variant('s', val);
                } else if (typeof val === 'boolean') {
                    dict[key] = new this._glib.Variant('b', val);
                } else if (typeof val === 'number' && Number.isFinite(val)) {
                    dict[key] = new this._glib.Variant(Number.isInteger(val) ? 'i' : 'd', val);
                }
            }

            const params = new this._glib.Variant('(a{sv})', [dict]);
            this._proxy.call(
                'StartTimer',
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

    async controlTimer(action) {
        if (this._isDestroyed || !this._proxy || !this._proxy.g_name_owner || !this._glib)
            return false;

        return new Promise(resolve => {
            const params = new this._glib.Variant('(s)', [String(action)]);
            this._proxy.call(
                'ControlTimer',
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

    async fetchStats() {
        if (this._isDestroyed || !this._proxy || !this._proxy.g_name_owner)
            return false;
        this._fetchStats();
        return true;
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
