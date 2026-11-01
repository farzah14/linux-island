// Guarded notification adapter maintaining GNOME native authority and WhatsApp activity.
// In v0.1, notificationPeekEnabled and whatsappIntegrationEnabled are opt-in.
// The adapter never registers org.freedesktop.Notifications or intercepts native banners.

import {WhatsAppActivityModel, isWhatsAppSource} from './whatsappActivity.js';

let Main = null;
let Gio = null;
if (typeof process === 'undefined') {
    try {
        Main = (await import('resource:///org/gnome/shell/ui/main.js')).default ?? (await import('resource:///org/gnome/shell/ui/main.js'));
        Gio = (await import('gi://Gio')).default;
    } catch (_) {}
}

export class NotificationAdapter {
    /**
     * @param {Object} [options]
     * @param {boolean} [options.enabled=false]
     * @param {boolean} [options.whatsappEnabled=false]
     * @param {Object} [options.messageTray=null]
     * @param {Function} [options.onNotificationPeek] - (meta) => void
     * @param {Function} [options.onWhatsAppActivityChanged] - (hasActivity) => void
     */
    constructor({enabled = false, whatsappEnabled = false, messageTray = null, onNotificationPeek, onWhatsAppActivityChanged} = {}) {
        this._enabled = Boolean(enabled);
        this._whatsappEnabled = Boolean(whatsappEnabled);
        this._onNotificationPeek = onNotificationPeek ?? (() => {});
        this._isDestroyed = false;

        this._whatsappModel = new WhatsAppActivityModel({
            maxEntries: 32,
            onActivityChanged: onWhatsAppActivityChanged,
        });
        this._whatsappModel.setEnabled(this._whatsappEnabled);

        this._tray = messageTray ?? Main?.messageTray ?? null;
        this._traySignalIds = [];
        this._sourceSubscriptions = new Map(); // source -> array of signal IDs
        this._nativeNotifs = new Map(); // id -> native notification reference
        this._nextOpaqueId = 1;

        if (this._tray) {
            this._initTrayTracking();
        }
    }

    get isEnabled() {
        return this._enabled && !this._isDestroyed;
    }

    get hasWhatsAppActivity() {
        return this._whatsappModel.hasActivity;
    }

    setEnabled(enabled) {
        this._enabled = Boolean(enabled);
    }

    setWhatsAppEnabled(enabled) {
        this._whatsappEnabled = Boolean(enabled);
        this._whatsappModel.setEnabled(this._whatsappEnabled);
    }

    setDnd(dnd) {
        this._whatsappModel.setDnd(dnd);
    }

    setLocked(locked) {
        this._whatsappModel.setLocked(locked);
    }

    notifyPeek(meta = {}) {
        if (!this._enabled || this._isDestroyed)
            return;

        const safeMeta = {
            appName: meta.appName ? String(meta.appName).slice(0, 64) : 'App',
            urgency: meta.urgency ?? 'normal',
        };

        this._onNotificationPeek(safeMeta);
    }

    activateWhatsApp() {
        // Attempt default activation on the most recent notification
        let activated = false;
        if (this._nativeNotifs.size > 0) {
            const notif = Array.from(this._nativeNotifs.values()).pop();
            if (notif && typeof notif.activate === 'function') {
                try {
                    notif.activate();
                    activated = true;
                } catch (_) {}
            }
        }

        // Fallback: open WhatsApp web or desktop client via Gio if native activation unavailable
        if (!activated) {
            try {
                if (Gio?.AppInfo?.launch_default_for_uri) {
                    Gio.AppInfo.launch_default_for_uri('https://web.whatsapp.com/', null);
                }
            } catch (_) {}
        }

        this._nativeNotifs.clear();
        this._whatsappModel.clearActivity();
    }

    _initTrayTracking() {
        if (!this._tray || typeof this._tray.connect !== 'function') return;

        const idAdded = this._tray.connect('source-added', (_tray, source) => {
            this._trackSource(source);
        });
        const idRemoved = this._tray.connect('source-removed', (_tray, source) => {
            this._untrackSource(source);
        });
        this._traySignalIds.push(idAdded, idRemoved);

        if (typeof this._tray.getSources === 'function') {
            for (const source of this._tray.getSources()) {
                this._trackSource(source);
            }
        }
    }

    _trackSource(source) {
        if (!source || this._sourceSubscriptions.has(source) || typeof source.connect !== 'function')
            return;

        const sourceInfo = {
            appId: typeof source.app?.get_id === 'function' ? source.app.get_id() : '',
            title: source.title ?? '',
        };

        const isWA = isWhatsAppSource(sourceInfo);
        const signalIds = [];

        const onAddedId = source.connect('notification-added', (_src, notif) => {
            if (notif) {
                const opaqueId = notif.id ?? `n-${this._nextOpaqueId++}`;
                if (isWA) {
                    if (this._nativeNotifs.size >= 32) {
                        const oldestKey = this._nativeNotifs.keys().next().value;
                        this._nativeNotifs.delete(oldestKey);
                    }
                    this._nativeNotifs.set(opaqueId, notif);
                    this._whatsappModel.onNotificationAdded(opaqueId, true);
                }
                this.notifyPeek({
                    appName: sourceInfo.title || sourceInfo.appId || 'App',
                });
            }
        });

        // GNOME 45's MessageTray.Source defines only destroy, icon-updated,
        // notification-added and notification-show. Connecting to a missing
        // signal throws, which would abort tracking for every source.
        let onRemovedId = null;
        try {
            onRemovedId = source.connect('notification-removed', (_src, notif) => {
                if (notif) {
                    const opaqueId = notif.id ?? null;
                    if (opaqueId) {
                        this._nativeNotifs.delete(opaqueId);
                        this._whatsappModel.onNotificationRemoved(opaqueId);
                    } else {
                        for (const [key, val] of this._nativeNotifs.entries()) {
                            if (val === notif) {
                                this._nativeNotifs.delete(key);
                                this._whatsappModel.onNotificationRemoved(key);
                                break;
                            }
                        }
                    }
                }
            });
        } catch (_) {
            onRemovedId = null;
        }

        const onDestroyId = source.connect('destroy', () => {
            this._untrackSource(source);
        });

        signalIds.push(onAddedId, onDestroyId);
        if (onRemovedId !== null)
            signalIds.push(onRemovedId);
        this._sourceSubscriptions.set(source, {signalIds, isWA});
    }

    _untrackSource(source) {
        const sub = this._sourceSubscriptions.get(source);
        if (sub) {
            for (const sigId of sub.signalIds) {
                try { source.disconnect(sigId); } catch (_) {}
            }
            this._sourceSubscriptions.delete(source);
            if (sub.isWA) {
                this._whatsappModel.onSourceDisconnected();
            }
        }
    }
    destroy() {
        this._isDestroyed = true;
        this._enabled = false;

        for (const [source, sub] of this._sourceSubscriptions.entries()) {
            for (const sigId of (sub.signalIds || sub)) {
                try { source.disconnect(sigId); } catch (_) {}
            }
        }
        this._sourceSubscriptions.clear();

        if (this._tray && typeof this._tray.disconnect === 'function') {
            for (const sigId of this._traySignalIds) {
                try { this._tray.disconnect(sigId); } catch (_) {}
            }
        }
        this._traySignalIds = [];
        this._nativeNotifs.clear();
        this._whatsappModel.destroy();
    }
}
