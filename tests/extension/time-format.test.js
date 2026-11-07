import {formatClock, formatTimerCompact, formatEventTime, isTimerActive}
    from '../../extension/lib/timeFormat.js';

function expect(actual, expected, label) {
    if (actual !== expected) {
        throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    }
}

// formatClock
expect(formatClock(0), '0:00', 'zero');
expect(formatClock(7), '0:07', 'single digit seconds');
expect(formatClock(59), '0:59', 'under a minute');
expect(formatClock(1499), '24:59', 'minutes with no leading zero');
expect(formatClock(3900), '1:05:00', 'hours');
expect(formatClock(3661), '1:01:01', 'hour boundary');
expect(formatClock(-5), '0:00', 'negative clamps');

// isTimerActive
expect(isTimerActive(null), false, 'null timer');
expect(isTimerActive({state: 'idle'}), false, 'idle');
expect(isTimerActive({state: 'running'}), true, 'running');
expect(isTimerActive({state: 'paused'}), true, 'paused');
expect(isTimerActive({state: 'finished'}), true, 'finished');

// formatTimerCompact
expect(formatTimerCompact({state: 'finished', mode: 'countdown', remainingSec: 0}), "Time's up", 'finished');
expect(formatTimerCompact({state: 'running', mode: 'countdown', remainingSec: 1499, label: ''}), '24:59', 'countdown');
expect(formatTimerCompact({state: 'running', mode: 'countdown', remainingSec: 1499, label: 'tea'}), '24:59 · tea', 'countdown with label');
expect(formatTimerCompact({state: 'running', mode: 'pomodoro', phase: 'focus', remainingSec: 60}), 'Focus 1:00', 'focus');
expect(formatTimerCompact({state: 'running', mode: 'pomodoro', phase: 'break', remainingSec: 300}), 'Break 5:00', 'break');
expect(formatTimerCompact({state: 'running', mode: 'pomodoro', phase: 'long-break', remainingSec: 900}), 'Long break 15:00', 'long break');

// formatEventTime — build fixtures from local dates so the test is TZ independent.
const now = new Date(2026, 2, 1, 14, 0, 0).getTime();
const at = (day, h, m) => new Date(2026, 2, day, h, m, 0).getTime();

expect(formatEventTime(at(1, 13, 30), at(1, 14, 30), now), 'Now', 'in progress');
expect(formatEventTime(at(1, 14, 0), at(1, 15, 0), now), 'Now', 'starting exactly now');
expect(formatEventTime(now + 30000, now + 900000, now), 'in 1m', 'under a minute rounds up');
expect(formatEventTime(now + 12 * 60000, now + 42 * 60000, now), 'in 12m', 'twelve minutes away');
expect(formatEventTime(now + 59 * 60000, now + 90 * 60000, now), 'in 59m', '59 minutes away');
expect(formatEventTime(now + 60000, now + 900000, now), 'in 1m', 'one minute away');
expect(formatEventTime(at(1, 16, 30), at(1, 17, 0), now), '16:30', 'later today');
expect(formatEventTime(at(2, 9, 0), at(2, 9, 30), now), 'Tomorrow 09:00', 'tomorrow');
expect(formatEventTime(at(5, 9, 0), at(5, 9, 30), now), 'Thu 09:00', 'weekday fallback');
expect(formatEventTime(at(8, 9, 5), at(8, 9, 30), now), 'Sun 09:05', 'weekday padding');
expect(formatEventTime(0, 0, now), '', 'no event');

console.log('PASS: 28 time-format tests');
