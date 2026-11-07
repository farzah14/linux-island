import {reconcileTimeState, TimeProxy, IDLE_TIMER} from '../../extension/lib/timeProxy.js';

function expect(actual, expected, label) {
    if (actual !== expected) {
        throw new Error(`${label}: expected ${expected}, got ${actual}`);
    }
}

function baseState() {
    return {
        connected: true,
        owner: ':1.20',
        timerRevision: 4,
        timer: {state: 'running', mode: 'countdown', phase: '', label: 'tea',
            durationSec: 300, remainingSec: 120, cycle: 0},
        stats: {sessionsStarted: 1, focusCompleted: 0, breaksCompleted: 0,
            totalFocusSec: 0, longestFocusSec: 0},
        timerServiceAvailable: true,
    };
}

// 1. OWNER_CHANGED with a null owner resets timer and calendar but keeps the shape.
{
    const reset = reconcileTimeState(baseState(), {type: 'OWNER_CHANGED', nameOwner: null});
    expect(reset.connected, false, 'Disconnected on owner loss');
    expect(reset.owner, null, 'Owner cleared');
    expect(reset.timerRevision, 0, 'Timer revision reset');
    expect(reset.timer.state, 'idle', 'Timer reset to idle');
    expect(reset.stats, null, 'Stats cleared');
    expect(reset.timerServiceAvailable, false, 'Timer service marked unavailable');

    const unchanged = reconcileTimeState(baseState(), {type: 'OWNER_CHANGED', nameOwner: ':1.20'});
    expect(unchanged.timerRevision, 4, 'A live owner does not reset state');
}

// 2. Stale revisions are rejected for the same owner.
{
    const stale = reconcileTimeState(baseState(), {
        type: 'TIMER_CHANGED', owner: ':1.20', revision: 3,
        timer: {state: 'paused', remainingSec: 60},
    });
    expect(stale.timerRevision, 4, 'Stale timer revision rejected');
    expect(stale.timer.remainingSec, 120, 'Stale timer payload rejected');

    const duplicate = reconcileTimeState(baseState(), {
        type: 'TIMER_CHANGED', owner: ':1.20', revision: 4,
        timer: {state: 'paused', remainingSec: 60},
    });
    expect(duplicate.timer.state, 'running', 'Equal revision rejected');

    const newer = reconcileTimeState(baseState(), {
        type: 'TIMER_CHANGED', owner: ':1.20', revision: 5,
        timer: {state: 'paused', remainingSec: 60},
    });
    expect(newer.timerRevision, 5, 'Newer timer revision accepted');
    expect(newer.timer.state, 'paused', 'Newer timer payload accepted');
    expect(newer.timer.mode, 'countdown', 'Missing fields fall back to idle defaults');
}

// 3. A new owner accepts timer revision 0.
{
    const reset = reconcileTimeState(baseState(), {type: 'OWNER_CHANGED', nameOwner: null});
    const adopted = reconcileTimeState(reset, {
        type: 'TIMER_CHANGED', owner: ':1.21', revision: 0,
        timer: {state: 'running', mode: 'countdown', remainingSec: 30},
    });
    expect(adopted.timerRevision, 0, 'New owner revision 0 accepted');
    expect(adopted.timer.remainingSec, 30, 'New owner timer adopted');
}

// 5. TimeProxy lifecycle without a proxy.
{
    let updates = 0;
    const proxy = new TimeProxy({onStateChanged: () => { updates++; }});
    expect(proxy.state.connected, false, 'Initially disconnected');
    expect(proxy.state.timer.state, 'idle', 'Timer starts idle');
    expect(proxy.state.timerServiceAvailable, false, 'Timer service starts unavailable');
    expect(typeof proxy.destroy, 'function', 'destroy method exists');
    proxy.destroy();
    expect(proxy.isDestroyed, true, 'Proxy marked destroyed');
    expect(updates, 0, 'No callbacks after destroy');
}

// 6. onTimerFinished fires exactly once on running -> finished, never on the snapshot.
{
    let finished = 0;
    let phases = 0;
    const proxy = new TimeProxy({
        onTimerFinished: () => { finished++; },
        onPhaseChanged: () => { phases++; },
    });
    proxy._state.owner = ':1.30';

    proxy._setState(reconcileTimeState(proxy.state, {
        type: 'TIMER_CHANGED', owner: ':1.30', revision: 1,
        timer: {state: 'running', mode: 'countdown', remainingSec: 10},
    }));
    expect(finished, 0, 'Initial snapshot does not fire onTimerFinished');

    proxy._setState(reconcileTimeState(proxy.state, {
        type: 'TIMER_CHANGED', owner: ':1.30', revision: 2,
        timer: {state: 'finished', mode: 'countdown', remainingSec: 0},
    }));
    expect(finished, 1, 'running -> finished fires once');

    // The 60 s hold returns to idle; that must not fire again.
    proxy._setState(reconcileTimeState(proxy.state, {
        type: 'TIMER_CHANGED', owner: ':1.30', revision: 3,
        timer: {state: 'idle', mode: 'countdown', remainingSec: 0},
    }));
    expect(finished, 1, 'finished -> idle does not re-fire');

    proxy._setState(reconcileTimeState(proxy.state, {
        type: 'TIMER_CHANGED', owner: ':1.30', revision: 4,
        timer: {state: 'finished', mode: 'countdown', remainingSec: 0},
    }));
    expect(finished, 2, 'A later finish fires again');
    proxy.destroy();
}

