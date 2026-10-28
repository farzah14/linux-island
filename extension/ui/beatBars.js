let St = null;
let Clutter = null;
let GLib = null;
if (typeof process === 'undefined') {
    try {
        St = (await import('gi://St')).default;
        Clutter = (await import('gi://Clutter')).default;
        GLib = (await import('gi://GLib')).default;
    } catch (_) {} // Pure presentation tests do not construct Shell actors.
}

const PROCEDURAL_BEAT_FRAMES = [
    [0.35, 0.85, 0.45],
    [0.70, 0.40, 0.90],
    [0.90, 0.70, 0.35],
    [0.50, 0.95, 0.65],
    [0.25, 0.60, 0.80],
    [0.65, 0.30, 0.50],
    [0.80, 0.85, 0.30],
    [0.40, 0.55, 0.75],
];

// Receives normalized speaker levels from Core; never samples audio in Shell.
export class BeatBars {
    constructor() {
        this._settings = St.Settings.get();
        this._enabled = true;
        this._playing = false;
        this._running = false;
        this._destroyed = false;
        this._levels = [0, 0, 0];
        this._prevScales = [0.15, 0.15, 0.15];
        this._proceduralTimerId = null;
        this._proceduralFrame = 0;
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

    _stopProceduralBeat() {
        if (this._proceduralTimerId) {
            if (GLib) GLib.source_remove(this._proceduralTimerId);
            this._proceduralTimerId = null;
        }
    }

    _startProceduralBeat() {
        if (this._proceduralTimerId || typeof process !== 'undefined' || !GLib) return;
        this._proceduralTimerId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 110, () => {
            if (this._destroyed || !this._running) {
                this._proceduralTimerId = null;
                return GLib.SOURCE_REMOVE;
            }
            this._proceduralFrame = (this._proceduralFrame + 1) % PROCEDURAL_BEAT_FRAMES.length;
            const frame = PROCEDURAL_BEAT_FRAMES[this._proceduralFrame];
            this._renderScales(frame);
            return GLib.SOURCE_CONTINUE;
        });
    }

    _renderScales(levels) {
        this._bars.forEach((bar, index) => {
            const rawLevel = levels[index] ?? 0;
            const targetScale = this._running ? 0.15 + 0.85 * rawLevel : 0.15;
            const prevScale = this._prevScales[index] ?? 0.15;
            this._prevScales[index] = targetScale;

            if (this._running && typeof bar.ease === 'function' && typeof process === 'undefined') {
                const isRising = targetScale >= prevScale;
                const duration = isRising ? 75 : 110;
                const mode = isRising
                    ? (Clutter?.AnimationMode?.EASE_OUT_CUBIC ?? 1)
                    : (Clutter?.AnimationMode?.EASE_OUT_QUAD ?? 1);

                bar.remove_all_transitions();
                bar.ease({
                    scale_y: targetScale,
                    duration,
                    mode,
                });
            } else {
                bar.remove_all_transitions?.();
                bar.scale_y = targetScale;
            }
        });
    }


    _sync() {
        if (this._destroyed) return;
        const running = this._playing && this.actor.visible && this.actor.mapped &&
            this._enabled && this._settings.enable_animations;
        this._running = running;

        const hasRealLevels = this._levels.some(l => l > 0.005);
        if (running) {
            if (hasRealLevels) {
                this._stopProceduralBeat();
                this._renderScales(this._levels);
            } else {
                // Procedural radio beat animation when levels are quiet/unavailable
                if (typeof process === 'undefined') {
                    this._startProceduralBeat();
                    const frame = PROCEDURAL_BEAT_FRAMES[this._proceduralFrame];
                    this._renderScales(frame);
                } else {
                    this._renderScales([0, 0, 0]);
                }
            }
        } else {
            this._stopProceduralBeat();
            this._renderScales([0, 0, 0]);
        }
    }

    destroy() {
        this._destroyed = true;
        this._stopProceduralBeat();
        this._settings.disconnect(this._settingsId);
        for (const bar of this._bars) bar.remove_all_transitions();
        this.actor.destroy();
    }
}
