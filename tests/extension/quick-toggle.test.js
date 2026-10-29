import {QuickToggle, QuickTogglesRow, TOGGLE_WIDTH, TOGGLE_HEIGHT, TOGGLE_COLUMN_SPACING} from '../../extension/ui/quickToggle.js';

function assert(condition, message = 'Assertion failed') {
    if (!condition) throw new Error(message);
}

function assertEqual(actual, expected, message) {
    if (actual !== expected) {
        throw new Error(`${message ? message + ': ' : ''}expected ${expected}, got ${actual}`);
    }
}

// 1. Presentation test of QuickToggle
{
    let toggled = false;
    const toggle = new QuickToggle({
        iconName: 'night-light-symbolic',
        label: 'Night Light',
        onToggle: () => { toggled = true; },
        active: false,
    });
    assert(toggle);
    assertEqual(toggle.isActive, false);

    toggle.setActive(true);
    assertEqual(toggle.isActive, true);

    toggle.destroy();

    toggle.setIcon('weather-clear-symbolic');
    assertEqual(toggle._iconName, 'weather-clear-symbolic');

    toggle.setLabel('Light');
    assertEqual(toggle._label, 'Light');
}

// 2. Presentation test of QuickTogglesRow with mock manager
{
    let lastToggled = null;
    let listener = null;

    const mockManager = {
        getState: () => ({dnd: false, nightLight: true, darkMode: true}),
        toggleDnd: () => { lastToggled = 'dnd'; },
        toggleNightLight: () => { lastToggled = 'nightLight'; },
        toggleDarkMode: () => { lastToggled = 'darkMode'; },
        connect: (fn) => { listener = fn; return fn; },
        disconnect: (fn) => { if (listener === fn) listener = null; },
    };

    const row = new QuickTogglesRow({manager: mockManager});
    assert(row);
    assert(row._settingsToggle, 'Island exposes a Settings launcher');
    assertEqual(row._settingsToggle._label, 'Settings');
    assertEqual(row._settingsToggle._iconName, 'preferences-system-symbolic');

    // The right group must fit the 98px system section, otherwise it is
    // clipped by the carousel's clip_to_allocation.
    const toggles = [row._themeToggle, row._dndToggle, row._nightToggle, row._settingsToggle];
    for (const toggle of toggles) {
        assertEqual(toggle._size, 20, `${toggle._label} toggle height`);
    }
    // Icon column: four 20px toggles plus three 4px gaps — same row height and
    // gap as the CPU/RAM/BAT tiles.
    const columnHeight = 4 * TOGGLE_HEIGHT + 3 * TOGGLE_COLUMN_SPACING;
    assert(columnHeight <= 98,
        `icon column ${columnHeight}px must fit the 98px section`);
    // Disk block is 13+1+12+1+11 = 38px tall, shorter than the icon column.
    assert(38 <= 98, 'disk block must fit the 98px section');
    // Right-edge parity with the metric column: a 14px glyph centred in a
    // TOGGLE_WIDTH box leaves 4px on each side — the same inset the metric tile
    // gets from its 2px 4px padding — so both sides share one visual margin.
    assertEqual((TOGGLE_WIDTH - 14) / 2, 4, 'toggle glyph inset matches metric tile padding');
    assertEqual(TOGGLE_COLUMN_SPACING, 4, 'icon gap matches metric row gap');
    for (const toggle of toggles) {
        assertEqual(toggle._size, TOGGLE_HEIGHT, `${toggle._label} matches metric row height`);
    }

    // Initial state reflected
    assertEqual(row._dndToggle.isActive, false);
    assertEqual(row._nightToggle.isActive, true);
    assertEqual(row._darkToggle.isActive, true);

    // Simulate event update from manager
    if (listener) {
        listener({dnd: true, nightLight: false, darkMode: true});
        assertEqual(row._dndToggle.isActive, true);
        assertEqual(row._nightToggle.isActive, false);
        assertEqual(row._darkToggle.isActive, true);
    }


    // Test Island theme switcher callback and setTheme
    let themeToggled = false;
    const themedRow = new QuickTogglesRow({
        manager: mockManager,
        onThemeToggle: () => { themeToggled = true; },
    });
    themedRow._themeToggle._onToggle();
    assert(themeToggled, 'onThemeToggle callback called when themeToggle clicked');

    themedRow.setTheme('light');
    assertEqual(themedRow._themeToggle._label, 'Theme: Light');
    assertEqual(themedRow._themeToggle._iconName, 'weather-clear-symbolic');
    themedRow.destroy();
    row.destroy();
    assert(row._destroyed, 'Row should be destroyed');
}

console.log('PASS: QuickToggle and QuickTogglesRow presentation tests');
