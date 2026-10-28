// Pure WhatsApp activity policy model for Linux Island.
// Contains zero notification text, zero native objects, and no persistence.

export class WhatsAppActivityModel {
    constructor({maxEntries = 32, onActivityChanged} = {}) {
        this._maxEntries = Math.max(1, maxEntries);
        this._onActivityChanged = onActivityChanged ?? (() => {});
        this._enabled = false;
        this._dnd = false;
        this._locked = false;
        this._entries = new Set();
    }

    get hasActivity() {
        return this._enabled && !this._dnd && !this._locked && this._entries.size > 0;
    }

    get count() {
        return this._entries.size;
    }

    setEnabled(enabled) {
        const next = Boolean(enabled);
        if (this._enabled !== next) {
            this._enabled = next;
            if (!this._enabled) {
                this._entries.clear();
            }
            this._notify();
        }
    }

    setDnd(dnd) {
        const next = Boolean(dnd);
        if (this._dnd !== next) {
            this._dnd = next;
            this._notify();
        }
    }

    setLocked(locked) {
        const next = Boolean(locked);
        if (this._locked !== next) {
            this._locked = next;
            if (this._locked) {
                this._entries.clear();
            }
            this._notify();
        }
    }

    onNotificationAdded(id, isVerifiedWhatsApp) {
        if (!this._enabled || !isVerifiedWhatsApp || !id) return false;
        if (this._locked || this._dnd) return false;

        if (this._entries.has(id)) {
            return false;
        }

        // Bounded capacity: evict oldest entry if exceeding maxEntries
        if (this._entries.size >= this._maxEntries) {
            const oldest = this._entries.values().next().value;
            this._entries.delete(oldest);
        }

        this._entries.add(id);
        this._notify();
        return true;
    }

    onNotificationRemoved(id) {
        if (!id) return false;
        if (this._entries.delete(id)) {
            this._notify();
            return true;
        }
        return false;
    }

    onSourceDisconnected() {
        if (this._entries.size > 0) {
            this._entries.clear();
            this._notify();
            return true;
        }
        return false;
    }

    clearActivity() {
        if (this._entries.size > 0) {
            this._entries.clear();
            this._notify();
            return true;
        }
        return false;
    }

    destroy() {
        this._entries.clear();
        this._enabled = false;
        this._onActivityChanged = () => {};
    }

    _notify() {
        this._onActivityChanged(this.hasActivity);
    }
}

export function isWhatsAppSource(sourceInfo) {
    if (!sourceInfo) return false;
    const appId = String(sourceInfo.appId || '').toLowerCase();
    const title = String(sourceInfo.title || '').toLowerCase();

    const verifiedIds = [
        'com.whatsapp.whatsapp',
        'whatsapp-for-linux',
        'whatsapp-desktop',
        'whatsapp',
        'io.github.alexpose.whatsappforlinux',
        'com.github.eneshecan.whatsapp-for-linux',
        'whatsapp-nativefier',
    ];

    for (const id of verifiedIds) {
        if (appId.includes(id) || title === id) return true;
    }

    return false;
}
