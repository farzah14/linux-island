import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

class Actor {
    constructor(props = {}) {
        Object.assign(this, {visible: true, width: 0, children: [], handlers: {}}, props);
        this.text = props.text ?? '';
        this.clutter_text = {set_ellipsize() {}};
        this.style_class = props.style_class ?? '';
    }
    add_child(child) { this.children.push(child); }
    remove_child(child) { this.children = this.children.filter(c => c !== child); }
    connect(name, fn) { this.handlers[name] = fn; return name; }
    destroy() { this.destroyed = true; }
}
globalThis.renderTest = {
    St: {BoxLayout: Actor, Label: Actor, Widget: Actor, Button: Actor, Icon: Actor},
    Clutter: {ActorAlign: {CENTER: 1, END: 2, START: 3, FILL: 4}},
    Pango: {EllipsizeMode: {END: 3}},
    formatClock: seconds => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`,
};

const load = source => import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const transform = source => source
    .replace(/^import .*timeFormat\.js';$/gm, 'const {formatClock} = globalThis.renderTest;')
    .replace('let St = null;', 'let St = globalThis.renderTest.St;')
    .replace('let Clutter = null;', 'let Clutter = globalThis.renderTest.Clutter;')
    .replace('let Pango = null;', 'let Pango = globalThis.renderTest.Pango;')
    .replace("&& typeof process === 'undefined'", '');

const source = await readFile(new URL('../../extension/ui/timeView.js', import.meta.url), 'utf8');
const {TimeSection} = await load(transform(source));

const idle = () => ({state: 'idle', mode: 'countdown', phase: '', label: '',
    durationSec: 0, remainingSec: 0, cycle: 0, totalCycles: 4,
    completedFocus: 0, elapsedSec: 0, autoAdvance: true});

// Idle: four presets, custom row, mode chips, no cycle badge.
{
    const starts = [];
    const section = new TimeSection({onStart: r => starts.push(r)});
    section.setTimer(idle());

    assert.deepEqual(section._buttons.map(b => b.label), ['5', '15', '25', '45']);
    assert.equal(section._modeRow.visible, true);
    assert.equal(section._customRow.visible, true);
    assert.equal(section._cycleLabel.visible, false, 'no cycle badge for a countdown');

    section._buttons[2].handlers.clicked();
    assert.deepEqual(starts[0], {mode: 'countdown', durationMin: 25});
    assert.equal(section._customLabel.text, '25 min', 'preset updates the custom value');

    section.destroy();
}

// Custom duration stepper clamps and starts the chosen value.
{
    const starts = [];
    const section = new TimeSection({onStart: r => starts.push(r)});
    section.setTimer(idle());

    section._customPlus.handlers.clicked();
    assert.equal(section._customLabel.text, '30 min');
    section._customMinus.handlers.clicked();
    assert.equal(section._customLabel.text, '25 min');

    for (let i = 0; i < 40; ++i) section._customMinus.handlers.clicked();
    assert.equal(section._customLabel.text, '1 min', 'clamps at 1 minute');
    for (let i = 0; i < 60; ++i) section._customPlus.handlers.clicked();
    assert.equal(section._customLabel.text, '180 min', 'clamps at 180 minutes');

    section._customStart.handlers.clicked();
    assert.equal(starts.at(-1).durationMin, 180);
    section.destroy();
}

// Running countdown: Pause + Stop, no mode/custom rows.
{
    const controls = [];
    const section = new TimeSection({onControl: a => controls.push(a)});
    section.setTimer({...idle(), state: 'running', durationSec: 1500, remainingSec: 1499});

    assert.deepEqual(section._buttons.map(b => b.label), ['Pause', 'Stop']);
    assert.equal(section._clockLabel.text, '24:59');
    assert.equal(section._modeRow.visible, false);
    assert.equal(section._customRow.visible, false);

    section._buttons[0].handlers.clicked();
    assert.deepEqual(controls, ['pause']);
    section.destroy();
}

// Paused and finished states.
{
    const controls = [];
    const section = new TimeSection({onControl: a => controls.push(a)});
    section.setTimer({...idle(), state: 'paused', durationSec: 1500, remainingSec: 900});
    assert.deepEqual(section._buttons.map(b => b.label), ['Resume', 'Stop']);

    section.setTimer({...idle(), state: 'finished', durationSec: 1500, remainingSec: 0});
    assert.deepEqual(section._buttons.map(b => b.label), ['Dismiss'],
        'a finished countdown only offers Dismiss');
    section.destroy();
}

// Pomodoro: phase, cycle badge, skip, and the auto-advance "Next" button.
{
    const controls = [];
    const section = new TimeSection({onControl: a => controls.push(a)});
    section.setTimer({...idle(), state: 'running', mode: 'pomodoro', phase: 'focus',
        durationSec: 1500, remainingSec: 900, cycle: 2, totalCycles: 4});

    assert.equal(section._phaseLabel.text, 'Focus');
    assert.equal(section._phaseLabel.visible, true);
    assert.equal(section._cycleLabel.text, '2/4', 'cycle position is visible');
    assert.equal(section._cycleLabel.visible, true);
    assert.deepEqual(section._buttons.map(b => b.label), ['Pause', 'Stop', 'Skip']);

    section._buttons[2].handlers.clicked();
    assert.deepEqual(controls, ['skip']);

    section.setTimer({...idle(), state: 'finished', mode: 'pomodoro', phase: 'focus',
        durationSec: 1500, remainingSec: 0, cycle: 2, totalCycles: 4});
    assert.deepEqual(section._buttons.map(b => b.label), ['Next', 'Dismiss'],
        'auto-advance off offers the next phase');
    section._buttons[0].handlers.clicked();
    assert.equal(controls.at(-1), 'next');
    section.destroy();
}

// Long break phase label.
{
    const section = new TimeSection({});
    section.setTimer({...idle(), state: 'running', mode: 'pomodoro', phase: 'long-break',
        durationSec: 900, remainingSec: 600, cycle: 4, totalCycles: 4});
    assert.equal(section._phaseLabel.text, 'Long break');
    assert.equal(section._cycleLabel.text, '4/4');
    section.destroy();
}

// Statistics show only when idle and only once something has completed.
{
    const section = new TimeSection({});
    section.setTimer(idle());
    assert.equal(section._statsLabel.visible, false, 'no stats before any focus');

    section.setStats({focusCompleted: 3, totalFocusSec: 4500, sessionsStarted: 2});
    assert.equal(section._statsLabel.visible, true);
    assert.equal(section._statsLabel.text, '3 focus · 75 min');

    section.setTimer({...idle(), state: 'running', durationSec: 1500, remainingSec: 100});
    assert.equal(section._statsLabel.visible, false, 'stats hide while a timer runs');
    section.destroy();
}

// Ticks must update labels without rebuilding the button actors.
{
    const section = new TimeSection({});
    section.setTimer({...idle(), state: 'running', durationSec: 1500, remainingSec: 1499});
    const first = section._buttons[0];
    section.setTimer({...idle(), state: 'running', durationSec: 1500, remainingSec: 1498});
    assert.equal(section._buttons[0], first, 'tick reuses the same actors');
    assert.equal(section._clockLabel.text, '24:58');
    section.destroy();
}

// Width updates the progress fill.
{
    const section = new TimeSection({});
    section.setTimer({...idle(), state: 'running', durationSec: 100, remainingSec: 50});
    section.setWidth(300);
    assert.equal(section.actor.width, 300);
    assert.match(section._fill.style, /width: 150px/, 'half of 300, no phantom padding');
    section.destroy();
    assert.equal(section.actor, null);
}

// Idle has no duration, so the progress bar must stay empty instead of
// painting a full accent bar before a timer starts.
{
    const section = new TimeSection({});
    section.setTimer(idle());
    section.setWidth(300);
    assert.match(section._fill.style, /width: 0px/, 'idle renders an empty track');
    section.destroy();
}

console.log('PASS: timer-view presets, custom duration, phases and stats');
