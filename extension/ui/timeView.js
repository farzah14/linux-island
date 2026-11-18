// Timer / Pomodoro page for the Linux Island FeatureCarousel.
//
// Presentation only: the Core daemon owns the countdown, so it keeps running
// across page switches, capsule collapses and renderer restarts.
//
// The page exposes the full timer surface: a countdown with presets and a
// custom duration, a pomodoro with a visible cycle position and phase, plus
// live session statistics.

import {formatClock} from '../lib/timeFormat.js';

let St = null;
let Clutter = null;
let Pango = null;
if (typeof process === 'undefined') {
    try {
        St = (await import('gi://St')).default;
        Clutter = (await import('gi://Clutter')).default;
        Pango = (await import('gi://Pango')).default;
    } catch (_) {}
}

const PRESETS = [5, 15, 25, 45];
const CUSTOM_STEPS = [-5, 5];
const CUSTOM_MIN = 1;
const CUSTOM_MAX = 180;

export class TimeSection {
    constructor({onStart, onControl, onStats} = {}) {
        this._onStart = onStart ?? (() => {});
        this._onControl = onControl ?? (() => {});
        this._onStats = onStats ?? (() => {});

        this._timer = null;
        this._stats = null;
        this._lastPreset = 25;
        this._customMin = 25;
        this._selectedMode = 'countdown';
        this._lastState = null;
        this._lastMode = null;
        this._trackWidth = 0;

        this.actor = null;
        this._clockLabel = null;
        this._phaseLabel = null;
        this._cycleLabel = null;
        this._track = null;
        this._fill = null;
        this._buttonsRow = null;
        this._modeRow = null;
        this._customRow = null;
        this._statsLabel = null;
        this._buttons = [];

        if (St && Clutter) {
            this._build();
        }
    }

