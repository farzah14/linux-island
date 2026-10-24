// Pure UI reducer: no GNOME Shell APIs, side effects or IPC.
export const UI_STATES = Object.freeze(['HIDDEN', 'COMPACT', 'PREVIEW', 'EXPANDED', 'PEEK']);
const validStates = new Set(UI_STATES);

export function transition(current, event) {
    if (!validStates.has(current))
        throw new Error(`Invalid UI state: ${current}`);

    // Fullscreen is a hard visibility policy. PEEK never bypasses it.
    if (event === 'FULLSCREEN_ON')
        return 'HIDDEN';
    if (current === 'HIDDEN')
        return event === 'FULLSCREEN_OFF' ? 'COMPACT' : 'HIDDEN';

    if (event === 'CLICK' && (current === 'COMPACT' || current === 'PREVIEW'))
        return 'EXPANDED';
    if (event === 'DISMISS' && current === 'EXPANDED')
        return 'COMPACT';
    if (event === 'HOVER_ENTER' && current === 'COMPACT')
        return 'PREVIEW';
    if (event === 'HOVER_LEAVE' && current === 'PREVIEW')
        return 'COMPACT';
    if (event === 'PEEK_REQUEST' && current === 'COMPACT')
        return 'PEEK';
    if (event === 'PEEK_TIMEOUT' && current === 'PEEK')
        return 'COMPACT';
    return current;
}
