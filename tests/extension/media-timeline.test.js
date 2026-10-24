import {estimateTimeline, formatTime} from '../../extension/lib/mediaTimeline.js';
import {reconcileState} from '../../extension/lib/coreProxy.js';
function equal(actual, expected, label) {
    if (actual !== expected) throw new Error(`${label}: expected ${expected}, got ${actual}`);
}
const media = {playerId: 'test', positionUs: 10000000, durationUs: 100000000,
    positionSampleUs: 1000000, playbackStatus: 'Playing', rate: 1};
equal(estimateTimeline(media, 6000000).positionUs, 15000000, 'advances from shared sample clock');
equal(estimateTimeline({...media, rate: 2}, 6000000).positionUs, 20000000, 'rate respected');
equal(estimateTimeline({...media, playbackStatus: 'Paused'}, 6000000).positionUs, 10000000, 'paused stays still');
equal(estimateTimeline(media, 999000000).progress, 1, 'clamped to duration');
equal(estimateTimeline({...media, durationUs: 0}, 6000000).progress, 0, 'unknown duration');
equal(estimateTimeline({...media, positionSampleUs: 0}, 6000000).positionUs, 10000000, 'missing sample does not invent progress');
equal(estimateTimeline({...media, positionUs: NaN, durationUs: Infinity}, 6000000).progress, 0, 'invalid numbers bounded');
equal(estimateTimeline(null, 6000000).positionUs, 0, 'offline');
equal(formatTime(65000000), '1:05', 'minutes');
equal(formatTime(3661000000), '1:01:01', 'hours');
equal(formatTime(-1), '0:00', 'negative time');
const latest = {instanceId: 'same', mediaRevision: 20, settingsRevision: 4,
    media: {positionUs: 30000000}, settings: {theme: 'light'}};
const refreshed = reconcileState(latest, {type: 'SNAPSHOT_LOADED', snapshot: {
    instanceId: 'same', mediaRevision: 19, settingsRevision: 3,
    media: {positionUs: 10000000}, settings: {theme: 'dark'}}});
equal(refreshed.mediaRevision, 20, 'opening panel must not roll back newer media signals');
equal(refreshed.settings.theme, 'light', 'stale refresh must not roll back settings');
console.log('PASS: timeline clock, rate, pause, bounds and formatting');
