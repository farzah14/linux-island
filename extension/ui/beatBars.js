let St = null;
let Clutter = null;
if (typeof process === 'undefined') {
    try {
        St = (await import('gi://St')).default;
        Clutter = (await import('gi://Clutter')).default;
    } catch (_) {} // Pure presentation tests do not construct Shell actors.
}

// Receives normalized speaker levels from Core; never samples audio in Shell.
export class BeatBars {
    constructor() {
        this._settings = St.Settings.get();
        this._enabled = true;
        this._playing = false;
        this._running = false;
        this._destroyed = false;
        this._levels = [0, 0, 0];
        this.actor = new St.BoxLayout({
            style: 'height: 14px; spacing: 2px;',
            y_align: Clutter.ActorAlign.CENTER,
            visible: false,
            reactive: false,
        });
        this._bars = [0, 1, 2].map(() => {
            const bar = new St.Widget({
                style: 'width: 3px; height: 14px; border-radius: 2px;',
                style_class: 'linux-island__beat-bar',
                y_align: Clutter.ActorAlign.END,
                reactive: false,
                scale_y: 0.15,
            });
            bar.set_pivot_point(0.5, 1);
            this.actor.add_child(bar);
            return bar;
        });
        this.actor.connect('notify::mapped', () => this._sync());
        this._settingsId = this._settings.connect('notify::enable-animations', () => this._sync());
    }

    setPlayback(playing, hasPlayer, levels) {
        this._playing = Boolean(playing);
        this._levels = [0, 1, 2].map(index => {
            const value = Number(Array.isArray(levels) ? levels[index] : 0);
            return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
        });
        this.actor.visible = Boolean(hasPlayer);
        this._sync();
    }

    setAnimationEnabled(enabled) {
        this._enabled = enabled !== false;
        this._sync();
    }

    _sync() {
        if (this._destroyed) return;
        const running = this._playing && this.actor.visible && this.actor.mapped &&
            this._enabled && this._settings.enable_animations;
        this._running = running;
        this._bars.forEach((bar, index) => {
            // Direct values also work when children map after their parent.
            // Repeating implicit eases could complete before mapping and stick.
            bar.scale_y = running ? 0.15 + 0.85 * this._levels[index] : 0.15;
        });
    }

    destroy() {
        this._destroyed = true;
        this._settings.disconnect(this._settingsId);
        for (const bar of this._bars) bar.remove_all_transitions();
        this.actor.destroy();
    }
}
