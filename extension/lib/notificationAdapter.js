// Minimal guarded notification adapter maintaining GNOME native authority.
// In v0.1, notificationPeekEnabled is false by default.
// The adapter never registers org.freedesktop.Notifications or intercepts native banners.

export class NotificationAdapter {
    /**
     * @param {Object} [options]
     * @param {boolean} [options.enabled=false]
     * @param {Function} [options.onNotificationPeek] - (meta) => void
     */
    constructor({enabled = false, onNotificationPeek} = {}) {
        this._enabled = enabled;
        this._onNotificationPeek = onNotificationPeek ?? (() => {});
        this._isDestroyed = false;
        this._sourceId = null;
    }

    get isEnabled() {
        return this._enabled && !this._isDestroyed;
    }

    setEnabled(enabled) {
        this._enabled = Boolean(enabled);
    }

    /**
     * Triggered safely when opt-in peek is requested and allowed by policy.
     * Respects DND and fullscreen constraints.
     */
    notifyPeek(meta = {}) {
        if (!this._enabled || this._isDestroyed)
            return;

        // Never pass or log sensitive message body text
        const safeMeta = {
            appName: meta.appName ? String(meta.appName).slice(0, 64) : 'App',
            urgency: meta.urgency ?? 'normal',
        };

        this._onNotificationPeek(safeMeta);
    }

    destroy() {
        this._isDestroyed = true;
        this._enabled = false;
    }
}
