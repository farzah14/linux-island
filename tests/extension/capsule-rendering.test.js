// Exercise the real renderers with actor doubles; this is not GNOME runtime proof.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {IslandController} from '../../extension/lib/islandController.js';
import {estimateTimeline, formatTime} from '../../extension/lib/mediaTimeline.js';
import {SystemMetricsCollector} from '../../extension/lib/systemMetrics.js';
import {QuickSettingsManager} from '../../extension/lib/quickSettings.js';

class Actor {
    constructor(props = {}) {
        Object.assign(this, {visible: true, opacity: 255, scale_x: 1, scale_y: 1,
            children: [], handlers: {}, transitions: [], cancelled: 0, mapped: true}, props);
        this.clutter_text = {set_ellipsize() {}};
        this.classes = new Set((props.style_class ?? '').split(' ').filter(Boolean));
    }
    add_child(child) { this.children.push(child); }
    set_child(child) { this.child = child; }
    get_child() { return this.child; }
    connect(name, fn) { this.handlers[name] = fn; return name; }
    disconnect(name) { delete this.handlers[name]; }
    add_style_class_name(name) { this.classes.add(name); }
    remove_style_class_name(name) { this.classes.delete(name); }
    set_pivot_point(x, y) { this.pivot = [x, y]; }
    set_position(x, y) { this.position = [x, y]; }
    get_preferred_width() { return [124, 360]; }
    remove_all_transitions() { this.cancelled++; this.transitions = []; }
    ease(params) { this.transitions.push(params); }
    destroy() { this.destroyed = true; }
}
const settings = {enable_animations: true, listeners: new Map(), nextId: 0,
    connect(_name, fn) { this.listeners.set(++this.nextId, fn); return this.nextId; },
    disconnect(id) { this.listeners.delete(id); },
    notify() { for (const fn of this.listeners.values()) fn(); }};
let systemColorScheme = 'prefer-dark';
class GrabHelperDouble {
    constructor() { this.grabbed = false; }
    grab(params) {
        if (GrabHelperDouble.failNext) {
            GrabHelperDouble.failNext = false;
            return false;
        }
        this.params = params;
        this.grabbed = true;
        return true;
    }
    ungrab({isUser = false} = {}) {
        if (!this.grabbed) return;
        this.grabbed = false;
        this.params.onUngrab(isUser);
    }
}
globalThis.renderTest = {
    GrabHelper: {GrabHelper: GrabHelperDouble},
    St: {BoxLayout: Actor, Label: Actor, Widget: Actor, Button: Actor, Icon: Actor, Bin: Actor,
        Settings: {get: () => settings}},
    Gio: {Cancellable: class { cancel() { this.cancelled = true; } },
        Settings: class {
            constructor() { this.handlers = {}; }
            get_string() { return systemColorScheme; }
            connect(name, fn) { this.handlers[name] = fn; return name; }
            disconnect(name) { delete this.handlers[name]; }
        }},
    loadLocalArtwork: async () => null,
    estimateTimeline, formatTime,
    Clutter: {ActorAlign: {CENTER: 1}, AnimationMode: {EASE_OUT_CUBIC: 1},
        EVENT_STOP: 1, EVENT_PROPAGATE: 0, KEY_Escape: 27},
    Main: {layoutManager: {primaryMonitor: {x: 0, y: 0, width: 1366},
        addTopChrome() {}, removeChrome() {}, connectObject() {}, disconnectObject() {}}},
    SystemMetricsCollector,
    QuickSettingsManager,
};
const load = source => import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const beatSource = (await readFile(new URL('../../extension/ui/beatBars.js', import.meta.url), 'utf8'))
    .replace('let St = null;', 'let St = globalThis.renderTest.St;')
    .replace('let Clutter = null;', 'let Clutter = globalThis.renderTest.Clutter;');
const {BeatBars} = await load(beatSource);
globalThis.renderTest.BeatBars = BeatBars;
let metricTileSource = (await readFile(new URL('../../extension/ui/systemMetricTile.js', import.meta.url), 'utf8'))
    .replace(/^import .*systemMetrics.*;$/gm, 'const {SystemMetricsCollector} = globalThis.renderTest;')
    .replace('let St = null;', 'let St = globalThis.renderTest.St;')
    .replace('let Clutter = null;', 'let Clutter = globalThis.renderTest.Clutter;');
