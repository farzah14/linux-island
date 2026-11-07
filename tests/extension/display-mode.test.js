import {normalizeDisplayMode, extensionModeFor, isFloating, capsuleOrigin, clampToMonitor,
    DISPLAY_MODES} from '../../extension/lib/displayMode.js';

function expect(actual, expected, label) {
    const a = JSON.stringify(actual);
    const e = JSON.stringify(expected);
    if (a !== e) throw new Error(`${label}: expected ${e}, got ${a}`);
}

// 1. Normalisation never yields an unsupported mode.
expect(DISPLAY_MODES, ['dynamic', 'floating', 'integrated'], 'supported modes');
expect(normalizeDisplayMode('floating'), 'floating', 'floating preserved');
expect(normalizeDisplayMode('  FLOATING  '), 'floating', 'trimmed and case-folded');
expect(normalizeDisplayMode('integrated'), 'integrated', 'integrated preserved');
expect(normalizeDisplayMode('dynamic'), 'dynamic', 'dynamic preserved');
expect(normalizeDisplayMode('nonsense'), 'dynamic', 'unknown falls back to dynamic');
expect(normalizeDisplayMode(undefined), 'dynamic', 'missing falls back to dynamic');
expect(normalizeDisplayMode(null), 'dynamic', 'null falls back to dynamic');
expect(normalizeDisplayMode(42), 'dynamic', 'non-string falls back to dynamic');

// 2. The extension renders floating, and treats integrated as dynamic.
expect(extensionModeFor('floating'), 'floating', 'floating rendered by extension');
expect(extensionModeFor('dynamic'), 'dynamic', 'dynamic rendered by extension');
expect(extensionModeFor('integrated'), 'dynamic', 'integrated degrades to dynamic');
expect(extensionModeFor('bogus'), 'dynamic', 'unknown degrades to dynamic');

expect(isFloating('floating'), true, 'floating is floating');
expect(isFloating('dynamic'), false, 'dynamic is not floating');
expect(isFloating('integrated'), false, 'integrated is not floating');

// 3. Origin math.
const monitor = {x: 0, y: 0, width: 1920, height: 1080};

expect(capsuleOrigin({monitor, width: 200, verticalOffset: 8}), {x: 860, y: 8},
    'dynamic hugs the panel edge');
expect(capsuleOrigin({monitor, width: 200, verticalOffset: 8, floating: true, panelHeight: 32}),
    {x: 860, y: 40}, 'floating clears the panel strut');
expect(capsuleOrigin({monitor, width: 200, verticalOffset: 8, floating: true,
    panelHeight: 32, workAreaY: 48}), {x: 860, y: 56},
    'floating prefers the reported work area');
expect(capsuleOrigin({monitor, width: 200, horizontalOffset: 40}), {x: 900, y: 0},
    'horizontal offset shifts from centre');
expect(capsuleOrigin({monitor, width: 200, horizontalOffset: -40}), {x: 820, y: 0},
    'negative horizontal offset shifts left');

// Off-origin monitor: a second screen to the right must not reuse screen 0 coords.
const right = {x: 1920, y: 0, width: 1280, height: 1024};
expect(capsuleOrigin({monitor: right, width: 200, verticalOffset: 8}), {x: 2460, y: 8},
    'monitor origin is respected');
expect(capsuleOrigin({monitor: right, width: 200, floating: true, workAreaY: 0}),
    {x: 2460, y: 0}, 'workAreaY below monitor.y is clamped to the monitor');
expect(capsuleOrigin({monitor: right, width: 200, floating: true, workAreaY: 1920}),
    {x: 2460, y: 1024}, 'workAreaY past the monitor bottom is clamped to it');
expect(capsuleOrigin({monitor: right, width: 200, floating: true, workAreaY: -50}),
    {x: 2460, y: 0}, 'negative workAreaY clamps to the monitor top');

// Degenerate inputs stay safe.
expect(capsuleOrigin({monitor: null, width: 100}), {x: 0, y: 0}, 'no monitor is a no-op');
expect(capsuleOrigin({monitor, width: 0}), {x: 960, y: 0}, 'zero width centres');
expect(capsuleOrigin({monitor, width: NaN}), {x: 960, y: 0}, 'NaN width centres');
expect(capsuleOrigin({monitor, width: 200, verticalOffset: NaN}), {x: 860, y: 0},
    'NaN offset is treated as zero');

// 4. Clamping keeps the capsule on screen.
expect(clampToMonitor({x: 900, y: 10, width: 200, height: 40, monitor}),
    {x: 900, y: 10}, 'in-bounds position untouched');
expect(clampToMonitor({x: 5000, y: 10, width: 200, height: 40, monitor}),
    {x: 1720, y: 10}, 'right edge clamped');
expect(clampToMonitor({x: -500, y: 10, width: 200, height: 40, monitor}),
    {x: 0, y: 10}, 'left edge clamped');
expect(clampToMonitor({x: 900, y: 5000, width: 200, height: 40, monitor}),
    {x: 900, y: 1040}, 'bottom edge clamped');
expect(clampToMonitor({x: 900, y: -80, width: 200, height: 40, monitor}),
    {x: 900, y: 0}, 'top edge clamped');
expect(clampToMonitor({x: 5000, y: 10, width: 4000, height: 40, monitor}),
    {x: 0, y: 10}, 'oversized capsule pins to origin instead of going negative');
expect(clampToMonitor({x: 900, y: 10, width: 200, height: 40, monitor: null}),
    {x: 900, y: 10}, 'no monitor leaves the point alone');

console.log('PASS: displayMode policy and origin math');
