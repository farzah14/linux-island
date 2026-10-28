// Detailed Single-Overview AI Quota UI for Linux Island FeatureCarousel
// Renders clean, borderless rows with 5h and Weekly window toggle buttons for
// Antigravity, OpenAI Codex, and Claude Code.

import {AiQuotaCollector} from '../lib/aiQuota.js';

let St = null;
let Clutter = null;
let Gio = null;
let GLib = null;
let Pango = null;
if (typeof process === 'undefined') {
    try {
        St = (await import('gi://St')).default;
        Clutter = (await import('gi://Clutter')).default;
        Gio = (await import('gi://Gio')).default;
        GLib = (await import('gi://GLib')).default;
        Pango = (await import('gi://Pango')).default;
    } catch (_) {}
}

export function getProviderGIcon(id) {
    if (!Gio || !id) return null;
    try {
        const thisFile = Gio.File.new_for_uri(import.meta.url);
        const iconsDir = thisFile.get_parent().get_parent().get_child('icons');
        const iconFile = iconsDir.get_child(`${id}.png`);
        if (iconFile.query_exists(null)) {
            return new Gio.FileIcon({ file: iconFile });
        }
    } catch (_) {}
    return null;
}

export class AiQuotaProviderRow {
    constructor({ id, label, iconName = 'applications-science-symbolic' } = {}) {
        this._id = id;
        this._baseLabel = label;
        this._label = label;
        this._iconName = iconName;
        this._activeMode = '5h'; // '5h' or 'weekly'
        this._state = null;

        this.actor = null;
        this._headerBox = null;
        this._icon = null;
        this._nameLabel = null;
        this._btn5h = null;
        this._btnWeekly = null;
        this._detailLabel = null;
        this.onWindowSelected = null;

        if (St && Clutter) {
            this._build();
        }
    }

