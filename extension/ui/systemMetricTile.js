import {SystemMetricsCollector} from '../lib/systemMetrics.js';

let St = null;
let Clutter = null;
let GLib = null;
if (typeof process === 'undefined') {
    try {
        St = (await import('gi://St')).default;
        Clutter = (await import('gi://Clutter')).default;
        GLib = (await import('gi://GLib')).default;
    } catch (_) {}
}

// Vertical rhythm inside the disk block: glyph, percentage and used/total.
// The three lines read as one unit, so they sit close (2px) with a slightly
// larger 3px pad above and below — that stops the block from looking crammed
// against the capsule edge while still staying shorter than the icon column.
export const STORAGE_LINE_SPACING = 2;
export const STORAGE_PADDING_Y = 3;
export const STORAGE_GLYPH_SIZE = 13;

export class SystemMetricTile {
    constructor({label = 'METRIC', iconName = ''} = {}) {
        this._label = label;
        this._iconName = iconName;
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
            vertical: false,
            style: 'spacing: 8px; height: 20px;',
            style_class: 'linux-island__metric-tile',
            x_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
        });

        if (this._iconName) {
            this._icon = new St.Icon({
                icon_name: this._iconName,
                fallback_icon_name: this._iconName,
                icon_size: 14,
                style_class: 'linux-island__metric-icon',
                y_align: Clutter.ActorAlign.CENTER,
            });
            this.actor.add_child(this._icon);
        }

        this._nameLabel = new St.Label({
            text: this._label,
            style_class: 'linux-island__metric-label',
            y_align: Clutter.ActorAlign.CENTER,
        });
        this.actor.add_child(this._nameLabel);

        this._valueLabel = new St.Label({
            text: '--%',
            style_class: 'linux-island__metric-value',
            x_align: Clutter.ActorAlign.END,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this.actor.add_child(this._valueLabel);
    }

    setWidth(w) {
        if (!this.actor || w <= 0) return;
        this.actor.style = `width: ${w}px; spacing: 8px; height: 20px;`;
        this.actor.width = w;
    }

    setIcon(iconName) {
        this._iconName = iconName;
        if (this._icon) {
            this._icon.icon_name = iconName;
            this._icon.fallback_icon_name = iconName;
            this._icon.visible = Boolean(iconName);
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
 * Pure math so it can be asserted without a GNOME Shell session.
 */
export function computeSystemColumns(contentWidth,
    {toggleWidth = 92, netWidth = 78, gap = 10, minSideWidth = 92} = {}) {
    const width = Math.max(0, Number(contentWidth) || 0);
    const toggles = Math.max(0, toggleWidth);
    const spacing = Math.max(0, gap);
    const minSide = Math.max(0, minSideWidth);
    // NET may shrink on narrow capsules, but the side columns never go below
    // minSideWidth, so CPU/RAM/BAT stay readable.
    const netRoom = width - spacing * 2 - minSide * 2;
    const net = Math.max(0, Math.min(Math.max(0, netWidth), Math.max(0, netRoom)));
    const sideWidth = Math.max(0, (width - net - spacing * 2) / 2);
    const netOffset = spacing + sideWidth;
    return {
        metricsWidth: sideWidth,
        netWidth: net,
        togglesWidth: toggles,
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
        this._icon = new St.Icon({
            icon_name: 'network-transmit-receive-symbolic',
            fallback_icon_name: 'network-wireless-symbolic',
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
        this._rxLabel.clutter_text?.set_ellipsize(3);
        this.actor.add_child(this._rxLabel);

        this._txLabel = new St.Label({
            text: '↑ 0 B/s',
            style_class: 'linux-island__metric-value',
            x_align: Clutter.ActorAlign.CENTER,
        });
        this._txLabel.clutter_text?.set_ellipsize(3);
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
        // Plain block: no background, border or border-radius. The parent row
        // lets it expand to absorb leftover width while the icon column takes
        // the right edge.
        //
        // Everything inside is centred, so the disk glyph and the percentage
        // sit centred above the "used/total" line rather than flush left.
        // padding + margin-bottom keeps the block off the capsule edge while
        // the 1px line spacing keeps the three lines reading as one unit.
        this.actor = new St.BoxLayout({
            vertical: true,
            style: `spacing: ${STORAGE_LINE_SPACING}px; padding: ${STORAGE_PADDING_Y}px 0;`,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
            reactive: true,
            track_hover: true,
            can_focus: false,
        });
        this.actor.connect('button-release-event', () => {
            this._onActivate();
            return Clutter.EVENT_STOP;
        });

        this._icon = new St.Icon({
            icon_name: 'drive-harddisk-symbolic',
            fallback_icon_name: 'drive-harddisk-symbolic',
            icon_size: STORAGE_GLYPH_SIZE,
            style_class: 'linux-island__metric-icon',
            x_align: Clutter.ActorAlign.CENTER,
        });
        this.actor.add_child(this._icon);

        this._valueLabel = new St.Label({
            text: '--%',
            style_class: 'linux-island__metric-value',
            x_align: Clutter.ActorAlign.CENTER,
        });
        this.actor.add_child(this._valueLabel);

        this._detailLabel = new St.Label({
            text: '',
            style: 'font-size: 9px;',
            style_class: 'linux-island__metric-label',
            x_align: Clutter.ActorAlign.CENTER,
        });
        this.actor.add_child(this._detailLabel);
    }

    setStorage(storage) {
        if (!storage) return;
        this._percent = Math.max(0, Math.min(100, Number(storage.percent) || 0));
        if (this._icon && storage.iconName) {
            this._icon.icon_name = storage.iconName;
            this._icon.fallback_icon_name = storage.iconName;
        }
        if (this._valueLabel) this._valueLabel.text = storage.text || `${Math.round(this._percent)}%`;
        if (this._detailLabel) {
            // The system page's disk column is narrow; prefer the compact
            // "36/143 GB" form so the line is not clipped.
            this._detailLabel.text =
                storage.compactDetailText || storage.detailText || '';
        }
        if (this.actor) {
            this.actor.accessible_name =
                `Storage ${Math.round(this._percent)}% used` +
                (storage.detailText ? `, ${storage.detailText}` : '');
            // Warn visually when the disk is nearly full, using the token accent.
            // add_style_class_name/remove_style_class_name keep any other
            // classes intact; the direct assignment stays for the test mock.
            if (this._percent >= 90) {
                this.actor.add_style_class_name?.('linux-island__storage--critical');
                this.actor.style_class = 'linux-island__storage--critical';
            } else {
                this.actor.remove_style_class_name?.('linux-island__storage--critical');
                this.actor.style_class = '';
            }
        }
    }

    get percent() {
        return this._percent;
    }

    /**
     * Record the column width for layout bookkeeping only.
     *
     * The labels deliberately keep their natural width. Giving them an explicit
     * width made each label fill the whole block, so `x_align: CENTER` had
     * nothing left to centre and the text rendered flush left — which is what
     * made the percentage look misaligned against the disk glyph above it.
     * Natural width lets the block centre each line as an actor instead.
     */
    setLabelWidth(w) {
        if (!this.actor || w <= 0) return;
        this._labelWidth = w;
    }

    setWidth(w) {
        if (!this.actor || w <= 0) return;
        // Keep the vertical padding: this assignment replaces the whole style
        // string, so dropping it here silently flattened the block again.
        this.actor.style =
            `spacing: ${STORAGE_LINE_SPACING}px; padding: ${STORAGE_PADDING_Y}px 0; width: ${w}px;`;
        this.actor.width = w;
        this.setLabelWidth(w);
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
            vertical: false,
            style: 'spacing: 10px;',
            x_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
        });

        // Left Column: CPU, RAM, Battery (with percentages)
        this._metricsCol = new St.BoxLayout({
            vertical: true,
            style: 'spacing: 4px;',
            x_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
        });

        this._cpuTile = new SystemMetricTile({
            label: 'CPU',
            iconName: 'preferences-system-performance-symbolic',
        });
        if (this._cpuTile.actor) this._metricsCol.add_child(this._cpuTile.actor);

        this._ramTile = new SystemMetricTile({
            label: 'RAM',
            iconName: 'drive-harddisk-symbolic',
        });
        if (this._ramTile.actor) this._metricsCol.add_child(this._ramTile.actor);

        // Check if system has a battery device
        const initial = this._collector.collect();
        if (initial.battery) {
            this._batTile = new SystemMetricTile({
                label: 'BAT',
                iconName: initial.battery.iconName || 'battery-good-symbolic',
            });
            if (this._batTile.actor) this._metricsCol.add_child(this._batTile.actor);
        }

        this.actor.add_child(this._metricsCol);
    }

    setWidth(w) {
        if (!this.actor || w <= 0) return;
        this.actor.style = `width: ${w}px; spacing: 10px;`;
        this.actor.width = w;
        if (this._metricsCol) {
            this._metricsCol.style = `width: ${w}px; spacing: 4px;`;
            this._metricsCol.width = w;
        }
        if (this._cpuTile) this._cpuTile.setWidth(w);
        if (this._ramTile) this._ramTile.setWidth(w);
        if (this._batTile) this._batTile.setWidth(w);
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
            this._batTile.setIcon(metrics.battery.iconName || 'battery-good-symbolic');
            this._batTile.setLabel(metrics.battery.device || 'BAT');
            this._batTile.setValue(metrics.battery.text, metrics.battery.percent);
        }
        if (metrics.network) {
            this._onNetwork(metrics.network);
        }
        if (metrics.storage) {
            this._onStorage(metrics.storage);
        }
    }

    start() {
        if (this._destroyed) return;
        this.update();
        if (!this._timerId) {
            this._timerId = this._scheduler.add(1500, () => this.update());
        }
    }

    stop() {
        this._stopTimer();
    }

    _onMappedChanged() {
        if (this._destroyed || !this.actor) return;
        const isMapped = this.actor.mapped;
        if (isMapped) {
            this.update();
            if (!this._timerId) {
                this._timerId = this._scheduler.add(1500, () => this.update());
            }
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
        if (this._metricsCol) {
            this._metricsCol.destroy();
            this._metricsCol = null;
        }
        if (this.actor) {
            this.actor.destroy();
            this.actor = null;
        }
    }
}
