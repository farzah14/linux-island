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
        this._selected = false;
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
            style: 'spacing: 3px;',
            style_class: 'linux-island__quota-row',
            x_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
            reactive: true,
        });
        this.actor.connect('button-release-event', () => {
            this.onWindowSelected?.(this._id, this._activeMode, this._state);
            return Clutter.EVENT_PROPAGATE;
        });

        // Vertical equalizer pair (5h + 7d bars, bottom-up fill).
        const barsRow = new St.BoxLayout({
            vertical: false,
            style: 'spacing: 5px; height: 34px;',
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._quotaBars = [];
        for (let i = 0; i < 2; i++) {
            const track = new St.BoxLayout({
                vertical: true,
                style_class: 'linux-island__timer-progress-track',
                style: 'width: 8px; height: 34px; border-radius: 4px;',
                y_align: Clutter.ActorAlign.CENTER,
            });
            const fill = new St.Widget({
                style_class: 'linux-island__timer-progress-fill',
                style: 'width: 8px; height: 0px; border-radius: 4px;',
                y_align: Clutter.ActorAlign.END,
            });
            track.add_child(new St.Widget({y_expand: true}));
            track.add_child(fill);
            barsRow.add_child(track);
            this._quotaBars.push(fill);
        }
        this.actor.add_child(barsRow);

        // Provider icon + label
        this._headerBox = new St.BoxLayout({
            vertical: false,
            style: 'spacing: 4px;',
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
        });

        const realGIcon = getProviderGIcon(this._id);
        const iconProps = {
            icon_size: 12,
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
            style: 'font-size: 10px; font-weight: 600;',
            style_class: 'linux-island__metric-label',
            y_align: Clutter.ActorAlign.CENTER,
        });
        if (this._nameLabel.clutter_text?.set_ellipsize) {
            this._nameLabel.clutter_text.set_ellipsize(3);
        }
        this._headerBox.add_child(this._nameLabel);
        this.actor.add_child(this._headerBox);

        // Compact 5h / 7d pill toggles
        const pillsRow = new St.BoxLayout({
            vertical: false,
            style: 'spacing: 3px;',
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._btn5h = new St.Button({
            label: '5h',
            style: 'font-size: 9px; padding: 1px 6px;',
            style_class: 'linux-island__quota-pill-btn linux-island__quota-action',
            can_focus: true,
        });
        this._btn5h.connect('clicked', () => {
            this.setMode('5h');
            this.onWindowSelected?.(this._id, '5h', this._state);
        });
        pillsRow.add_child(this._btn5h);

        this._btnWeekly = new St.Button({
            label: '7d',
            style: 'font-size: 9px; padding: 1px 6px;',
            style_class: 'linux-island__quota-pill-btn linux-island__quota-action',
            can_focus: true,
        });
        this._btnWeekly.connect('clicked', () => {
            this.setMode('weekly');
            this.onWindowSelected?.(this._id, 'weekly', this._state);
        });
        pillsRow.add_child(this._btnWeekly);
        this.actor.add_child(pillsRow);

        this._detailLabel = new St.Label({
            text: '',
            visible: false,
            style_class: 'linux-island__progress-time',
        });
        this.actor.add_child(this._detailLabel);
        this._syncVisuals();
    }

    _syncVisuals() {
        if (this._quotaBars) {
            const hi = this._selected ? 255 : 130;
            const lo = this._selected ? 160 : 110;
            this._quotaBars[0].opacity = this._activeMode === '5h' ? hi : lo;
            this._quotaBars[1].opacity = this._activeMode === 'weekly' ? hi : lo;
        }
        const active5h = this._selected && this._activeMode === '5h';
        const activeWk = this._selected && this._activeMode === 'weekly';
        if (active5h) this._btn5h?.add_style_class_name?.('linux-island__quota-pill-btn--active');
        else this._btn5h?.remove_style_class_name?.('linux-island__quota-pill-btn--active');
        if (activeWk) this._btnWeekly?.add_style_class_name?.('linux-island__quota-pill-btn--active');
        else this._btnWeekly?.remove_style_class_name?.('linux-island__quota-pill-btn--active');
    }

    setSelected(selected) {
        this._selected = Boolean(selected);
        this._syncVisuals();
    }

    setMode(mode) {
        this._activeMode = (mode === 'weekly') ? 'weekly' : '5h';
        this._syncVisuals();
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
                // No 5h window for this provider: show the weekly detail rather
                // than a 5h string that does not exist.
                this._detailLabel.text = this._state.altDetailText || this._state.detailText || '';
            }
        } else {
            const wWk = windows.find(w => w.window === '7d' || w.window === 'Weekly' || w.window === '30d');
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
        const wWeekly = windows.find(w => w.window === '7d' || w.window === 'Weekly' || w.window === '30d');

        // A provider that only reports one window (Claude shared is weekly-only)
        // must not inherit the other window's percentage. Show "--%" instead of
        // inventing a number.
        const has5h = (typeof providerState.has5h === 'boolean')
            ? providerState.has5h
            : Boolean(w5h);
        const has7d = (typeof providerState.has7d === 'boolean')
            ? providerState.has7d
            : Boolean(wWeekly);

        if (this._btn5h) {
            this._btn5h.label = '5h';
        }

        if (this._btnWeekly) {
            this._btnWeekly.label = (wWeekly && wWeekly.window === '30d') ? '30d' : '7d';
        }

        for (const [index, window] of [w5h, wWeekly].entries()) {
            const value = providerState.connected && window && Number.isFinite(window.remainingPercent)
                ? Math.max(0, Math.min(100, window.remainingPercent)) : 0;
            if (this._quotaBars?.[index])
                this._quotaBars[index].style = `width: 8px; height: ${Math.round(34 * value / 100)}px; border-radius: 4px;`;
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
        this._mappedSignalId = null;

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
            style: 'width: 300px; spacing: 5px;',
            x_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._selectedProviderId = 'antigravity';
        this._userSelected = false;

        // Top Section Bar: [AI Quota Title] + [Selected Window Summary] + [Refresh]
        this._topBar = new St.BoxLayout({
            vertical: false,
            style: 'spacing: 6px;',
            x_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
        });

        this._titleLabel = new St.Label({
            text: 'AI Quota',
            style: 'font-size: 11px; font-weight: bold;',
            style_class: 'linux-island__metric-label',
            x_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._topBar.add_child(this._titleLabel);

        this._summaryLabel = new St.Label({
            text: '',
            style: 'font-size: 10px; font-weight: 600;',
            style_class: 'linux-island__timer-cycle',
            x_align: Clutter.ActorAlign.END,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._topBar.add_child(this._summaryLabel);

        this._refreshBtn = new St.Button({
            label: '↻',
            style: 'font-size: 11px; font-weight: bold; padding: 0 3px;',
            style_class: 'linux-island__quota-action',
            reactive: true,
            can_focus: true,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._refreshBtn.connect('clicked', () => this.update());
        this._topBar.add_child(this._refreshBtn);
        this.actor.add_child(this._topBar);

        // Middle Equalizer Chart Card (3 vertical provider bar columns side-by-side)
        this._chartCard = new St.BoxLayout({
            vertical: false,
            style: 'spacing: 6px; height: 74px;',
            style_class: 'linux-island__quota-card',
            x_expand: true,
        });

        this._antigravityRow = new AiQuotaProviderRow({
            id: 'antigravity',
            label: 'Antigravity',
            iconName: 'applications-science-symbolic',
        });
        this._codexRow = new AiQuotaProviderRow({
            id: 'codex',
            label: 'Codex',
            iconName: 'utilities-terminal-symbolic',
        });
        this._claudeRow = new AiQuotaProviderRow({
            id: 'claude',
            label: 'Claude',
            iconName: 'dialog-information-symbolic',
        });

        for (const row of [this._antigravityRow, this._codexRow, this._claudeRow]) {
            row.onWindowSelected = (id, mode) => {
                this._userSelected = true;
                this._selectedProviderId = id;
                this._activeMode = mode;
                this._syncSelection();
            };
            if (row.actor) this._chartCard.add_child(row.actor);
        }
        this._syncSelection();
        this.actor.add_child(this._chartCard);

        // Bottom Rolling Window Card
        this._windowCard = new St.BoxLayout({
            vertical: true,
            style: 'spacing: 3px;',
            style_class: 'linux-island__quota-window-card',
            x_expand: true,
        });
        const winRow = new St.BoxLayout({vertical: false, style: 'spacing: 6px;', x_expand: true});
        this._windowDetailLabel = new St.Label({
            text: 'Checking providers…',
            style: 'font-size: 9px;',
            style_class: 'linux-island__progress-time',
            x_expand: true,
        });
        if (this._windowDetailLabel.clutter_text?.set_ellipsize) {
            this._windowDetailLabel.clutter_text.set_ellipsize(3);
        }
        this._windowPctLabel = new St.Label({
            text: '--%',
            style: 'font-size: 10px; font-weight: bold;',
            style_class: 'linux-island__metric-value',
            x_align: Clutter.ActorAlign.END,
        });
        winRow.add_child(this._windowDetailLabel);
        winRow.add_child(this._windowPctLabel);
        this._windowCard.add_child(winRow);

        this._windowTrack = new St.BoxLayout({
            vertical: false,
            style: 'height: 4px;',
            style_class: 'linux-island__metric-track',
            x_expand: true,
        });
        this._windowFill = new St.Widget({
            style: 'height: 4px; width: 0px;',
            style_class: 'linux-island__metric-fill',
            x_align: Clutter.ActorAlign.START,
        });
        this._windowTrack.add_child(this._windowFill);
        this._windowCard.add_child(this._windowTrack);
        this.actor.add_child(this._windowCard);

        if (typeof this.actor.connect === 'function') {
            this._mappedSignalId = this.actor.connect('notify::mapped', () => {
                if (this._destroyed || !this.actor) return;
                if (!this.actor.mapped) {
                    this.stop();
                }
            });
        }
    }

    _syncSelection() {
        for (const [id, row] of [
            ['antigravity', this._antigravityRow],
            ['codex', this._codexRow],
            ['claude', this._claudeRow],
        ]) {
            row?.setSelected?.(id === this._selectedProviderId);
        }
        this._syncBottomWindow();
    }

    _syncBottomWindow() {
        const rows = {
            antigravity: this._antigravityRow,
            codex: this._codexRow,
            claude: this._claudeRow,
        };
        const chosen = rows[this._selectedProviderId] || this._antigravityRow;
        const pct = (() => {
            const wins = Array.isArray(chosen?._state?.windows) ? chosen._state.windows : [];
            const match = chosen?._activeMode === 'weekly'
                ? wins.find(w => w.window === '7d' || w.window === 'Weekly' || w.window === '30d')
                : wins.find(w => w.window === '5h');
            return chosen?._state?.connected && match && Number.isFinite(match.remainingPercent)
                ? Math.max(0, Math.min(100, match.remainingPercent)) : 0;
        })();
        if (this._summaryLabel && chosen?._state?.connected) {
            this._summaryLabel.text = `${chosen._label} · ${pct}% left`;
        } else if (this._summaryLabel) {
            this._summaryLabel.text = '';
        }
        if (this._windowDetailLabel) {
            const detail = chosen?._detailLabel?.text || 'No active quota window';
            this._windowDetailLabel.text = chosen?._state?.connected
                ? detail
                : `${chosen?._label || 'AI'} · ${detail}`;
        }
        if (this._windowPctLabel) {
            this._windowPctLabel.text = chosen?._state?.connected ? `${pct}% left` : '--%';
        }
        if (this._windowFill && this._trackW > 0) {
            this._windowFill.style = `height: 4px; width: ${Math.round(this._trackW * pct / 100)}px;`;
        }
    }

    setMode(mode) {
        this._activeMode = (mode === 'weekly') ? 'weekly' : '5h';
        this._antigravityRow?.setMode(this._activeMode);
        this._codexRow?.setMode(this._activeMode);
        this._claudeRow?.setMode(this._activeMode);
        this._syncBottomWindow();
    }

    _applySnapshot(snap) {
        if (!snap || this._destroyed) return;
        if (this._titleLabel) {
            this._titleLabel.text = snap.checking ? 'AI Quota · checking…' : 'AI Quota';
        }
        if (this._refreshBtn) {
            this._refreshBtn.label = snap.checking ? '…' : '↻';
        }
        if (this._antigravityRow && snap.antigravity) {
            this._antigravityRow.update(snap.antigravity);
        }
        if (this._codexRow && snap.codex) {
            this._codexRow.update(snap.codex);
        }
        if (this._claudeRow && snap.claude) {
            this._claudeRow.update(snap.claude);
        }
        if (!this._userSelected && !snap[this._selectedProviderId]?.connected && !snap[this._selectedProviderId]?.error) {
            const firstConnected = ['antigravity', 'codex', 'claude'].find(id => snap[id]?.connected);
            if (firstConnected) {
                this._selectedProviderId = firstConnected;
            }
        }
        this._syncSelection();
    }

    setWidth(w) {
        if (!this.actor || w <= 0) return;
        this.actor.style = `width: ${w}px; spacing: 5px;`;
        this.actor.width = w;
        this._trackW = Math.max(40, w - 16);
        const colW = Math.max(40, Math.floor((w - 28) / 3));
        this._antigravityRow?.setWidth(colW);
        this._codexRow?.setWidth(colW);
        this._claudeRow?.setWidth(colW);
        this._syncBottomWindow();
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
            if (this._mappedSignalId !== null && typeof this.actor.disconnect === 'function') {
                try { this.actor.disconnect(this._mappedSignalId); } catch (_) {}
                this._mappedSignalId = null;
            }
            this.actor.destroy();
            this.actor = null;
        }
    }
}
