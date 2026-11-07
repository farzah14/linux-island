// Display-mode policy for the GNOME extension.
//
// `displayMode` is stored by the Core and offered in the Settings app as
// dynamic | floating | integrated. Until now the extension ignored it, so a
// GNOME user choosing "Floating Overlay" silently fell through to the Qt
// overlay over XWayland. This module is the single place that decides what the
// extension does with the setting, kept free of GNOME imports so it can run
// under Node.

export const DISPLAY_MODES = Object.freeze(['dynamic', 'floating', 'integrated']);

/**
 * Normalise an arbitrary settings value into a supported display mode.
 * Unknown or missing values fall back to `dynamic`, matching the Core default.
 */
export function normalizeDisplayMode(value) {
    if (typeof value !== 'string') return 'dynamic';
    const mode = value.trim().toLowerCase();
    return DISPLAY_MODES.includes(mode) ? mode : 'dynamic';
}

/**
 * The extension can render two of the three modes. `integrated` needs a real
 * top-panel button that does not exist yet, so it keeps the dynamic placement
 * rather than silently pretending to be integrated.
 */
export function extensionModeFor(displayMode) {
    const mode = normalizeDisplayMode(displayMode);
    return mode === 'floating' ? 'floating' : 'dynamic';
}

/**
 * Whether the capsule sits inside the top panel's reserved strip (dynamic) or
 * floats over window content (floating). Floating clears the panel so the
 * capsule is not clipped by the panel's strut.
 */
export function isFloating(displayMode) {
    return extensionModeFor(displayMode) === 'floating';
}

/**
 * Compute the capsule origin for a monitor.
 *
 * @param {Object} options
 * @param {{x:number,y:number,width:number,height:number}} options.monitor
 * @param {number} options.width - capsule width
 * @param {number} options.verticalOffset - user offset from the top edge
 * @param {number} options.horizontalOffset - user offset from centre
 * @param {boolean} options.floating - floating mode vs top-bar mode
 * @param {number} [options.panelHeight=0] - panel strut height in floating mode
 * @param {number} [options.workAreaY] - top of the work area, when known
 * @returns {{x:number,y:number}}
 */
export function capsuleOrigin({
    monitor,
    width,
    verticalOffset = 0,
    horizontalOffset = 0,
    floating = false,
    panelHeight = 0,
    workAreaY,
}) {
    if (!monitor) return {x: 0, y: 0};

    const safeWidth = Math.max(0, Number(width) || 0);
    const safeXOffset = Number.isFinite(horizontalOffset) ? Math.round(horizontalOffset) : 0;
    const safeYOffset = Number.isFinite(verticalOffset) ? Math.round(verticalOffset) : 0;
    const x = Math.round(monitor.x + (monitor.width - safeWidth) / 2) + safeXOffset;

    // Dynamic mode hugs the panel edge. Floating mode starts below the panel so
    // the capsule is fully visible over window content, and uses the work area
    // when the compositor reports one (multi-monitor panels differ in height).
    let baseY = monitor.y;
    if (floating) {
        const panel = Math.max(0, Number(panelHeight) || 0);
        if (typeof workAreaY === 'number' && Number.isFinite(workAreaY)) {
            // The work area already includes the panel strut; clamp it to this
            // monitor so a stale value from another monitor cannot fling the
            // capsule off the bottom of the screen.
            const bottom = Number.isFinite(monitor.height) ? monitor.y + monitor.height : workAreaY;
            baseY = Math.min(Math.max(monitor.y, workAreaY), bottom);
        } else {
            baseY = monitor.y + panel;
        }
    }

    return {x, y: Math.round(baseY) + safeYOffset};
}

/**
 * Clamp the capsule so it cannot drift off-screen when the user offset or a
 * monitor change would push it past an edge.
 */
export function clampToMonitor({x, y, width, height, monitor}) {
    if (!monitor) return {x, y};

    const finite = value => typeof value === 'number' && Number.isFinite(value);
    // A monitor without a reported extent cannot constrain that axis; leaving
    // the coordinate alone is safer than clamping it to NaN.
    const clampAxis = (value, origin, extent, size) => {
        if (!finite(value)) return finite(origin) ? origin : 0;
        if (!finite(origin) || !finite(extent) || !finite(size)) return value;
        const max = origin + Math.max(0, extent - size);
        return Math.min(Math.max(value, origin), max);
    };

    return {
        x: clampAxis(x, monitor.x, monitor.width, width),
        y: clampAxis(y, monitor.y, monitor.height, height),
    };
}
