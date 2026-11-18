import {SystemMetricsCollector} from '../lib/systemMetrics.js';

let St = null;
let Clutter = null;
let GLib = null;
let Gio = null;
if (typeof process === 'undefined') {
    try {
        St = (await import('gi://St')).default;
        Clutter = (await import('gi://Clutter')).default;
        GLib = (await import('gi://GLib')).default;
        Gio = (await import('gi://Gio')).default;
    } catch (_) {}
}

export function getLocalUiGIcon(name) {
    if (!Gio || typeof Gio.File?.new_for_uri !== 'function') return null;
    try {
        const thisFile = Gio.File.new_for_uri(import.meta.url);
        const iconFile = thisFile.get_parent().get_parent().get_child('icons').get_child('ui').get_child(name);
        if (iconFile.query_exists(null)) {
            return new Gio.FileIcon({file: iconFile});
        }
    } catch (_) {}
    return null;
}

// Vertical rhythm inside the disk block: glyph, percentage and used/total.
// The three lines read as one unit, so they sit close (2px) with a slightly
// larger 3px pad above and below — that stops the block from looking crammed
// against the capsule edge while still staying shorter than the icon column.
export const STORAGE_LINE_SPACING = 2;
export const STORAGE_PADDING_Y = 3;
export const STORAGE_GLYPH_SIZE = 13;

// At the small preset each side slot falls to ~72px. The full tile needs 92px
// (14px glyph + 8px gap + label + 8px gap + value + 8px padding), which is why
// the old budget floored the sides at 92px and starved NET instead. Below this
// width the glyph is dropped so label + value stay readable.
export const METRIC_COMPACT_WIDTH = 76;
// The disk block lives beside the 22px icon column, so at the small preset it
// only gets ~42px: enough for the percentage, not for "147/249 GB". Pango
// measures that string at 58px in Sans 9px, so the detail line is only shown
// when the block can actually hold it.
export const STORAGE_COMPACT_WIDTH = 58;

export class SystemMetricTile {
    constructor({label = 'METRIC', iconName = ''} = {}) {
        this._label = label;
        this._iconName = iconName;
        this._compact = false;
        this.actor = null;
        this._icon = null;
        this._nameLabel = null;
        this._valueLabel = null;
        this._fill = null;
        this._track = null;

        if (St && Clutter) {
            this._build();
        }
    }

