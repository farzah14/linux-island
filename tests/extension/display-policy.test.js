import {shouldHideIsland} from '../../extension/lib/displayPolicy.js';

function expect(actual, expected, label) {
    if (actual !== expected) throw new Error(`${label}: got ${actual}; wanted ${expected}`);
}

// 1. Basic fullscreen on primary
expect(shouldHideIsland({enabled: true, fullscreenOnPrimary: true}), true, 'fullscreen');
expect(shouldHideIsland({enabled: true, fullscreenOnPrimary: false}), false, 'windowed');
expect(shouldHideIsland({enabled: false, fullscreenOnPrimary: true}), false, 'preference off');
expect(shouldHideIsland({enabled: true, fullscreenOnPrimary: undefined}), true, 'unknown conservative');
expect(shouldHideIsland({enabled: true, fullscreenOnPrimary: null}), true, 'null conservative');

// 2. Maximized window does not hide island
expect(shouldHideIsland({enabled: true, fullscreenOnPrimary: false, isMaximized: true}), false, 'maximized not fullscreen');
expect(shouldHideIsland({enabled: true, fullscreenOnPrimary: true, isMaximized: true}), true, 'fullscreen overrides maximized');

// 3. Fullscreen on another workspace does not hide active workspace island
expect(shouldHideIsland({enabled: true, fullscreenOnPrimary: false, activeWorkspaceFullscreen: false}), false, 'other workspace fullscreen ignored');

console.log('PASS: 8 display policy checks');
