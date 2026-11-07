// Locale-independent time formatting shared by the GNOME extension and (as a
// hand-written mirror) the Qt overlay. Node and GJS differ in ICU data, so the
// strings are assembled by hand from getHours()/getMinutes()/getDay().
// Pure ESM: no GI imports.

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function pad2(n) {
    return String(n).padStart(2, '0');
}

export function formatClock(seconds) {
    const total = Math.max(0, Math.floor(Number(seconds) || 0));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    if (h > 0) {
        return `${h}:${pad2(m)}:${pad2(s)}`;
    }
    return `${m}:${pad2(s)}`;
}

export function isTimerActive(timer) {
    return !!timer && (timer.state === 'running' || timer.state === 'paused' || timer.state === 'finished');
}

export function formatTimerCompact(timer) {
    if (!timer) return '';
    if (timer.state === 'finished') return "Time's up";
    const clock = formatClock(timer.remainingSec);
    if (timer.mode === 'pomodoro') {
        if (timer.phase === 'break') return `Break ${clock}`;
        if (timer.phase === 'long-break') return `Long break ${clock}`;
        return `Focus ${clock}`;
    }
    return timer.label ? `${clock} · ${timer.label}` : clock;
}

function startOfDay(ms) {
    const d = new Date(ms);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

export function formatEventTime(startMs, endMs, nowMs = Date.now()) {
    const start = Number(startMs);
    const end = Number(endMs);
    const now = Number(nowMs);
    if (!Number.isFinite(start) || start <= 0) return '';

    if (start <= now && now < end) return 'Now';

    // Anything inside the next hour is more useful as a countdown than as a
    // clock time: "Standup in 12m", not "Standup 14:12".
    const delta = start - now;
    if (delta < 3600000) {
        return `in ${Math.max(1, Math.ceil(delta / 60000))}m`;
    }

    const d = new Date(start);
    const clock = `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
    const dayDiff = Math.round((startOfDay(start) - startOfDay(now)) / 86400000);
    if (dayDiff === 0) return clock;
    if (dayDiff === 1) return `Tomorrow ${clock}`;
    return `${WEEKDAYS[d.getDay()]} ${clock}`;
}
