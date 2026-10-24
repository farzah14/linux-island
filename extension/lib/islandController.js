import {transition} from './interactionState.js';
import {shouldHideIsland} from './displayPolicy.js';

export class IslandController {
    /**
     * @param {Object} [options]
     * @param {Object} [options.adapter] - display adapter with read(), subscribe(cb), destroy()
     * @param {Function} [options.onStateChanged] - callback invoked on state transition
     * @param {boolean} [options.fullscreenPolicyEnabled=true]
     * @param {Object} [options.scheduler] - custom scheduler with setTimeout and clearTimeout
     * @param {number} [options.peekDurationMs=4000]
     */
    constructor({adapter, onStateChanged, fullscreenPolicyEnabled = true, scheduler, peekDurationMs = 4000} = {}) {
        this._adapter = adapter ?? null;
        this._onStateChanged = onStateChanged ?? (() => {});
        this._fullscreenPolicyEnabled = fullscreenPolicyEnabled;
        this._scheduler = scheduler ?? {
            setTimeout: (fn, ms) => setTimeout(fn, ms),
            clearTimeout: id => clearTimeout(id),
        };
        this._peekDurationMs = peekDurationMs;

        this._state = 'COMPACT';
        this._unsubscribeAdapter = null;
        this._peekTimer = null;
        this._listeners = new Set();
        this._isDestroyed = false;

        if (onStateChanged) {
            this._listeners.add(onStateChanged);
        }

        this._initAdapter();
    }

    get state() {
        return this._state;
    }

    getState() {
        return this._state;
    }

    subscribe(callback) {
        if (this._isDestroyed || typeof callback !== 'function')
            return () => {};
        this._listeners.add(callback);
        return () => {
            this._listeners.delete(callback);
        };
    }

    get state() {
        return this._state;
    }

    _initAdapter() {
        if (!this._adapter)
            return;

        const initialFs = this._adapter.read();
        this._handleFullscreenUpdate(initialFs);

        if (typeof this._adapter.subscribe === 'function') {
            this._unsubscribeAdapter = this._adapter.subscribe(fs => {
                this._handleFullscreenUpdate(fs);
            });
        }
    }

    setFullscreenPolicyEnabled(enabled) {
        const next = enabled !== false;
        if (this._isDestroyed || next === this._fullscreenPolicyEnabled) return;
        this._fullscreenPolicyEnabled = next;
        this._handleFullscreenUpdate(this._adapter?.read() ?? null);
    }

    _handleFullscreenUpdate(fullscreenOnPrimary) {
        if (this._isDestroyed)
            return;

        const shouldHide = shouldHideIsland({
            enabled: this._fullscreenPolicyEnabled,
            fullscreenOnPrimary,
        });

        if (shouldHide) {
            this.dispatch('FULLSCREEN_ON');
        } else if (this._state === 'HIDDEN') {
            this.dispatch('FULLSCREEN_OFF');
        }
    }

    /**
     * Dispatches an event to the state machine reducer.
     * @param {string} event
     */
    dispatch(event) {
        if (this._isDestroyed)
            return;

        const nextState = transition(this._state, event);
        if (nextState !== this._state) {
            const oldState = this._state;
            this._state = nextState;

            // Clear existing peek timer if moving out of PEEK
            if (oldState === 'PEEK' && nextState !== 'PEEK') {
                this._clearPeekTimer();
            }

            // If entering PEEK, schedule timeout
            if (nextState === 'PEEK') {
                this._schedulePeekTimer();
            }

            for (const cb of this._listeners) {
                try {
                    cb(this._state);
                } catch (e) {
                    console.error(e);
                }
            }
        }
    }

    _schedulePeekTimer() {
        this._clearPeekTimer();
        this._peekTimer = this._scheduler.setTimeout(() => {
            this._peekTimer = null;
            this.dispatch('PEEK_TIMEOUT');
        }, this._peekDurationMs);
    }

    _clearPeekTimer() {
        if (this._peekTimer !== null) {
            this._scheduler.clearTimeout(this._peekTimer);
            this._peekTimer = null;
        }
    }

    destroy() {
        if (this._isDestroyed)
            return;
        this._isDestroyed = true;
        this._clearPeekTimer();

        if (typeof this._unsubscribeAdapter === 'function') {
            this._unsubscribeAdapter();
            this._unsubscribeAdapter = null;
        }

        if (this._adapter && typeof this._adapter.destroy === 'function') {
            this._adapter.destroy();
            this._adapter = null;
        }

        this._listeners.clear();
    }
}