    _build() {
        this.actor = new St.BoxLayout({
            vertical: true,
            style: 'spacing: 5px;',
            style_class: 'linux-island__time-section',
            x_expand: true,
        });

        // Hero Row: left clock + phase/cycle badge, right 40x40 circular ring with percentage inside.
        this._clockRow = new St.BoxLayout({
            vertical: false,
            style: 'height: 40px; spacing: 8px;',
            x_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._clockLabel = new St.Label({
            text: '0:00',
            style_class: 'linux-island__timer-clock',
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._clockRow.add_child(this._clockLabel);
        this._phaseLabel = new St.Label({
            text: '',
            style_class: 'linux-island__timer-phase',
            visible: false,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._clockRow.add_child(this._phaseLabel);
        this._cycleLabel = new St.Label({
            text: '',
            style_class: 'linux-island__timer-cycle',
            visible: false,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._clockRow.add_child(this._cycleLabel);
        this._clockRow.add_child(new St.Widget({x_expand: true}));

        this._ringPctLabel = new St.Label({
            text: '0%',
            style_class: 'linux-island__timer-ring-pct',
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
        });
        if (typeof St.DrawingArea === 'function') {
            this._ringArea = new St.DrawingArea({
                style_class: 'linux-island__timer-ring',
                style: 'width: 40px; height: 40px;',
                x_align: Clutter.ActorAlign.CENTER,
                y_align: Clutter.ActorAlign.CENTER,
            });
            this._ringArea.connect('repaint', area => {
                const cr = area.get_context();
                const node = area.get_theme_node();
                const fill = node.get_foreground_color();
                const track = node.get_border_color(St.Side.TOP);
                const color = c => cr.setSourceRGBA(c.red / 255, c.green / 255, c.blue / 255, c.alpha / 255);
                cr.setLineWidth(3.5);
                color(track); cr.arc(20, 20, 17, 0, 2 * Math.PI); cr.stroke();
                if (this._ringProgress > 0) {
                    color(fill); cr.arc(20, 20, 17, -Math.PI / 2, -Math.PI / 2 + 2 * Math.PI * this._ringProgress); cr.stroke();
                }
                cr.$dispose();
            });
            this._ringArea.connect('style-changed', () => this._ringArea?.queue_repaint());
            if (typeof Clutter.BinLayout === 'function') {
                const ringWrap = new St.Widget({
                    layout_manager: new Clutter.BinLayout(),
                    style: 'width: 40px; height: 40px;',
                    y_align: Clutter.ActorAlign.CENTER,
                });
                ringWrap.add_child(this._ringArea);
                ringWrap.add_child(this._ringPctLabel);
                this._clockRow.add_child(ringWrap);
            } else {
                this._clockRow.add_child(this._ringArea);
                this._clockRow.add_child(this._ringPctLabel);
            }
        } else {
            this._clockRow.add_child(this._ringPctLabel);
        }
        this.actor.add_child(this._clockRow);

        // Progress track.
        this._track = new St.BoxLayout({
            vertical: false,
            style: 'height: 4px;',
            style_class: 'linux-island__timer-progress-track',
            x_expand: true,
            x_align: Clutter.ActorAlign.FILL,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._fill = new St.Widget({
            style: 'height: 4px; width: 0px;',
            style_class: 'linux-island__timer-progress-fill',
            x_align: Clutter.ActorAlign.START,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._track.add_child(this._fill);
        this._track.connect('notify::allocation', () => {
            this._trackWidth = this._track.width ?? 0;
            this._renderProgress();
        });
        this.actor.add_child(this._track);

        // State-dependent controls.
        this._buttonsRow = new St.BoxLayout({
            vertical: false,
            style: 'height: 22px; spacing: 6px;',
            x_expand: true,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this.actor.add_child(this._buttonsRow);

        // Custom duration & primary emerald CTA row, idle only.
        this._customRow = new St.BoxLayout({
            vertical: false,
            style: 'height: 24px; spacing: 6px;',
            x_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
            visible: false,
        });
        this._customMinus = this._makeChip('−5', () => this._adjustCustom(-5));
        this._customRow.add_child(this._customMinus);
        this._customLabel = new St.Label({
            text: '25 min',
            style_class: 'linux-island__timer-custom',
            y_align: Clutter.ActorAlign.CENTER,
            x_align: Clutter.ActorAlign.CENTER,
        });
        this._customRow.add_child(this._customLabel);
        this._customPlus = this._makeChip('+5', () => this._adjustCustom(5));
        this._customRow.add_child(this._customPlus);
        this._customStart = new St.Button({
            label: 'Start Timer',
            style_class: 'linux-island__timer-cta',
            can_focus: true,
            x_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._customStart.connect('clicked', () => {
            this._lastPreset = this._customMin;
            this._onStart(this._selectedMode === 'pomodoro'
                ? {mode: 'pomodoro'} : {mode: 'countdown', durationMin: this._customMin});
        });
        this._customRow.add_child(this._customStart);
        this.actor.add_child(this._customRow);

        // Mode chips, idle only.
        this._modeRow = new St.BoxLayout({
            vertical: false,
            style: 'height: 22px; spacing: 6px;',
            x_expand: true,
            x_align: Clutter.ActorAlign.START,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._timerModeChip = this._makeChip('Timer', () => this._selectMode('countdown'), true);
        this._modeRow.add_child(this._timerModeChip);
        this._pomodoroModeChip = this._makeChip('Pomodoro', () => this._selectMode('pomodoro'), false);
        this._modeRow.add_child(this._pomodoroModeChip);
        this.actor.insert_child_at_index(this._modeRow, 0);

        // Session statistics, idle only.
        this._statsLabel = new St.Label({
            text: '',
            style_class: 'linux-island__timer-stats',
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
            visible: false,
        });
        if (this._statsLabel.clutter_text && typeof this._statsLabel.clutter_text.set_ellipsize === 'function') {
            this._statsLabel.clutter_text.set_ellipsize(Pango?.EllipsizeMode?.END ?? 3);
        }
        this.actor.add_child(this._statsLabel);

        this._renderButtons({state: 'idle', mode: 'countdown'});
        this._syncIdle();
    }

    _makeChip(label, onClick, active = false) {
        const chip = new St.Button({
            label,
            style_class: active
                ? 'linux-island__timer-chip linux-island__timer-chip--active'
                : 'linux-island__timer-chip',
            can_focus: true,
        });
        chip.connect('clicked', () => onClick());
        return chip;
    }

    _selectMode(mode) {
        this._selectedMode = mode;
        this._syncIdle();
    }

    _syncIdle() {
        const countdown = this._selectedMode === 'countdown';
        this._clockLabel.text = countdown ? formatClock(this._customMin * 60) : 'Ready';
        this._buttonsRow.visible = countdown;
        this._customMinus.visible = countdown;
        this._customLabel.visible = countdown;
        this._customPlus.visible = countdown;
        this._customStart.label = countdown ? 'Start Timer' : 'Start Pomodoro';
        this._setChipActive(this._timerModeChip, countdown);
        this._setChipActive(this._pomodoroModeChip, !countdown);
    }

    _adjustCustom(delta) {
        this._customMin = Math.max(CUSTOM_MIN, Math.min(CUSTOM_MAX, this._customMin + delta));
        if (this._customLabel) this._customLabel.text = `${this._customMin} min`;
        this._lastPreset = this._customMin;
        this._renderButtons({state: 'idle'});
        this._syncIdle();
    }

    _clearButtons() {
        for (const button of this._buttons) {
            try {
                this._buttonsRow.remove_child(button);
            } catch (_) {}
        }
        this._buttons = [];
    }

    _renderButtons(timer) {
        this._clearButtons();

        if (timer.state === 'idle') {
            for (const minutes of PRESETS) {
                const chip = this._makeChip(String(minutes), () => {
                    this._lastPreset = minutes;
                    this._customMin = minutes;
                    if (this._customLabel) this._customLabel.text = `${minutes} min`;
                    this._renderButtons({state: 'idle'});
                    this._syncIdle();
                }, this._lastPreset === minutes);
                this._buttonsRow.add_child(chip);
                this._buttons.push(chip);
            }
            return;
        }

        if (timer.state === 'finished') {
            // Pomodoro with auto-advance off holds here; offer the next phase.
            if (timer.mode === 'pomodoro') {
                const next = this._makeChip('Next', () => this._onControl('next'), true);
                this._buttonsRow.add_child(next);
                this._buttons.push(next);
            }
            const dismiss = this._makeChip('Dismiss', () => this._onControl('stop'));
            this._buttonsRow.add_child(dismiss);
            this._buttons.push(dismiss);
            return;
        }

        const primary = new St.Button({
            label: timer.state === 'paused' ? 'Resume' : 'Pause',
            style_class: 'linux-island__timer-cta',
            can_focus: true,
            x_expand: true,
        });
        primary.connect('clicked', () => this._onControl(timer.state === 'paused' ? 'resume' : 'pause'));
        this._buttonsRow.add_child(primary);
        this._buttons.push(primary);

        const stop = this._makeChip('Stop', () => this._onControl('stop'));
        this._buttonsRow.add_child(stop);
        this._buttons.push(stop);

        if (timer.mode === 'pomodoro') {
            const skip = this._makeChip('Skip', () => this._onControl('skip'));
            this._buttonsRow.add_child(skip);
            this._buttons.push(skip);
        }
    }

    _phaseText(timer) {
        if (timer.mode !== 'pomodoro') return '';
        if (timer.phase === 'focus') return 'Focus';
        if (timer.phase === 'break') return 'Break';
        if (timer.phase === 'long-break') return 'Long break';
        return '';
    }

    _renderProgress() {
        if (!this._fill) return;
        const timer = this._timer;
        const duration = Math.max(0, timer?.durationSec ?? 0);
        const remaining = Math.max(0, timer?.remainingSec ?? 0);
        // An idle timer has no duration; without this guard 1 - 0/1 paints a
        // full accent bar before anything has started.
        const ratio = duration > 0
            ? Math.max(0, Math.min(1, 1 - remaining / duration))
            : 0;
        this._ringProgress = ratio;
        if (this._ringPctLabel) {
            this._ringPctLabel.text = `${Math.round(ratio * 100)}%`;
        }
        this._ringArea?.queue_repaint();
        const width = Math.round(this._trackWidth * ratio);
        this._fill.style = `height: 4px; width: ${width}px;`;
    }

    setTimer(timer) {
        if (!this.actor) return;
        this._timer = timer ?? {state: 'idle', mode: 'countdown', phase: '', label: '',
            durationSec: 0, remainingSec: 0, cycle: 0, totalCycles: 4,
            completedFocus: 0, elapsedSec: 0, autoAdvance: true};

        const state = this._timer.state;
        const mode = this._timer.mode;

        this._clockLabel.text = formatClock(this._timer.remainingSec);

        const phaseText = this._phaseText(this._timer);
        this._phaseLabel.text = phaseText;
        this._phaseLabel.visible = phaseText !== '';

        // Cycle position only means something inside a pomodoro.
        const showCycle = mode === 'pomodoro' && state !== 'idle';
        this._cycleLabel.text = showCycle
            ? `${Math.min(this._timer.cycle, this._timer.totalCycles)}/${this._timer.totalCycles}`
            : '';
        this._cycleLabel.visible = showCycle;

        if (state !== this._lastState || mode !== this._lastMode) {
            this._lastState = state;
            this._lastMode = mode;
            this._renderButtons(this._timer);
        }

        const idle = state === 'idle';
        if (this._modeRow) this._modeRow.visible = idle;
        if (this._customRow) this._customRow.visible = idle;
        if (this._statsLabel) this._statsLabel.visible = idle && this._statsText() !== '';

        if (idle) this._syncIdle();
        else this._buttonsRow.visible = true;

        this._renderProgress();
    }

    setStats(stats) {
        this._stats = stats ?? null;
        if (!this.actor) return;
        if (this._statsLabel) {
            const text = this._statsText();
            this._statsLabel.text = text;
            this._statsLabel.visible = text !== '' && (this._timer?.state ?? 'idle') === 'idle';
        }
    }

    _statsText() {
        const stats = this._stats;
        if (!stats) return '';
        const focus = Number(stats.focusCompleted ?? 0);
        if (focus <= 0) return '';
        const minutes = Math.round(Number(stats.totalFocusSec ?? 0) / 60);
        return `${focus} focus · ${minutes} min`;
    }

    _setChipActive(chip, active) {
        if (!chip) return;
        const base = 'linux-island__timer-chip';
        const activeClass = 'linux-island__timer-chip--active';
        chip.style_class = active ? `${base} ${activeClass}` : base;
    }

    setWidth(w) {
        if (!this.actor) return;
        const width = Math.max(0, w);
        this.actor.width = width;
        this.actor.style = `width: ${width}px; spacing: 5px;`;
        this._trackWidth = width;
        this._renderProgress();
    }

    destroy() {
        if (this.actor) {
            try {
                this.actor.destroy();
            } catch (_) {}
        }
        this.actor = null;
        this._clockLabel = null;
        this._phaseLabel = null;
        this._cycleLabel = null;
        this._track = null;
        this._fill = null;
        this._buttonsRow = null;
        this._modeRow = null;
        this._customRow = null;
        this._statsLabel = null;
        this._buttons = [];
        this._timer = null;
        this._stats = null;
    }
}
