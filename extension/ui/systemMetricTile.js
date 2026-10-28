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

export class SystemMetricsRow {
    constructor({collector, scheduler} = {}) {
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
        this._netTile = null;
        this._netBox = null;
        this._rxLabel = null;
        this._txLabel = null;
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

        // Right Column (beside percentage): Network Monitor
        this._netBox = new St.BoxLayout({
            vertical: true,
            style: 'spacing: 3px; padding: 6px 8px; min-width: 96px; border-radius: 6px; background-color: rgba(255,255,255,0.04);',
            style_class: 'linux-island__net-monitor',
            y_align: Clutter.ActorAlign.CENTER,
        });

        const netHeader = new St.BoxLayout({
            vertical: false,
            style: 'spacing: 5px;',
            y_align: Clutter.ActorAlign.CENTER,
        });
        const netIcon = new St.Icon({
            icon_name: 'network-transmit-receive-symbolic',
            fallback_icon_name: 'network-wireless-symbolic',
            icon_size: 13,
            style_class: 'linux-island__metric-icon',
            y_align: Clutter.ActorAlign.CENTER,
        });
        const netTitle = new St.Label({
            text: 'NET',
            style: 'font-size: 11px; font-weight: bold;',
            style_class: 'linux-island__metric-label',
            y_align: Clutter.ActorAlign.CENTER,
        });
        netHeader.add_child(netIcon);
        netHeader.add_child(netTitle);
        this._netBox.add_child(netHeader);

        this._rxLabel = new St.Label({
            text: '↓ 0 B/s',
            style: 'font-size: 11px;',
            style_class: 'linux-island__metric-value',
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._netBox.add_child(this._rxLabel);

        this._txLabel = new St.Label({
            text: '↑ 0 B/s',
            style: 'font-size: 11px;',
            style_class: 'linux-island__metric-value',
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._netBox.add_child(this._txLabel);

        this.actor.add_child(this._netBox);

        this._netTile = {
            _label: 'NET',
            _iconName: 'network-transmit-receive-symbolic',
            actor: this._netBox,
            setValue: (text) => {
                if (this._rxLabel) this._rxLabel.text = text ? `↓ ${text}` : '↓ 0 B/s';
            },
            setSpeeds: (rxText, txText) => {
                if (this._rxLabel) this._rxLabel.text = rxText || '↓ 0 B/s';
                if (this._txLabel) this._txLabel.text = txText || '↑ 0 B/s';
            },
            setWidth: () => {},
            destroy: () => {},
        };
    }

    setWidth(w) {
        if (!this.actor || w <= 0) return;
        this.actor.style = `width: ${w}px; spacing: 10px;`;
        this.actor.width = w;
        const leftW = Math.max(80, Math.round(w * 0.54));
        if (this._metricsCol) {
            this._metricsCol.style = `width: ${leftW}px; spacing: 4px;`;
            this._metricsCol.width = leftW;
        }
        if (this._cpuTile) this._cpuTile.setWidth(leftW);
        if (this._ramTile) this._ramTile.setWidth(leftW);
        if (this._batTile) this._batTile.setWidth(leftW);
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
            if (this._rxLabel) this._rxLabel.text = metrics.network.rxText || `↓ ${metrics.network.text}`;
            if (this._txLabel) this._txLabel.text = metrics.network.txText || '↑ 0 B/s';
            if (this._netTile && typeof this._netTile.setValue === 'function') {
                this._netTile.setValue(metrics.network.text);
            }
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
        if (this._netBox) {
            this._netBox.destroy();
            this._netBox = null;
        }
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