    _build() {
        this.actor = new St.BoxLayout({
            vertical: true,
            style: 'spacing: 1px; padding: 1px 2px;',
            style_class: 'linux-island__quota-row',
            x_expand: true,
        });

        // Horizontal Row: [Icon] [Name] [Spacer] [5h Button] [Weekly Button]
        this._headerBox = new St.BoxLayout({
            vertical: false,
            style: 'spacing: 6px;',
            x_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
        });

        const realGIcon = getProviderGIcon(this._id);
        const iconProps = {
            icon_size: 14,
            style_class: 'linux-island__metric-icon',
            y_align: Clutter.ActorAlign.CENTER,
        };
        if (realGIcon) {
            iconProps.gicon = realGIcon;
        } else {
            iconProps.icon_name = this._iconName;
            iconProps.fallback_icon_name = this._iconName;
        }
        this._icon = new St.Icon(iconProps);
        this._headerBox.add_child(this._icon);

        this._nameLabel = new St.Label({
            text: this._label,
            style: 'font-size: 11px; font-weight: 600;',
            style_class: 'linux-island__metric-label',
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._headerBox.add_child(this._nameLabel);

        const spacer = new St.Widget({ x_expand: true });
        this._headerBox.add_child(spacer);

        // 5h Quota Button
        this._btn5h = new St.Button({
            label: '5h: --%',
            style_class: 'linux-island__quota-pill-btn linux-island__quota-action linux-island__quota-pill-btn--active',
            can_focus: true,
        });
        this._btn5h.connect('clicked', () => {
            this.setMode('5h');
        });
        this._headerBox.add_child(this._btn5h);

        // Weekly Quota Button
        this._btnWeekly = new St.Button({
            label: '7d: --%',
            style_class: 'linux-island__quota-pill-btn linux-island__quota-action',
            can_focus: true,
        });
        this._btnWeekly.connect('clicked', () => {
            this.setMode('weekly');
        });
        this._headerBox.add_child(this._btnWeekly);

        this.actor.add_child(this._headerBox);

        // Reset countdown and status detail label
        this._detailLabel = new St.Label({
            text: '',
            style: 'font-size: 9px; padding-left: 19px;',
            style_class: 'linux-island__progress-time',
            x_expand: true,
        });
        if (this._detailLabel.clutter_text) {
            try {
                if (Pango?.EllipsizeMode) {
                    this._detailLabel.clutter_text.set_ellipsize(Pango.EllipsizeMode.END);
                } else if (typeof this._detailLabel.clutter_text.set_ellipsize === 'function') {
                    this._detailLabel.clutter_text.set_ellipsize(3);
                }
            } catch (_) {}
        }
        this.actor.add_child(this._detailLabel);
    }

    setMode(mode) {
        this._activeMode = (mode === 'weekly') ? 'weekly' : '5h';
        if (this._activeMode === '5h') {
            this._btn5h?.add_style_class_name?.('linux-island__quota-pill-btn--active');
            this._btnWeekly?.remove_style_class_name?.('linux-island__quota-pill-btn--active');
        } else {
            this._btnWeekly?.add_style_class_name?.('linux-island__quota-pill-btn--active');
            this._btn5h?.remove_style_class_name?.('linux-island__quota-pill-btn--active');
        }
        this._syncDetail();
    }

    setWidth(w) {
        if (!this.actor || w <= 0) return;
        this.actor.width = w;
    }
    setLabel(label) {
        this._label = label;
        if (this._nameLabel) {
            this._nameLabel.text = label;
        }
    }


    _syncDetail() {
        if (!this._detailLabel || !this._state) return;
        const windows = Array.isArray(this._state.windows) ? this._state.windows : [];

        if (!this._state.connected) {
            this._detailLabel.text = this._state.detailText || 'Offline';
            return;
        }

        if (this._activeMode === '5h') {
            const w5h = windows.find(w => w.window === '5h');
            if (w5h) {
                let txt = `${w5h.remainingPercent}% left (${w5h.usedPercent}% used)`;
                if (w5h.resetText && w5h.resetText !== 'now') {
                    txt += ` · ↻ resets in ${w5h.resetText}`;
                }
                this._detailLabel.text = txt;
            } else if (this._state.source === 'local-installed') {
                this._detailLabel.text = this._state.detailText;
            } else {
                this._detailLabel.text = this._state.detailText || '';
            }
        } else {
            const wWk = windows.find(w => w.window === '7d' || w.window === 'Weekly' || w.window === '30d' || w.window === 'Argon 7d');
            const wArgon = windows.find(w => w.window === 'Argon 7d');
            if (wWk) {
                let txt = `${wWk.remainingPercent}% left (${wWk.usedPercent}% used)`;
                if (wArgon && wArgon !== wWk) {
                    txt += ` · Argon: ${wArgon.remainingPercent}%`;
                }
                if (wWk.resetText && wWk.resetText !== 'now') {
                    txt += ` · ↻ resets in ${wWk.resetText}`;
                }
                this._detailLabel.text = txt;
            } else {
                this._detailLabel.text = this._state.altDetailText || this._state.detailText || '';
            }
        }
    }

    update(providerState) {
        if (!providerState) return;
        this._state = providerState;

        if (this._id === 'claude') {
            if (providerState.source === 'antigravity-shared') {
                this.setLabel('Claude (AGY)');
            } else {
                this.setLabel(this._baseLabel || 'Claude');
            }
        }
        const windows = Array.isArray(providerState.windows) ? providerState.windows : [];
        const w5h = windows.find(w => w.window === '5h');
        const wWeekly = windows.find(w => w.window === '7d' || w.window === 'Weekly' || w.window === '30d' || w.window === 'Argon 7d');

        if (this._btn5h) {
            if (w5h && typeof w5h.remainingPercent === 'number') {
                this._btn5h.label = `5h: ${w5h.remainingPercent}%`;
            } else if (providerState.connected) {
                this._btn5h.label = `5h: ${providerState.remainingPercent}%`;
            } else {
                this._btn5h.label = '5h: --%';
            }
        }

        if (this._btnWeekly) {
            const prefix = (wWeekly && wWeekly.window === '30d') ? '30d' : '7d';
            if (wWeekly && typeof wWeekly.remainingPercent === 'number') {
                this._btnWeekly.label = `${prefix}: ${wWeekly.remainingPercent}%`;
            } else if (providerState.connected) {
                this._btnWeekly.label = `7d: ${providerState.remainingPercent}%`;
            } else {
                this._btnWeekly.label = '7d: --%';
            }
        }

        this._syncDetail();
    }

    destroy() {
        if (this.actor) {
            this.actor.destroy();
            this.actor = null;
        }
        this._headerBox = null;
        this._icon = null;
        this._nameLabel = null;
        this._btn5h = null;
        this._btnWeekly = null;
        this._detailLabel = null;
    }
}

export class AiQuotaSection {
    constructor({ collector, scheduler } = {}) {
        this._collector = collector ?? new AiQuotaCollector();
        this._timerId = null;
        this._destroyed = false;
        this._active = false;
        this._activeMode = '5h';

        const rawSched = scheduler ?? {};
        this._scheduler = {
            add: (ms, fn) => {
                if (typeof rawSched.add === 'function') return rawSched.add(ms, fn);
                if (typeof rawSched.repeat === 'function') return rawSched.repeat(fn, ms);
                return GLib ? GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => {
                    fn();
                    return GLib.SOURCE_CONTINUE;
                }) : null;
            },
            remove: (id) => {
                if (id === null || id === undefined) return;
                if (typeof rawSched.remove === 'function') return rawSched.remove(id);
                if (typeof rawSched.cancel === 'function') return rawSched.cancel(id);
                if (GLib && typeof id === 'number') GLib.source_remove(id);
            },
        };

        this.actor = null;
        this._topBar = null;
        this._titleLabel = null;
        this._btnAll5h = null;
        this._btnAllWeekly = null;
        this._antigravityRow = null;
        this._codexRow = null;
        this._claudeRow = null;

        if (St && Clutter) {
            this._build();
        }
    }

    _build() {
        this.actor = new St.BoxLayout({
            vertical: true,
            style: 'width: 300px; spacing: 2px; padding: 0 4px;',
            x_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
        });

        // Top Section Bar: [AI Quota Title]
        this._topBar = new St.BoxLayout({
            vertical: false,
            style: 'spacing: 6px; padding: 0 2px 2px 2px;',
            x_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
        });

        this._titleLabel = new St.Label({
            text: 'AI Quota',
            style: 'font-size: 11px; font-weight: bold;',
            style_class: 'linux-island__metric-label',
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._topBar.add_child(this._titleLabel);
        this.actor.add_child(this._topBar);

        // Provider Rows
        this._antigravityRow = new AiQuotaProviderRow({
            id: 'antigravity',
            label: 'Antigravity',
            iconName: 'applications-science-symbolic',
        });
        if (this._antigravityRow.actor) {
            this.actor.add_child(this._antigravityRow.actor);
        }

        this._codexRow = new AiQuotaProviderRow({
            id: 'codex',
            label: 'Codex',
            iconName: 'utilities-terminal-symbolic',
        });
        if (this._codexRow.actor) {
            this.actor.add_child(this._codexRow.actor);
        }

        this._claudeRow = new AiQuotaProviderRow({
            id: 'claude',
            label: 'Claude',
            iconName: 'dialog-information-symbolic',
        });
        if (this._claudeRow.actor) {
            this.actor.add_child(this._claudeRow.actor);
        }
    }

    setMode(mode) {
        this._activeMode = (mode === 'weekly') ? 'weekly' : '5h';
        this._antigravityRow?.setMode(this._activeMode);
        this._codexRow?.setMode(this._activeMode);
        this._claudeRow?.setMode(this._activeMode);
    }

    _applySnapshot(snap) {
        if (!snap || this._destroyed) return;
        if (this._antigravityRow && snap.antigravity) {
            this._antigravityRow.update(snap.antigravity);
        }
        if (this._codexRow && snap.codex) {
            this._codexRow.update(snap.codex);
        }
        if (this._claudeRow && snap.claude) {
            this._claudeRow.update(snap.claude);
        }
    }

    setWidth(w) {
        if (!this.actor || w <= 0) return;
        this.actor.style = `width: ${w}px; spacing: 2px; padding: 0 4px;`;
        this.actor.width = w;
        const rowW = Math.max(40, w - 8);
        this._antigravityRow?.setWidth(rowW);
        this._codexRow?.setWidth(rowW);
        this._claudeRow?.setWidth(rowW);
    }

    update() {
        if (this._destroyed) return;
        const snap = this._collector.collect((updated) => {
            if (!this._destroyed && updated) {
                this._applySnapshot(updated);
            }
        });
        if (snap) {
            this._applySnapshot(snap);
        }
    }

    start() {
        if (this._active || this._destroyed) return;
        this._active = true;
        this.update();
        if (this._timerId === null) {
            this._timerId = this._scheduler.add(15000, () => {
                this.update();
            });
        }
    }

    stop() {
        this._active = false;
        if (this._timerId !== null) {
            this._scheduler.remove(this._timerId);
            this._timerId = null;
        }
    }

    destroy() {
        this.stop();
        this._destroyed = true;
        this._antigravityRow?.destroy();
        this._antigravityRow = null;
        this._codexRow?.destroy();
        this._codexRow = null;
        this._claudeRow?.destroy();
        this._claudeRow = null;
        this._topBar = null;
        this._titleLabel = null;
        if (this.actor) {
            this.actor.destroy();
            this.actor = null;
        }
    }
}
