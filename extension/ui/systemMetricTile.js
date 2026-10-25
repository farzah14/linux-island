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
    constructor({label = 'METRIC'} = {}) {
        this._label = label;
        this.actor = null;
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
            style: 'padding: 6px 10px; spacing: 4px; border-radius: 10px;',
            style_class: 'linux-island__metric-tile',
            x_expand: true,
        });

        const headerRow = new St.BoxLayout({
            style: 'spacing: 6px;',
            x_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
        });

        const nameLabel = new St.Label({
            text: this._label,
            style_class: 'linux-island__metric-label',
            y_align: Clutter.ActorAlign.CENTER,
        });
        headerRow.add_child(nameLabel);

        const spacer = new St.Widget({x_expand: true});
        headerRow.add_child(spacer);

        this._valueLabel = new St.Label({
            text: '--',
            style_class: 'linux-island__metric-value',
            y_align: Clutter.ActorAlign.CENTER,
        });
        headerRow.add_child(this._valueLabel);
        this.actor.add_child(headerRow);

        this._track = new St.Bin({
            style: 'height: 3px; border-radius: 2px;',
            style_class: 'linux-island__metric-track',
            x_expand: true,
        });

        this._fill = new St.Widget({
            style: 'height: 3px; border-radius: 2px;',
            style_class: 'linux-island__metric-fill',
            x_align: Clutter.ActorAlign.START,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._track.set_child(this._fill);
        this._track.connect('notify::allocation', () => this._syncFill());
        this.actor.add_child(this._track);
    }

    setValue(text, percent) {
        if (this._valueLabel) {
            this._valueLabel.text = text ? String(text) : '--';
        }
        this._percent = (typeof percent === 'number' && !isNaN(percent))
            ? Math.max(0, Math.min(100, percent))
            : 0;
        this._syncFill();
    }

    _syncFill() {
        if (!this._fill || !this._track) return;
        const totalW = this._track.width;
        if (totalW <= 0) return;
        const fillW = Math.max(0, Math.round((totalW * (this._percent || 0)) / 100));
        this._fill.set_width(fillW);
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
        this._scheduler = scheduler ?? {
            add: (ms, fn) => GLib ? GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => {
                fn();
                return GLib.SOURCE_CONTINUE;
            }) : null,
            remove: (id) => { if (GLib && id) GLib.source_remove(id); },
        };

        this.actor = null;
        this._cpuTile = null;
        this._ramTile = null;
        this._batTile = null;

        if (St && Clutter) {
            this._build();
            this.actor.connect('notify::mapped', () => this._onMappedChanged());
        }
    }

    _build() {
        this.actor = new St.BoxLayout({
            style: 'spacing: 8px;',
            x_expand: true,
        });

        this._cpuTile = new SystemMetricTile({label: 'CPU'});
        if (this._cpuTile.actor) this.actor.add_child(this._cpuTile.actor);

        this._ramTile = new SystemMetricTile({label: 'RAM'});
        if (this._ramTile.actor) this.actor.add_child(this._ramTile.actor);

        // Check if system has a battery
        const initial = this._collector.collect();
        if (initial.battery) {
            this._batTile = new SystemMetricTile({label: 'BAT'});
            if (this._batTile.actor) this.actor.add_child(this._batTile.actor);
        }
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
            this._batTile.setValue(metrics.battery.text, metrics.battery.percent);
        }
    }

    _onMappedChanged() {
        if (this._destroyed || !this.actor) return;
        const isMapped = this.actor.mapped;
        if (isMapped) {
            this.update();
            if (!this._timerId) {
                this._timerId = this._scheduler.add(2000, () => this.update());
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
        if (this.actor) {
            this.actor.destroy();
            this.actor = null;
        }
    }
}
