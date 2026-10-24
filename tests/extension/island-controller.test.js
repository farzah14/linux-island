import {IslandController} from '../../extension/lib/islandController.js';
import {GnomeDisplayAdapter} from '../../extension/lib/gnomeDisplayAdapter.js';

function expect(actual, expected, label) {
    if (actual !== expected) {
        throw new Error(`${label}: expected ${expected}, got ${actual}`);
    }
}

// Fake display adapter implementing the contract:
// constructor, read(), subscribe(callback) -> unsubscribe, destroy()
class FakeDisplayAdapter {
    constructor(initialState = false) {
        this.currentState = initialState;
        this.subscribers = new Set();
        this.destroyed = false;
        this.unsubscribeCalls = 0;
    }

    read() {
        return this.currentState;
    }

    subscribe(callback) {
        this.subscribers.add(callback);
        return () => {
            this.unsubscribeCalls++;
            this.subscribers.delete(callback);
        };
    }

    emit(nextState) {
        this.currentState = nextState;
        for (const cb of this.subscribers) {
            cb(nextState);
        }
    }

    destroy() {
        this.destroyed = true;
        this.subscribers.clear();
    }
}

// 1. Initial windowed state -> COMPACT
{
    const adapter = new FakeDisplayAdapter(false);
    let stateChanges = [];
    const controller = new IslandController({
        adapter,
        onStateChanged: s => stateChanges.push(s),
    });
    expect(controller.state, 'COMPACT', 'Initial state without fullscreen');
    expect(stateChanges.length, 0, 'No state changes on start in COMPACT');

    // 2. Fullscreen true transitions COMPACT -> HIDDEN
    adapter.emit(true);
    expect(controller.state, 'HIDDEN', 'Transition to HIDDEN on fullscreen ON');
    expect(stateChanges[stateChanges.length - 1], 'HIDDEN', 'Callback fired with HIDDEN');

    // 3. Fullscreen false transitions HIDDEN -> COMPACT
    adapter.emit(false);
    expect(controller.state, 'COMPACT', 'Transition to COMPACT on fullscreen OFF');
    expect(stateChanges[stateChanges.length - 1], 'COMPACT', 'Callback fired with COMPACT');

    // 4. Fullscreen ON overrides EXPANDED
    controller.dispatch('CLICK');
    expect(controller.state, 'EXPANDED', 'Clicked to EXPANDED');
    adapter.emit(true);
    expect(controller.state, 'HIDDEN', 'Fullscreen overrides EXPANDED to HIDDEN');

    // 5. Fullscreen OFF returns to COMPACT without replaying EXPANDED
    adapter.emit(false);
    expect(controller.state, 'COMPACT', 'Fullscreen OFF restores COMPACT, not EXPANDED');

    // 6. Fullscreen ON overrides PEEK
    controller.dispatch('PEEK_REQUEST');
    expect(controller.state, 'PEEK', 'Triggered PEEK');
    adapter.emit(true);
    expect(controller.state, 'HIDDEN', 'Fullscreen overrides PEEK to HIDDEN');
    adapter.emit(false);
    expect(controller.state, 'COMPACT', 'Fullscreen OFF restores COMPACT, not PEEK');

    // 7. Fullscreen ON overrides PREVIEW
    controller.dispatch('HOVER_ENTER');
    expect(controller.state, 'PREVIEW', 'Triggered PREVIEW');
    adapter.emit(true);
    expect(controller.state, 'HIDDEN', 'Fullscreen overrides PREVIEW to HIDDEN');
    adapter.emit(false);
    expect(controller.state, 'COMPACT', 'Fullscreen OFF restores COMPACT, not PREVIEW');

    // 8. Destroy unsubscribes and cleans up; unsubscribing prevents callbacks
    controller.destroy();
    expect(adapter.unsubscribeCalls, 1, 'Unsubscribe called on destroy');
    expect(adapter.destroyed, true, 'Adapter destroyed');
    adapter.emit(true);
    expect(controller.state, 'COMPACT', 'Controller state unchanged after destroy');
}

// 9. Initial fullscreen on startup starts in HIDDEN
{
    const adapter = new FakeDisplayAdapter(true);
    const controller = new IslandController({adapter});
    expect(controller.state, 'HIDDEN', 'Initial fullscreen starts HIDDEN');
    controller.destroy();
}

// 10. GnomeDisplayAdapter contract verification
{
    const adapter = new FakeDisplayAdapter(true);
    const controller = new IslandController({adapter});
    expect(typeof controller.setFullscreenPolicyEnabled, 'function', 'Live fullscreen preference setter');
    controller.setFullscreenPolicyEnabled(false);
    expect(controller.state, 'COMPACT', 'Disable restores compact while fullscreen');
    controller.dispatch('CLICK');
    controller.setFullscreenPolicyEnabled(true);
    expect(controller.state, 'HIDDEN', 'Enable immediately hides expanded during fullscreen');
    adapter.emit(null);
    expect(controller.state, 'HIDDEN', 'Unknown fullscreen is conservative');
    controller.setFullscreenPolicyEnabled(false);
    expect(controller.state, 'COMPACT', 'Disabled policy ignores unknown display state');
    controller.destroy();
    controller.setFullscreenPolicyEnabled(true);
    expect(controller.state, 'COMPACT', 'Destroyed controller ignores settings');
}

{
    const fakeDisplay = {
        handlers: {},
        connect(sig, cb) {
            this.handlers[sig] = cb;
            return 101;
        },
        disconnect(id) {
            this.disconnectedId = id;
        },
        get_monitor_in_fullscreen(idx) {
            return idx === 0;
        },
    };
    const fakeLayout = {
        primaryIndex: 0,
        handlers: {},
        connect(sig, cb) {
            this.handlers[sig] = cb;
            return 202;
        },
        disconnect(id) {
            this.disconnectedLayoutId = id;
        },
    };
    const fakeWorkspaceManager = {
        handlers: {},
        connect(sig, cb) {
            this.handlers[sig] = cb;
            return 303;
        },
        disconnect(id) {
            this.disconnectedWsId = id;
        },
        get_active_workspace() {
            return {
                list_windows() {
                    return [
                        {get_monitor: () => 0, is_fullscreen: () => true},
                    ];
                },
            };
        },
    };

    const gAdapter = new GnomeDisplayAdapter({
        display: fakeDisplay,
        layoutManager: fakeLayout,
        workspaceManager: fakeWorkspaceManager,
    });

    expect(gAdapter.read(), true, 'GnomeDisplayAdapter read() finds fullscreen on primary');

    let notified = false;
    const unsub = gAdapter.subscribe(val => {
        notified = val;
    });

    // Simulate display signal
    fakeDisplay.handlers['in-fullscreen-changed']();
    expect(notified, true, 'Subscriber notified on display in-fullscreen-changed');

    unsub();
    notified = false;
    fakeDisplay.handlers['in-fullscreen-changed']();
    expect(notified, false, 'Unsubscribed callback not called');

    gAdapter.destroy();
    expect(fakeDisplay.disconnectedId, 101, 'Display signal disconnected on destroy');
    expect(fakeLayout.disconnectedLayoutId, 202, 'Layout signal disconnected on destroy');
    expect(fakeWorkspaceManager.disconnectedWsId, 303, 'Workspace signal disconnected on destroy');
}

console.log('PASS: island controller, display adapter and live fullscreen preference checks');