    _build() {
        this.actor = new St.BoxLayout({
            vertical: true,
            style: 'spacing: 2px; height: 36px;',
            style_class: 'linux-island__metric-card',
            x_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
        });

        this._nameLabel = new St.Label({
            text: this._label,
            style_class: 'linux-island__metric-card-title',
            x_align: Clutter.ActorAlign.START,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this.actor.add_child(this._nameLabel);

        this._valueLabel = new St.Label({
            text: '--%',
            style_class: 'linux-island__metric-card-value',
            x_expand: true,
            x_align: Clutter.ActorAlign.START,
            y_align: Clutter.ActorAlign.CENTER,
        });
        if (this._valueLabel.clutter_text?.set_ellipsize) {
            this._valueLabel.clutter_text.set_ellipsize(3);
        }
        this.actor.add_child(this._valueLabel);
    }

    setWidth(w) {
        if (!this.actor || w <= 0) return;
        this._compact = w < METRIC_COMPACT_WIDTH;
        this.actor.style = `width: ${w}px; spacing: 2px; height: 36px;`;
        this.actor.width = w;
    }

    setIcon(iconName) {
        this._iconName = iconName;
        if (this._icon) {
            this._icon.icon_name = iconName;
            this._icon.fallback_icon_name = iconName;
            this._icon.visible = Boolean(iconName) && !this._compact;
        }
    }

    setLabel(label) {
        this._label = label;
        if (this._nameLabel) {
            this._nameLabel.text = label;
        }
    }

    setValue(text, percent) {
        if (this._valueLabel) {
            this._valueLabel.text = text ? String(text) : '--%';
        }
        this._percent = (typeof percent === 'number' && !isNaN(percent))
            ? Math.max(0, Math.min(100, percent))
            : 0;
    }

    _syncFill() {
        // Line rectangles removed per user request: percentage only
    }

    destroy() {
        if (this.actor) {
            this.actor.destroy();
            this.actor = null;
        }
    }
}

/**
 * Horizontal budget for the System & Controls page.
 *
 * Layout is three columns: metrics (left) | NET (fixed, centred) | right group
 * (disk readout + quick-setting icon column). Because both side columns expand
 * by the same amount, the NET column lands exactly on the page centre line.
 *
 * NET keeps its full width at every real preset. It is the only column whose
 * text cannot degrade — "↓ 999.9 KB/s" needs ~66px at 11px bold — so the side
 * columns give way first and NET only shrinks once they hit minSideWidth.
 * The Qt overlay already behaves this way (SystemPage.qml pins NET at 78px and
 * lets the flexible side slots absorb the squeeze); the extension used to do
 * the opposite and starved NET to 22px on the small preset, hiding its text.
 *
 * Pure math so it can be asserted without a GNOME Shell session.
 */
export function computeSystemColumns(contentWidth,
    {toggleWidth = 92, netWidth = 78, gap = 10, narrowGap = 6,
        minSideWidth = 64, narrowBelow = 286} = {}) {
    const width = Math.max(0, Number(contentWidth) || 0);
    const toggles = Math.max(0, toggleWidth);
    const narrow = width < narrowBelow;
    const spacing = Math.max(0, narrow ? narrowGap : gap);
    const minSide = Math.max(0, minSideWidth);
    // NET is protected: it only gives up width once both side columns have
    // already collapsed to their floor.
    const netRoom = width - spacing * 2 - minSide * 2;
    const net = Math.max(0, Math.min(Math.max(0, netWidth), Math.max(0, netRoom)));
    const sideWidth = Math.max(0, (width - net - spacing * 2) / 2);
    const netOffset = spacing + sideWidth;
    return {
        metricsWidth: sideWidth,
        netWidth: net,
        // The right group occupies the same slot as the left one, so this is
        // the width it actually gets, not just its 92px design budget.
        togglesWidth: Math.min(toggles, sideWidth),
        gap: spacing,
        netOffset,
        netCentre: netOffset + net / 2,
        pageCentre: width / 2,
        total: sideWidth * 2 + net + spacing * 2,
    };
}

export class NetMonitorView {
    constructor({onUpdate} = {}) {
        this._onUpdate = onUpdate ?? (() => {});
        this.actor = null;
        this._icon = null;
        this._label = null;
        this._rxLabel = null;
        this._txLabel = null;
        if (St && Clutter) {
            this._build();
        }
    }

    _build() {
        // No background, border or border-radius: the speeds sit directly on
        // the island surface, centred between the metrics and the toggles.
        this.actor = new St.BoxLayout({
            vertical: true,
            style: 'spacing: 2px;',
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
        });

        const header = new St.BoxLayout({
            vertical: false,
            style: 'spacing: 4px;',
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
        });
        const netGicon = getLocalUiGIcon('network-symbolic.svg');
        this._icon = new St.Icon({
            icon_name: 'network-transmit-receive-symbolic',
            fallback_icon_name: 'network-wireless-symbolic',
            ...(netGicon ? {gicon: netGicon} : {}),
            icon_size: 13,
            style_class: 'linux-island__metric-icon',
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._label = new St.Label({
            text: 'NET',
            style_class: 'linux-island__metric-label',
            y_align: Clutter.ActorAlign.CENTER,
        });
        header.add_child(this._icon);
        header.add_child(this._label);
        this.actor.add_child(header);

        this._rxLabel = new St.Label({
            text: '↓ 0 B/s',
            style_class: 'linux-island__metric-value',
            x_align: Clutter.ActorAlign.CENTER,
        });
        this.actor.add_child(this._rxLabel);

        this._txLabel = new St.Label({
            text: '↑ 0 B/s',
            style_class: 'linux-island__metric-value',
            x_align: Clutter.ActorAlign.CENTER,
        });
        this.actor.add_child(this._txLabel);
    }

    setWidth(w) {
        if (!this.actor || w <= 0) return;
        this.actor.style = `spacing: 2px; width: ${w}px;`;
        this.actor.width = w;
    }

    setNetwork(network) {
        if (!network) return;
        const rxText = network.rxText || `↓ ${network.text || '0 B/s'}`;
        const txText = network.txText || '↑ 0 B/s';
        if (this._rxLabel) this._rxLabel.text = rxText;
        if (this._txLabel) this._txLabel.text = txText;
        if (this._label && network.label) this._label.text = network.label;
        if (this._icon && network.iconName) this._icon.icon_name = network.iconName;
        this._onUpdate(network);
    }

    destroy() {
        if (this.actor) {
            this.actor.destroy();
            this.actor = null;
        }
        this._icon = null;
        this._label = null;
        this._rxLabel = null;
        this._txLabel = null;
    }
}

export class StorageIndicator {
    constructor({onActivate} = {}) {
        this._onActivate = onActivate ?? (() => {});
        this.actor = null;
        this._icon = null;
        this._valueLabel = null;
        this._detailLabel = null;
        this._percent = 0;
        if (St && Clutter) {
            this._build();
        }
    }

    _build() {
        this.actor = new St.BoxLayout({
            vertical: true,
            style: 'spacing: 3px; height: 22px;',
            x_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
            reactive: true,
            track_hover: true,
            can_focus: false,
        });
        this.actor.connect('button-release-event', () => {
            this._onActivate();
            return Clutter.EVENT_STOP;
        });

        const topRow = new St.BoxLayout({
            vertical: false,
            style: 'spacing: 6px;',
            x_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
        });

        this._valueLabel = new St.Label({
            text: 'Storage',
            style: 'font-size: 10px; font-weight: 600;',
            style_class: 'linux-island__metric-label',
            x_expand: true,
            x_align: Clutter.ActorAlign.START,
            y_align: Clutter.ActorAlign.CENTER,
        });
        topRow.add_child(this._valueLabel);

        this._detailLabel = new St.Label({
            text: '--%',
            style: 'font-size: 10px; font-weight: 600;',
            style_class: 'linux-island__metric-value',
            x_align: Clutter.ActorAlign.END,
            y_align: Clutter.ActorAlign.CENTER,
        });
        topRow.add_child(this._detailLabel);
        this.actor.add_child(topRow);

        this._track = new St.BoxLayout({
            vertical: false,
            style: 'height: 4px;',
            style_class: 'linux-island__metric-track',
            x_expand: true,
        });
        this._fill = new St.Widget({
            style: 'height: 4px; width: 0px;',
            style_class: 'linux-island__metric-fill',
            x_align: Clutter.ActorAlign.START,
        });
        this._track.add_child(this._fill);
        this.actor.add_child(this._track);
    }

    setStorage(storage) {
        if (!storage) return;
        this._percent = Math.max(0, Math.min(100, Number(storage.percent) || 0));
        if (this._valueLabel) {
            const detail = storage.compactDetailText || storage.detailText || '';
            this._valueLabel.text = detail ? `Disk · ${detail}` : 'Disk';
        }
        if (this._detailLabel) {
            this._detailLabel.text = storage.text || `${Math.round(this._percent)}%`;
        }
        if (this._fill && this._trackWidth > 0) {
            const fillW = Math.round(this._trackWidth * (this._percent / 100));
            this._fill.style = `height: 4px; width: ${fillW}px;`;
        }
        if (this.actor) {
            this.actor.accessible_name =
                `Storage ${Math.round(this._percent)}% used` +
                (storage.detailText ? `, ${storage.detailText}` : '');
            if (this._percent >= 90) {
                this.actor.add_style_class_name?.('linux-island__storage--critical');
            } else {
                this.actor.remove_style_class_name?.('linux-island__storage--critical');
            }
        }
    }

    get percent() {
        return this._percent;
    }

    setLabelWidth(w) {
        if (!this.actor || w <= 0) return;
        this._labelWidth = w;
    }

    setWidth(w) {
        if (!this.actor || w <= 0) return;
        this._trackWidth = w;
        this.actor.style = `spacing: 3px; height: 22px; width: ${w}px;`;
        this.actor.width = w;
        this.setLabelWidth(w);
        if (this._fill) {
            const fillW = Math.round(w * (this._percent / 100));
            this._fill.style = `height: 4px; width: ${fillW}px;`;
        }
    }

    destroy() {
        if (this.actor) {
            this.actor.destroy();
            this.actor = null;
        }
        this._icon = null;
        this._valueLabel = null;
        this._detailLabel = null;
    }
}

export class SystemMetricsRow {
    constructor({collector, scheduler, onNetwork, onStorage} = {}) {
        this._collector = collector ?? new SystemMetricsCollector();
        this._timerId = null;
        this._destroyed = false;
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
                if (typeof rawSched.remove === 'function') return rawSched.remove(id);
                if (typeof rawSched.cancel === 'function') return rawSched.cancel(id);
                if (GLib && id) GLib.source_remove(id);
            },
        };

        this.actor = null;
        this._metricsCol = null;
        this._cpuTile = null;
        this._ramTile = null;
        this._batTile = null;
        this._onNetwork = onNetwork ?? (() => {});
        this._onStorage = onStorage ?? (() => {});
        if (St && Clutter) {
            this._build();
            this.actor.connect('notify::mapped', () => this._onMappedChanged());
        }
    }

    _build() {
        this.actor = new St.BoxLayout({
            vertical: true,
            style: 'spacing: 4px;',
            x_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
        });

        this._row1 = new St.BoxLayout({
            vertical: false,
            style: 'spacing: 6px;',
            x_expand: true,
        });
        this._cpuTile = new SystemMetricTile({
            label: 'CPU LOAD',
            iconName: 'preferences-system-performance-symbolic',
        });
        if (this._cpuTile.actor) this._row1.add_child(this._cpuTile.actor);

        this._ramTile = new SystemMetricTile({
            label: 'MEMORY',
            iconName: 'drive-harddisk-symbolic',
        });
        if (this._ramTile.actor) this._row1.add_child(this._ramTile.actor);
        this.actor.add_child(this._row1);

        this._row2 = new St.BoxLayout({
            vertical: false,
            style: 'spacing: 6px;',
            x_expand: true,
        });
        const initial = this._collector.collect();
        this._batTile = new SystemMetricTile({
            label: 'BATTERY',
            iconName: initial.battery?.iconName || 'battery-good-symbolic',
        });
        if (!initial.battery) {
            this._batTile.setValue('AC', 100);
        }
        if (this._batTile.actor) this._row2.add_child(this._batTile.actor);

        this._netTile = new SystemMetricTile({
            label: 'NETWORK',
            iconName: 'network-transmit-receive-symbolic',
        });
        this._netTile.setValue('↓ 0 B/s', 0);
        if (this._netTile.actor) this._row2.add_child(this._netTile.actor);
        this.actor.add_child(this._row2);
    }

    setWidth(w) {
        if (!this.actor || w <= 0) return;
        const cardW = Math.max(60, Math.floor((w - 6) / 2));
        this.actor.style = `width: ${w}px; spacing: 4px;`;
        this.actor.width = w;
        for (const row of [this._row1, this._row2]) {
            if (row) {
                row.style = `width: ${w}px; spacing: 6px;`;
                row.width = w;
            }
        }
        if (this._cpuTile) this._cpuTile.setWidth(cardW);
        if (this._ramTile) this._ramTile.setWidth(cardW);
        if (this._batTile) this._batTile.setWidth(cardW);
        if (this._netTile) this._netTile.setWidth(cardW);
    }

    update() {
        if (this._destroyed) return;
        const metrics = this._collector.collect();

        if (metrics.cpu && this._cpuTile) {
            this._cpuTile.setValue(metrics.cpu.text, metrics.cpu.percent);
        }
        if (metrics.ram && this._ramTile) {
            this._ramTile.setValue(metrics.ram.text, metrics.ram.percent);
        }
        if (metrics.battery && this._batTile) {
            const suffix = metrics.battery.isCharging ? ' · AC' : '';
            this._batTile.setValue(`${Math.round(metrics.battery.percent)}%${suffix}`, metrics.battery.percent);
            this._batTile.actor.accessible_name = metrics.battery.isCharging
                ? `Battery ${Math.round(metrics.battery.percent)} percent, charging`
                : `Battery ${Math.round(metrics.battery.percent)} percent`;
        }
        if (metrics.network) {
            if (this._netTile) {
                const rx = metrics.network.rxText || '↓ 0 B/s';
                const tx = metrics.network.txText || '↑ 0 B/s';
                this._netTile.setValue(`${rx} · ${tx}`.replace(/\/s/g, ''), 0);
            }
            this._onNetwork(metrics.network);
        }
        if (metrics.storage) {
            this._onStorage(metrics.storage);
        }
    }

    start() {
        if (this._destroyed || this._timerId) return;
        this.update();
        this._timerId = this._scheduler.add(1500, () => this.update());
    }

    stop() {
        this._stopTimer();
    }

    _onMappedChanged() {
        if (this._destroyed || !this.actor) return;
        if (this.actor.mapped) {
            this.start();
        } else {
            this._stopTimer();
        }
    }

    _stopTimer() {
        if (this._timerId) {
            this._scheduler.remove(this._timerId);
            this._timerId = null;
        }
    }

    destroy() {
        this._destroyed = true;
        this._stopTimer();
        if (this._cpuTile) this._cpuTile.destroy();
        if (this._ramTile) this._ramTile.destroy();
        if (this._batTile) this._batTile.destroy();
        if (this._netTile) this._netTile.destroy();
        if (this._row1) {
            this._row1.destroy();
            this._row1 = null;
        }
        if (this._row2) {
            this._row2.destroy();
            this._row2 = null;
        }
        if (this.actor) {
            this.actor.destroy();
            this.actor = null;
        }
    }
}
