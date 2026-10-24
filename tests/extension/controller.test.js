import {IslandController} from '../../extension/lib/islandController.js';

function expect(actual, expected, label) {
    if (actual !== expected) {
        throw new Error(`${label}: expected ${expected}, got ${actual}`);
    }
}

class FakeScheduler {
    constructor() {
        this.timers = new Map();
        this.nextId = 1;
    }

    setTimeout(fn, ms) {
        const id = this.nextId++;
        this.timers.set(id, {fn, ms});
        return id;
    }

    clearTimeout(id) {
        this.timers.delete(id);
    }

    advance(ms) {
        const toRun = [];
        for (const [id, timer] of this.timers.entries()) {
            timer.ms -= ms;
            if (timer.ms <= 0) {
                toRun.push({id, fn: timer.fn});
            }
        }
        for (const {id, fn} of toRun) {
            this.timers.delete(id);
            fn();
        }
    }

    get activeCount() {
        return this.timers.size;
    }
}

// 1. Initial state and transitions
{
    const scheduler = new FakeScheduler();
    const controller = new IslandController({
        scheduler,
    });

    expect(controller.getState(), 'COMPACT', 'Initial state is COMPACT');

    // Rapid hover in / out
    controller.dispatch('HOVER_ENTER');
    expect(controller.getState(), 'PREVIEW', 'Hover enter gives PREVIEW');
    controller.dispatch('HOVER_LEAVE');
    expect(controller.getState(), 'COMPACT', 'Hover leave restores COMPACT');

    // Click to EXPANDED
    controller.dispatch('CLICK');
    expect(controller.getState(), 'EXPANDED', 'Click gives EXPANDED');

    // Notification PEEK_REQUEST while EXPANDED remains EXPANDED
    controller.dispatch('PEEK_REQUEST');
    expect(controller.getState(), 'EXPANDED', 'PEEK_REQUEST while EXPANDED remains EXPANDED');

    // FULLSCREEN_ON while EXPANDED overrides to HIDDEN
    controller.dispatch('FULLSCREEN_ON');
    expect(controller.getState(), 'HIDDEN', 'FULLSCREEN_ON overrides EXPANDED to HIDDEN');

    // FULLSCREEN_OFF restores COMPACT
    controller.dispatch('FULLSCREEN_OFF');
    expect(controller.getState(), 'COMPACT', 'FULLSCREEN_OFF restores COMPACT');

    controller.destroy();
}

// 2. PEEK timer and timeout
{
    const scheduler = new FakeScheduler();
    const controller = new IslandController({
        scheduler,
        peekDurationMs: 4000,
    });

    controller.dispatch('PEEK_REQUEST');
    expect(controller.getState(), 'PEEK', 'PEEK_REQUEST transitions to PEEK');
    expect(scheduler.activeCount, 1, 'PEEK timeout timer scheduled');

    // Mouse click during PEEK remains PEEK
    controller.dispatch('CLICK');
    expect(controller.getState(), 'PEEK', 'Click during PEEK remains PEEK in v0.1');

    // Advance time past 4000ms -> PEEK_TIMEOUT restores COMPACT
    scheduler.advance(4000);
    expect(controller.getState(), 'COMPACT', 'PEEK timeout restores COMPACT');
    expect(scheduler.activeCount, 0, 'No active timers after timeout');

    controller.destroy();
}

// 3. FULLSCREEN_ON during PEEK cancels peek timer and hides
{
    const scheduler = new FakeScheduler();
    const controller = new IslandController({
        scheduler,
        peekDurationMs: 4000,
    });

    controller.dispatch('PEEK_REQUEST');
    expect(controller.getState(), 'PEEK', 'In PEEK state');
    expect(scheduler.activeCount, 1, 'Timer active');

    // Fullscreen turns on mid-peek
    controller.dispatch('FULLSCREEN_ON');
    expect(controller.getState(), 'HIDDEN', 'Fullscreen hides during PEEK');
    expect(scheduler.activeCount, 0, 'Peek timer cancelled on fullscreen hide');

    // Advancing time does nothing
    scheduler.advance(5000);
    expect(controller.getState(), 'HIDDEN', 'Still HIDDEN after past peek time');

    controller.dispatch('FULLSCREEN_OFF');
    expect(controller.getState(), 'COMPACT', 'Fullscreen off restores COMPACT');

    controller.destroy();
}

// 4. Destroy cancels pending timers and callbacks
{
    const scheduler = new FakeScheduler();
    let updates = [];
    const controller = new IslandController({
        scheduler,
        peekDurationMs: 4000,
        onStateChanged: s => updates.push(s),
    });

    controller.dispatch('PEEK_REQUEST');
    expect(scheduler.activeCount, 1, 'Timer active before destroy');

    controller.destroy();
    expect(scheduler.activeCount, 0, 'Timer cleared on destroy');

    // Events after destroy ignored
    controller.dispatch('CLICK');
    expect(controller.getState(), 'PEEK', 'State frozen after destroy');
}

console.log('PASS: 20 island controller state and timer tests');