const {SystemMetricsRow} = await load(metricTileSource);
globalThis.renderTest.SystemMetricsRow = SystemMetricsRow;
let quickToggleSource = (await readFile(new URL('../../extension/ui/quickToggle.js', import.meta.url), 'utf8'))
    .replace(/^import .*quickSettings.*;$/gm, 'const {QuickSettingsManager} = globalThis.renderTest;')
    .replace('let St = null;', 'let St = globalThis.renderTest.St;')
    .replace('let Clutter = null;', 'let Clutter = globalThis.renderTest.Clutter;');
const {QuickTogglesRow} = await load(quickToggleSource);
globalThis.renderTest.QuickTogglesRow = QuickTogglesRow;
let carouselSource = (await readFile(new URL('../../extension/ui/featureCarousel.js', import.meta.url), 'utf8'))
    .replace('let St = null;', 'let St = globalThis.renderTest.St;')
    .replace('let Clutter = null;', 'let Clutter = globalThis.renderTest.Clutter;');
const {FeatureCarousel} = await load(carouselSource);
globalThis.renderTest.FeatureCarousel = FeatureCarousel;
let mediaSource = await readFile(new URL('../../extension/ui/mediaView.js', import.meta.url), 'utf8');
mediaSource = mediaSource.replace('let St = null;', 'let St = globalThis.renderTest.St;')
    .replace(/^import .*localArtwork.*;$/gm, 'const {loadLocalArtwork} = globalThis.renderTest;')
    .replace(/^import .*beatBars.*;$/gm, 'const {BeatBars} = globalThis.renderTest;')
    .replace(/^import .*mediaTimeline.*;$/gm, 'const {estimateTimeline, formatTime} = globalThis.renderTest;')
    .replace(/^import .*systemMetricTile.*;$/gm, 'const {SystemMetricsRow} = globalThis.renderTest;')
    .replace(/^import .*quickToggle.*;$/gm, 'const {QuickTogglesRow} = globalThis.renderTest;')
    .replace(/^import .*featureCarousel.*;$/gm, 'const {FeatureCarousel} = globalThis.renderTest;')
    .replace('let Gio = null;', 'let Gio = globalThis.renderTest.Gio;')
    .replace('let Clutter = null;', 'let Clutter = globalThis.renderTest.Clutter;');
const {MediaView, CAPSULE_SIZES} = await load(mediaSource);
globalThis.renderTest.MediaView = MediaView;
globalThis.renderTest.CAPSULE_SIZES = CAPSULE_SIZES;
let capsuleSource = await readFile(new URL('../../extension/ui/capsule.js', import.meta.url), 'utf8');
capsuleSource = capsuleSource.replace(/^import .*;$/gm, '');
const {Capsule} = await load(`const {St, Clutter, Gio, Main, MediaView, CAPSULE_SIZES, GrabHelper, BeatBars} = globalThis.renderTest;\n${capsuleSource}`);

const capsule = new Capsule();
assert.equal(typeof capsule.setTheme, 'function', 'renderer needs live theme switching');
assert.equal(typeof capsule.setCapsuleSize, 'function', 'renderer needs live capsule sizing');
assert.equal(typeof capsule.setHoverPreviewEnabled, 'function', 'renderer needs live hover preference');
capsule.setTheme('light');
assert.equal(capsule._widget.classes.has('linux-island--light'), true);
capsule.applyState('EXPANDED');
capsule.setTheme('dark');
assert.equal(capsule._widget.classes.has('linux-island--dark'), true);
assert.equal(capsule._widget.classes.has('linux-island--light'), false);
assert.equal(capsule._currentState, 'EXPANDED', 'theme does not collapse current interaction');
capsule.setTheme('system');
systemColorScheme = 'prefer-light';
capsule._systemSettings.handlers['changed::color-scheme']();
assert.equal(capsule._widget.classes.has('linux-island--light'), true);
capsule.setTheme('dark');
systemColorScheme = 'default';
capsule._systemSettings.handlers['changed::color-scheme']();
assert.equal(capsule._widget.classes.has('linux-island--dark'), true, 'explicit dark ignores desktop');
capsule.setTheme('system');
assert.equal(capsule._widget.classes.has('linux-island--light'), true, 'default desktop scheme is light');
capsule.applyState('COMPACT');
capsule.applyState('EXPANDED');
capsule.setCapsuleSize('small');
assert.match(capsule._mediaView.actor.style, /width: 268px/);
assert.equal(capsule._mediaView._artIcon.icon_size, 40);
assert.match(capsule._mediaView._prevBtn.style, /height: 28px/);
assert.equal(capsule._currentState, 'EXPANDED', 'resizing does not dismiss');
capsule.setCapsuleSize('large');
assert.match(capsule._mediaView.actor.style, /width: 388px/);
assert.equal(capsule._mediaView._artIcon.icon_size, 56);
assert.equal(capsule._mediaView._prevBtn.child.icon_size, 16);
capsule.applyState('HIDDEN');
capsule.setCapsuleSize('small');
assert.equal(capsule._widget.visible, false, 'resize preserves fullscreen hiding');
capsule.setCapsuleSize('invalid');
assert.match(capsule._mediaView.actor.style, /width: 268px/, 'unknown size ignored');
capsule.setCapsuleSize('__proto__');
assert.match(capsule._mediaView.actor.style, /width: 268px/, 'inherited names are not presets');
capsule.setMedia({playerId: 'test', title: 'A long title that needs more room to display in the compact pill',
    playbackStatus: 'Playing', audioLevels: [0.2, 0.4, 0.7]});