// 7. onPhaseChanged only between two non-empty pomodoro phases.
{
    let phases = 0;
    const proxy = new TimeProxy({onPhaseChanged: () => { phases++; }});
    proxy._state.owner = ':1.40';

    proxy._setState(reconcileTimeState(proxy.state, {
        type: 'TIMER_CHANGED', owner: ':1.40', revision: 1,
        timer: {state: 'running', mode: 'pomodoro', phase: 'focus', remainingSec: 60},
    }));
    expect(phases, 0, 'Initial phase does not fire');

    proxy._setState(reconcileTimeState(proxy.state, {
        type: 'TIMER_CHANGED', owner: ':1.40', revision: 2,
        timer: {state: 'running', mode: 'pomodoro', phase: 'break', remainingSec: 30},
    }));
    expect(phases, 1, 'focus -> break fires');

    proxy._setState(reconcileTimeState(proxy.state, {
        type: 'TIMER_CHANGED', owner: ':1.40', revision: 3,
        timer: {state: 'idle', mode: 'countdown', phase: '', remainingSec: 0},
    }));
    expect(phases, 1, 'Leaving pomodoro does not fire');
    proxy.destroy();
}

// 8. Proxy callbacks drive state, and invokables degrade without a live owner.
{
    const calls = [];
    const proxy = new TimeProxy({
        gio: {
            DBusCallFlags: {NONE: 0},
            BusType: {SESSION: 1},
            DBusProxyFlags: {NONE: 0},
        },
        glib: {
            Variant: class {
                constructor(sig, values) { this.sig = sig; this.values = values; }
            },
        },
    });

    proxy._proxy = {
        g_name_owner: ':1.50',
        call(method, params, flags, timeout, cancellable, callback) {
            calls.push({method, params});
            if (method === 'GetTimer') {
                callback(this, {
                    deepUnpack: () => [{
                        state: 'running', mode: 'countdown', phase: '', label: '',
                        durationSec: 300, remainingSec: 299, cycle: 0, revision: 9,
                    }],
                });
            } else if (method === 'GetTimerStats') {
                callback(this, {
                    deepUnpack: () => [{sessionsStarted: 3, focusCompleted: 2,
                        breaksCompleted: 1, totalFocusSec: 3000, longestFocusSec: 1500}],
                });
            } else {
                callback(this, {deepUnpack: () => [true]});
            }
        },
        call_finish(res) { return res; },
    };
    proxy._state.owner = ':1.50';

    proxy._fetchTimer();
    expect(proxy.state.timerServiceAvailable, true, 'GetTimer reply marks the service available');
    expect(proxy.state.timer.remainingSec, 299, 'GetTimer payload applied');
    expect(proxy.state.timerRevision, 9, 'GetTimer revision adopted');

    proxy._fetchStats();
    expect(proxy.state.stats.focusCompleted, 2, 'GetTimerStats adopted');

    const started = await proxy.startTimer({mode: 'countdown', durationMin: 25});
    expect(started, true, 'startTimer resolves true');
    const startCall = calls.find(c => c.method === 'StartTimer');
    expect(Boolean(startCall), true, 'StartTimer was called');
    expect(startCall.params.sig, '(a{sv})', 'StartTimer sends an a{sv} dict');

    const paused = await proxy.controlTimer('pause');
    expect(paused, true, 'controlTimer resolves true');
    const controlCall = calls.find(c => c.method === 'ControlTimer');
    expect(controlCall.params.sig, '(s)', 'ControlTimer sends a string');

    const refreshed = await proxy.fetchStats();
    expect(refreshed, true, 'fetchStats resolves true');

    proxy.destroy();
    expect(await proxy.startTimer({mode: 'countdown'}), false, 'Destroyed proxy rejects startTimer');
    expect(await proxy.controlTimer('pause'), false, 'Destroyed proxy rejects controlTimer');
    expect(await proxy.fetchStats(), false, 'Destroyed proxy still resolves (no-op)');
}

// 9. TimerChanged signals update state and honour revisions.
{
    const proxy = new TimeProxy({});
    proxy._state = {...baseState(), timerServiceAvailable: true};

    proxy._onSignal('TimerChanged', [5, {state: 'paused', mode: 'countdown', remainingSec: 42, revision: 5}]);
    expect(proxy.state.timerRevision, 5, 'Signal revision applied');
    expect(proxy.state.timer.state, 'paused', 'Signal payload applied');

    proxy._onSignal('TimerChanged', [4, {state: 'running', remainingSec: 1, revision: 4}]);
    expect(proxy.state.timer.state, 'paused', 'Stale signal ignored');

    proxy.destroy();
}

// 10. Under GJS the proxy builds real GLib.Variant payloads.
if (typeof process === 'undefined') {
    const gi = await import('gi://Gio');
    const gjsGio = gi.default ?? gi;
    let startParams = null;
    let controlParams = null;
    const proxy = new TimeProxy({gio: gjsGio});
    proxy._proxy = {
        g_name_owner: ':1.60',
        call(method, params, flags, timeout, cancellable, callback) {
            if (method === 'StartTimer') startParams = params;
            if (method === 'ControlTimer') controlParams = params;
            callback(this, {});
        },
        call_finish() { return {deepUnpack: () => [true]}; },
    };
    proxy._state.owner = ':1.60';

    await proxy.startTimer({mode: 'countdown', durationMin: 25, label: 'tea'});
    expect(Boolean(startParams), true, 'StartTimer called with a real variant');
    const [request] = startParams.deepUnpack();
    expect(request.mode.deepUnpack(), 'countdown', 'Mode encoded as a string');
    expect(request.durationMin.deepUnpack(), 25, 'Duration encoded as an integer');

    await proxy.controlTimer('pause');
    expect(Boolean(controlParams), true, 'ControlTimer called with a real variant');
    const [action] = controlParams.deepUnpack();
    expect(action, 'pause', 'Action encoded as a string');
    proxy.destroy();
}

console.log('PASS: 30 time-proxy and reconciler tests');
