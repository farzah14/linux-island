import {transition} from '../../extension/lib/interactionState.js';

function check(current, event, expected) {
    const actual = transition(current, event);
    if (actual !== expected)
        throw new Error(`${current} + ${event}: expected ${expected}, got ${actual}`);
}

// The GNOME UI owns the state; all transitions must remain pure.
check('COMPACT', 'HOVER_ENTER', 'PREVIEW');
check('PREVIEW', 'HOVER_LEAVE', 'COMPACT');
check('COMPACT', 'CLICK', 'EXPANDED');
check('PREVIEW', 'CLICK', 'EXPANDED');
check('EXPANDED', 'DISMISS', 'COMPACT');
check('EXPANDED', 'PEEK_REQUEST', 'EXPANDED');
check('COMPACT', 'PEEK_REQUEST', 'PEEK');
check('PEEK', 'PEEK_TIMEOUT', 'COMPACT');
check('EXPANDED', 'PEEK_TIMEOUT', 'EXPANDED');
check('COMPACT', 'FULLSCREEN_ON', 'HIDDEN');
check('EXPANDED', 'FULLSCREEN_ON', 'HIDDEN');
check('HIDDEN', 'HOVER_ENTER', 'HIDDEN');
check('HIDDEN', 'PEEK_REQUEST', 'HIDDEN');
check('HIDDEN', 'FULLSCREEN_OFF', 'COMPACT');
check('COMPACT', 'MEDIA_CHANGED', 'COMPACT');
check('EXPANDED', 'MEDIA_CHANGED', 'EXPANDED');
let invalidRejected = false;
try { transition('NOT_A_STATE', 'CLICK'); } catch { invalidRejected = true; }
if (!invalidRejected) throw new Error('Invalid UI state was accepted');
printResult();
function printResult() {
    // console.log is supported by both Node and GJS.
    console.log('PASS: 17 state-machine assertions');
}