const smallText = capsule._label.text;
capsule.setCapsuleSize('large');
assert.ok(capsule._label.text.length > smallText.length, 'resizing refreshes compact truncation');
assert.equal(capsule._mediaView._titleLabel.text, 'A long title that needs more room to display in the compact pill');
capsule.setCapsuleSize('medium');
capsule.applyState('COMPACT');
assert.ok(capsule._beatBars, 'compact title needs beat bars');
assert.match(capsule._mediaView.actor.style, /width: 328px/, 'wide card content width');
assert.ok(capsule._mediaView._carousel, 'media card has slideable features carousel');
assert.equal(capsule._mediaView._carousel.pageCount, 2, 'music and system & controls pages');
assert.equal(capsule._mediaView._mediaSection.children.length, 3, 'track, thin timeline and controls rows in media section');
assert.equal(capsule._mediaView._systemSection.children.length, 2, 'metrics and quick toggles in system section');
assert.equal(capsule._mediaView._systemSection.vertical, false, 'system section is horizontal: left metrics, right toggles');
assert.equal(capsule._mediaView._systemSection.children[0], capsule._mediaView._metricsRow.actor, 'metrics on the left');
assert.equal(capsule._mediaView._systemSection.children[1], capsule._mediaView._quickTogglesRow.actor, 'quick toggles on the right');
capsule._mediaView._carousel.setPage(1);
assert.ok(capsule._mediaView._carousel._track.transitions.length > 0, 'carousel track animates horizontally when sliding');
assert.match(capsule._mediaView._prevBtn.style, /height: 32px/, 'short playback buttons');
assert.match(capsule._mediaView._playPauseBtn.style, /height: 32px/);
assert.doesNotMatch(capsule._mediaView.actor.style, /min-height/, 'no forced empty height');
assert.equal(capsule._mediaView._prevBtn.style, capsule._mediaView._nextBtn.style,
    'Previous/Next must have matching padding and hit targets');
