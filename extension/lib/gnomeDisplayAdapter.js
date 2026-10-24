// GNOME display adapter for fullscreen monitoring on the primary display.
// Implements a clean, testable contract with no mandatory global imports at construction time.

export class GnomeDisplayAdapter {
    /**
     * @param {Object} [options]
     * @param {Object} [options.display] - global.display or test fake
     * @param {Object} [options.workspaceManager] - global.workspace_manager or test fake
     * @param {Object} [options.layoutManager] - Main.layoutManager or test fake
     */
    constructor(options = {}) {
        this._display = options.display ?? (typeof global !== 'undefined' ? global.display : null);
        this._workspaceManager = options.workspaceManager ?? (typeof global !== 'undefined' ? global.workspace_manager : null);
        this._layoutManager = options.layoutManager ?? null;

        this._listeners = new Set();
        this._signalHandlers = [];
        this._isDestroyed = false;

        this._initSignals();
    }

    _initSignals() {
        if (!this._display)
            return;

        const onDisplayChange = () => this._notify();

        if (typeof this._display.connect === 'function') {
            const id = this._display.connect('in-fullscreen-changed', onDisplayChange);
            this._signalHandlers.push({source: this._display, id});
        }

        if (this._workspaceManager && typeof this._workspaceManager.connect === 'function') {
            const id = this._workspaceManager.connect('active-workspace-changed', onDisplayChange);
            this._signalHandlers.push({source: this._workspaceManager, id});
        }

        if (this._layoutManager && typeof this._layoutManager.connect === 'function') {
            const id = this._layoutManager.connect('monitors-changed', onDisplayChange);
            this._signalHandlers.push({source: this._layoutManager, id});
        }
    }

    _notify() {
        if (this._isDestroyed)
            return;
        const current = this.read();
        for (const listener of this._listeners) {
            try {
                listener(current);
            } catch (err) {
                console.error(err);
            }
        }
    }

    /**
     * Read whether the primary monitor currently has a fullscreen window.
     * @returns {boolean|undefined}
     */
    read() {
        if (!this._display)
            return undefined;

        const primaryIndex = this._layoutManager?.primaryIndex ?? 0;

        // Window-level check: windows on active workspace on primary monitor
        if (this._workspaceManager?.get_active_workspace) {
            try {
                const activeWs = this._workspaceManager.get_active_workspace();
                if (activeWs && typeof activeWs.list_windows === 'function') {
                    const windows = activeWs.list_windows();
                    const hasFullscreen = windows.some(w => {
                        const winMonitor = typeof w.get_monitor === 'function' ? w.get_monitor() : -1;
                        const isFs = typeof w.is_fullscreen === 'function' ? w.is_fullscreen() : false;
                        return winMonitor === primaryIndex && isFs;
                    });
                    return hasFullscreen;
                }
            } catch (_) {
                // Fall back to display check
            }
        }

        // Display monitor query fallback
        if (typeof this._display.get_monitor_in_fullscreen === 'function') {
            return Boolean(this._display.get_monitor_in_fullscreen(primaryIndex));
        }

        return false;
    }

    /**
     * Subscribe to fullscreen state changes.
     * @param {Function} callback - (isFullscreen: boolean|undefined) => void
     * @returns {Function} unsubscribe function
     */
    subscribe(callback) {
        if (this._isDestroyed || typeof callback !== 'function')
            return () => {};

        this._listeners.add(callback);
        return () => {
            this._listeners.delete(callback);
        };
    }

    /**
     * Disconnect ALL owned signal handlers and clear subscribers.
     */
    destroy() {
        if (this._isDestroyed)
            return;
        this._isDestroyed = true;

        for (const {source, id} of this._signalHandlers) {
            try {
                if (typeof source.disconnect === 'function')
                    source.disconnect(id);
            } catch (_) {}
        }
        this._signalHandlers = [];
        this._listeners.clear();
    }
}