assert.equal(capsule._mediaView._prevBtn.child.icon_name, 'media-skip-backward-symbolic');
assert.equal(capsule._mediaView._nextBtn.child.icon_name, 'media-skip-forward-symbolic');
for (const actor of [capsule._mediaView._titleLabel, capsule._mediaView._artistLabel,
    capsule._mediaView._prevBtn, capsule._mediaView._playPauseBtn,
    ...capsule._beatBars._bars]) {
    assert.doesNotMatch(actor.style, /(?:color|background-color):\s*#/, 'inline colors must not override live theme');
}
capsule.setAvailablePlayers(['org.mpris.MediaPlayer2.spotify', 'org.mpris.MediaPlayer2.firefox']);
assert.equal(capsule._mediaView._playerSwitcherBtn.visible, true, 'switcher button visible when multiple players active');
capsule.setAvailablePlayers(['org.mpris.MediaPlayer2.spotify']);
assert.equal(capsule._mediaView._playerSwitcherBtn.visible, false, 'switcher button hidden when single player active');
capsule.applyState('PREVIEW');
assert.equal(capsule._widget.classes.has('linux-island__capsule'), true,
    'hover must retain compact padding so the pointer hitbox does not shrink');
assert.equal(capsule._widget.classes.has('linux-island__preview'), false);
assert.equal(capsule._widget.scale_x, 1, 'hover must not resample text');
assert.equal(capsule._widget.opacity, 255, 'hover text stays opaque');
assert.equal(capsule._widget.transitions.length, 0, 'no transform on hover');
capsule.applyState('COMPACT');
assert.equal(capsule._widget.transitions.length, 0, 'no transform on hover exit');
capsule.setMedia({playerId: 'test', title: 'Test track', artist: 'Test artist',
    playbackStatus: 'Playing', canPause: true});
assert.equal(capsule._mediaView._titleLabel.text, 'Test track');
assert.equal(capsule._mediaView._artistLabel.text, 'Test artist');
capsule.setMedia({playerId: 'test', playbackStatus: 'Playing', audioLevels: [0.1, 0.5, 0.9]});
assert.ok(capsule._beatBars._bars[2].scale_y > capsule._beatBars._bars[0].scale_y, 'actual band levels control heights');
assert.equal(capsule._beatBars._bars[0].transitions.length, 0, 'no fabricated repeat animation');
assert.equal(capsule._mediaView._beatBars._bars[1].scale_y, 0.15 + 0.85 * 0.5);
capsule.setMedia({playerId: 'test', playbackStatus: 'Playing', audioLevels: [0.9, 0.2, 0.1]});
assert.ok(capsule._beatBars._bars[0].scale_y > capsule._beatBars._bars[2].scale_y, 'new audio updates even while playing');
capsule.setMedia({playerId: 'test', playbackStatus: 'Playing'});
assert.equal(capsule._beatBars._bars[0].scale_y, 0.15, 'missing meter settles instead of pretending to beat');
capsule.setMedia({playerId: 'test', playbackStatus: 'Playing', audioLevels: [0.8, 0.4, 0.2]});
capsule.setAnimationEnabled(false);
assert.equal(capsule._beatBars._bars[0].scale_y, 0.15);
assert.equal(capsule._mediaView._beatBars._bars[0].scale_y, 0.15);
capsule.setAnimationEnabled(true);
settings.enable_animations = false;
settings.notify();
assert.equal(capsule._beatBars._bars[0].scale_y, 0.15, 'live reduced motion settles');
settings.enable_animations = true;
settings.notify();
assert.ok(capsule._beatBars._bars[0].scale_y > 0.15);
capsule._beatBars.actor.mapped = false;
capsule._beatBars.actor.handlers['notify::mapped']();
assert.equal(capsule._beatBars._bars[0].scale_y, 0.15, 'unmapped settles');
capsule._beatBars.actor.mapped = true;
capsule._beatBars.actor.handlers['notify::mapped']();
assert.equal(capsule._beatBars._bars[0].scale_y, 0.15 + 0.85 * 0.8, 'mapping restores latest measured value');
capsule.setMedia({playerId: 'test', playbackStatus: 'Playing', audioLevels: [NaN, 20, -1]});
assert.equal(capsule._beatBars._bars[0].scale_y, 0.15);
assert.equal(capsule._beatBars._bars[1].scale_y, 1);
assert.equal(capsule._beatBars._bars[2].scale_y, 0.15);
capsule.setMedia({playerId: 'test', playbackStatus: 'Paused', audioLevels: [1, 1, 1]});
assert.equal(capsule._beatBars._bars[0].scale_y, 0.15, 'pause overrides levels');
assert.equal(typeof capsule.setConnected, 'function', 'renderer must distinguish Core offline from no media');
capsule.setConnected(false);
assert.equal(capsule._beatBars._bars[0].transitions.length, 0, 'disconnect stops beats');
assert.equal(capsule._beatBars.actor.visible, false);
capsule.setMedia({});
assert.equal(capsule._label.text, 'Core offline', 'offline snapshot must not show idle label');
assert.equal(capsule._mediaView._titleLabel.text, 'Core offline');
assert.equal(capsule._mediaView._playPauseBtn.reactive, false);
capsule.setConnected(true);
capsule.setMedia({});
assert.equal(capsule._mediaView._titleLabel.text, 'No Media Playing');
capsule.applyState('EXPANDED');
assert.equal(capsule._compactRow.visible, false);
assert.equal(capsule._mediaView.actor.visible, true);
assert.equal(capsule._widget.transitions.at(-1).duration, 220);
assert.equal(capsule._grabHelper.grabbed, true, 'expanded card owns dismissal grab');
capsule.applyState('COMPACT');
assert.equal(capsule._grabHelper.grabbed, false, 'collapse releases grab');
assert.equal(capsule._widget.transitions.length, 1, 'replace interrupted animation');
capsule.applyState('HIDDEN');
assert.equal(capsule._widget.visible, false, 'fullscreen hides immediately');
assert.equal(capsule._widget.transitions.length, 0);
capsule.setAnimationEnabled(false);
capsule.applyState('EXPANDED');
assert.equal(capsule._widget.transitions.length, 0);
assert.equal(capsule._widget.scale_x, 1);
capsule.setAnimationEnabled(true);
capsule.applyState('COMPACT');
assert.equal(capsule._widget.transitions.length, 1);
capsule.setAnimationEnabled(false);
assert.equal(capsule._widget.transitions.length, 0, 'disable motion cancels an active transition');
assert.equal(capsule._widget.opacity, 255);
capsule.setAnimationEnabled(true);
settings.enable_animations = false;
capsule.applyState('EXPANDED');
assert.equal(capsule._widget.transitions.length, 0, 'GNOME reduced motion');
settings.enable_animations = true;
capsule.applyState('COMPACT');
capsule.applyState('EXPANDED');
const widget = capsule._widget;
const grab = capsule._grabHelper;
const systemThemeSettings = capsule._systemSettings;
capsule.destroy();
assert.equal(Object.keys(systemThemeSettings.handlers).length, 0, 'theme listener removed');
assert.equal(grab.grabbed, false, 'destroy releases input');
assert.equal(widget.transitions.length, 0);
assert.equal(widget.destroyed, true);

// Verify that real extension state delivery wires connection and animation preferences.
const extensionSource = await readFile(new URL('../../extension/extension.js', import.meta.url), 'utf8');
const {default: Extension} = await load(`const Extension = class {};\n${extensionSource.replace(/^import .*;$/gm, '')}`);
const extension = new Extension();
extension._capsule = new Capsule();
extension._onCoreStateChanged({connected: true, media: {playerId: 'test', title: 'Recovered track'},
    settings: {animationEnabled: false, theme: 'dark', capsuleSize: 'large'}});
assert.match(extension._capsule._mediaView.actor.style, /width: 388px/, 'Core size reaches renderer');
assert.equal(extension._capsule._widget.classes.has('linux-island--dark'), true, 'Core theme reaches renderer');
assert.equal(extension._capsule._mediaView._titleLabel.text, 'Recovered track');
extension._capsule.applyState('EXPANDED');
assert.equal(extension._capsule._widget.transitions.length, 0, 'Settings must reach renderer');
extension._onCoreStateChanged({connected: false, media: {}});
assert.equal(extension._capsule._label.text, 'Core offline');
extension._onCoreStateChanged({connected: true, media: {playerId: 'test', title: 'Reconnected track'}});
assert.equal(extension._capsule._mediaView._titleLabel.text, 'Reconnected track');
extension._capsule.destroy();

const dismissEvents = [];
const outsideCard = new Capsule({onInteractionEvent: event => {
    dismissEvents.push(event);
    if (event === 'DISMISS') outsideCard.applyState('COMPACT');
}});
outsideCard.applyState('EXPANDED');
outsideCard._grabHelper.ungrab({isUser: true});
assert.equal(outsideCard._currentState, 'COMPACT', 'outside dismissal collapses');
assert.deepEqual(dismissEvents, ['DISMISS']);
outsideCard.applyState('EXPANDED');
outsideCard.applyState('HIDDEN');
assert.equal(outsideCard._grabHelper.grabbed, false, 'fullscreen releases input');
assert.deepEqual(dismissEvents, ['DISMISS'], 'fullscreen must not dispatch a user dismissal');
outsideCard.applyState('COMPACT');
GrabHelperDouble.failNext = true;
outsideCard.applyState('EXPANDED');
assert.equal(outsideCard._currentState, 'COMPACT', 'failed grab returns to compact');
outsideCard.destroy();

let preferenceController;
const preferenceCard = new Capsule({onInteractionEvent: event => preferenceController.dispatch(event)});
const display = {fullscreen: false, read() { return this.fullscreen; }, subscribe() { return () => {}; }};
preferenceController = new IslandController({adapter: display, onStateChanged: state => preferenceCard.applyState(state)});
const preferences = new Extension();
preferences._capsule = preferenceCard;
preferences._controller = preferenceController;
const updatePreferences = (hover, adaptive) => preferences._onCoreStateChanged({
    connected: true, settings: {hoverPreviewEnabled: hover, smartAdaptiveEnabled: adaptive}, media: {}});
preferenceCard._widget.hover = true;
updatePreferences(false, true);
preferenceCard._widget.handlers['notify::hover']();
assert.equal(preferenceController.state, 'COMPACT', 'disabled hover is ignored');
updatePreferences(true, true);
assert.equal(preferenceController.state, 'PREVIEW', 'enable responds to stationary hovered pointer');
updatePreferences(false, true);
assert.equal(preferenceController.state, 'COMPACT', 'disable dismisses preview');
preferenceCard._compactRow.handlers['button-press-event']();
assert.equal(preferenceController.state, 'EXPANDED', 'explicit click still works with hover disabled');
display.fullscreen = true;
updatePreferences(false, false);
assert.equal(preferenceController.state, 'EXPANDED', 'disabled adaptive preserves expansion');
updatePreferences(true, true);
assert.equal(preferenceController.state, 'HIDDEN', 'fullscreen wins over hover when settings arrive together');
updatePreferences(false, false);
assert.equal(preferenceController.state, 'COMPACT', 'disabling adaptive restores hidden capsule');
preferenceController.destroy();
preferenceCard.destroy();

let timelineNow = 6000000;
const timelineTicks = new Map();
let nextTick = 1;
const timelineView = new MediaView({clock: () => timelineNow, scheduler: {
    repeat(fn) { timelineTicks.set(nextTick, fn); return nextTick++; },
    cancel(id) { timelineTicks.delete(id); },
}});
timelineView._progressTrack.width = 200;
const timelineMedia = {playerId: 'test', positionUs: 10000000, durationUs: 100000000,
    positionSampleUs: 1000000, playbackStatus: 'Playing', rate: 1};
timelineView.setMedia(timelineMedia);
assert.equal(timelineView._elapsedLabel.text, '0:15');
assert.equal(timelineView._durationLabel.text, '1:40');
assert.equal(timelineView._progressFill.width, 30);
assert.equal(timelineTicks.size, 1);
timelineNow += 5000000;
for (const fn of timelineTicks.values()) fn();
assert.equal(timelineView._elapsedLabel.text, '0:20');
timelineView.setMedia({...timelineMedia, audioLevels: [1, 0, 1]});
assert.equal(timelineView._elapsedLabel.text, '0:20', 'audio updates do not reset progress');
timelineView.setMedia({...timelineMedia, playbackStatus: 'Paused'});
assert.equal(timelineTicks.size, 0, 'pause cancels timeline timer');
timelineView.setMedia(timelineMedia);
timelineView.actor.mapped = false;
timelineView.actor.handlers['notify::mapped']();
assert.equal(timelineTicks.size, 0, 'hidden view cancels timeline timer');
timelineView.actor.mapped = true;
timelineView.actor.handlers['notify::mapped']();
assert.equal(timelineTicks.size, 1);
timelineView.destroy();
assert.equal(timelineTicks.size, 0, 'destroy cancels timeline timer');

const pendingArtwork = [];
const mediaView = new MediaView({artworkLoader: (uri, cancellable) =>
    new Promise(resolve => pendingArtwork.push({uri, cancellable, resolve}))});
mediaView.setMedia({playerId: 'test', title: 'A', albumArtUri: 'file:///tmp/a.png'});
assert.equal(pendingArtwork.length, 1);
mediaView.setMedia({playerId: 'test', title: 'B', albumArtUri: 'file:///tmp/b.png'});
assert.equal(pendingArtwork[0].cancellable.cancelled, true);
const artB = {name: 'B'};
pendingArtwork[1].resolve(artB);
await Promise.resolve();
assert.equal(mediaView._artIcon.gicon, artB);
pendingArtwork[0].resolve({name: 'A'});
await Promise.resolve();
assert.equal(mediaView._artIcon.gicon, artB, 'stale artwork cannot replace current track');
mediaView.setMedia({playerId: 'test', title: 'C'});
assert.equal(mediaView._artIcon.gicon, null, 'missing art restores placeholder');
mediaView.setMedia({playerId: 'test', title: 'D', albumArtUri: 'file:///tmp/d.png'});
mediaView.setConnected(false);
pendingArtwork[2].resolve({name: 'D'});
await Promise.resolve();
assert.equal(mediaView._artIcon.gicon, null, 'disconnect rejects pending art');
mediaView.setConnected(true);
mediaView.setMedia({playerId: 'test', title: 'E', albumArtUri: 'file:///tmp/e.png'});
mediaView.destroy();
assert.equal(pendingArtwork[3].cancellable.cancelled, true);
pendingArtwork[3].resolve({name: 'E'});
await Promise.resolve();
assert.equal(settings.listeners.size, 0, 'all beat settings listeners removed on destroy');
console.log('PASS: media rendering, offline recovery, interrupted transitions, reduced motion, fullscreen and cleanup');
