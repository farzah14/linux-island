// Exercise the real renderers with actor doubles; this is not GNOME runtime proof.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {IslandController} from '../../extension/lib/islandController.js';
import {estimateTimeline, formatTime} from '../../extension/lib/mediaTimeline.js';
import {SystemMetricsCollector} from '../../extension/lib/systemMetrics.js';
import {QuickSettingsManager} from '../../extension/lib/quickSettings.js';
import {AiQuotaCollector} from '../../extension/lib/aiQuota.js';
import {SEARCH_ENGINES, DEFAULT_SEARCH_ENGINE, buildSearchUrl, isValidNavigationUrl} from '../../extension/lib/searchEngines.js';

class Actor {
    constructor(props = {}) {
        Object.assign(this, {visible: true, opacity: 255, scale_x: 1, scale_y: 1,
            children: [], handlers: {}, transitions: [], cancelled: 0, mapped: true}, props);
        this.text = props.text ?? '';
        this.clutter_text = {handlers: {}, set_ellipsize() {},
            connect(name, fn) { this.handlers[name] = fn; return name; }};
        this.classes = new Set((props.style_class ?? '').split(' ').filter(Boolean));
    }
    add_child(child) { this.children.push(child); }
    set_child(child) { this.child = child; }
    get_child() { return this.child; }
    get_text() { return this.text; }
    set_text(t) { this.text = t; }
    grab_key_focus() { this.focused = true; }
    connect(name, fn) { this.handlers[name] = fn; return name; }
    disconnect(name) { delete this.handlers[name]; }
    add_style_class_name(name) { this.classes.add(name); }
    remove_style_class_name(name) { this.classes.delete(name); }
    set_pivot_point(x, y) { this.pivot = [x, y]; }
    set_position(x, y) { this.position = [x, y]; }
    get_preferred_width() { return [124, 360]; }
    get_preferred_height() { return [32, 184]; }
    remove_all_transitions() { this.cancelled++; this.transitions = []; }
    ease(params) {
        this.transitions.push(params);
        this.scaleBeforeEase = this.scale_y;
        if ('scale_y' in params) this.scale_y = params.scale_y;
        if ('scale_x' in params) this.scale_x = params.scale_x;
        if ('width' in params) this.width = params.width;
        if ('x' in params) {
            this.x = params.x;
            this.position = [params.x, this.position ? this.position[1] : 8];
        }
        if ('opacity' in params) this.opacity = params.opacity;
        params.onComplete?.();
    }
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
        if (GrabHelperDouble.failNext) { GrabHelperDouble.failNext = false; return false; }
        this.params = params; this.grabbed = true; return true;
    }
    ungrab({isUser = false} = {}) {
        if (!this.grabbed) return;
        this.grabbed = false;
        this.params.onUngrab(isUser);
    }
}
const stageHandlers = new Map();
let nextStageId = 0;
const stage = {
    connect(name, fn) { const id = ++nextStageId; stageHandlers.set(id, {name, fn}); return id; },
    disconnect(id) { stageHandlers.delete(id); },
    emit(event) { return [...stageHandlers.values()].map(({fn}) => fn(stage, event)); },
};
globalThis.renderTest = {
    stage,
    GrabHelper: {GrabHelper: GrabHelperDouble},
    St: {BoxLayout: Actor, Label: Actor, Widget: Actor, Button: Actor, Icon: Actor, Bin: Actor,
        Entry: Actor, Settings: {get: () => settings}},
    Gio: {Cancellable: class { cancel() { this.cancelled = true; } },
        AppInfo: {launch_default_for_uri(uri) { globalThis.renderTest.launchedUris.push(uri); return true; }},
        Settings: class {
            constructor() { this.handlers = {}; }
            get_string() { return systemColorScheme; }
            connect(name, fn) { this.handlers[name] = fn; return name; }
            disconnect(name) { delete this.handlers[name]; }
        }},
    loadLocalArtwork: async () => null,
    estimateTimeline, formatTime,
    Clutter: {ActorAlign: {CENTER: 1, END: 2}, AnimationMode: {EASE_OUT_CUBIC: 1, EASE_IN_OUT_CUBIC: 2},
        EventType: {BUTTON_PRESS: 1, TOUCH_BEGIN: 2, KEY_PRESS: 3},
        EVENT_STOP: 1, EVENT_PROPAGATE: 0, KEY_Escape: 27},
    Main: {layoutManager: {primaryMonitor: {x: 0, y: 0, width: 1366},
        addTopChrome() {}, removeChrome() {}, connectObject() {}, disconnectObject() {}}},
    SystemMetricsCollector,
    QuickSettingsManager,
    AiQuotaCollector,
    SEARCH_ENGINES,
    DEFAULT_SEARCH_ENGINE,
    buildSearchUrl,
    isValidNavigationUrl,
    launchedUris: [],
};
const load = source => import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const beatSource = (await readFile(new URL('../../extension/ui/beatBars.js', import.meta.url), 'utf8'))
    .replace('let St = null;', 'let St = globalThis.renderTest.St;')
    .replace("&& typeof process === 'undefined'", '')
    .replace('let Clutter = null;', 'let Clutter = globalThis.renderTest.Clutter;');
const {BeatBars} = await load(beatSource);
globalThis.renderTest.BeatBars = BeatBars;
let metricTileSource = (await readFile(new URL('../../extension/ui/systemMetricTile.js', import.meta.url), 'utf8'))
    .replace(/^import .*systemMetrics.*;$/gm, 'const {SystemMetricsCollector} = globalThis.renderTest;')
    .replace('let St = null;', 'let St = globalThis.renderTest.St;')
    .replace('let Clutter = null;', 'let Clutter = globalThis.renderTest.Clutter;');
const {SystemMetricsRow, SystemMetricTile, NetMonitorView, StorageIndicator, computeSystemColumns} = await load(metricTileSource);
const metric = new SystemMetricTile({label: 'CPU'});
assert.equal(metric.actor.children[1], metric._valueLabel, 'percentage immediately follows metric text');
metric.destroy();
globalThis.renderTest.SystemMetricsRow = SystemMetricsRow;
globalThis.renderTest.NetMonitorView = NetMonitorView;
globalThis.renderTest.StorageIndicator = StorageIndicator;
globalThis.renderTest.computeSystemColumns = computeSystemColumns;
let quickToggleSource = (await readFile(new URL('../../extension/ui/quickToggle.js', import.meta.url), 'utf8'))
    .replace(/^import .*quickSettings.*;$/gm, 'const {QuickSettingsManager} = globalThis.renderTest;')
    .replace(/^import .*systemMetricTile.*;$/gm, 'const {StorageIndicator} = globalThis.renderTest;')
    .replace('let St = null;', 'let St = globalThis.renderTest.St;')
    .replace('let Clutter = null;', 'let Clutter = globalThis.renderTest.Clutter;');
const {QuickTogglesRow} = await load(quickToggleSource);
globalThis.renderTest.QuickTogglesRow = QuickTogglesRow;
let carouselSource = (await readFile(new URL('../../extension/ui/featureCarousel.js', import.meta.url), 'utf8'))
    .replace('let St = null;', 'let St = globalThis.renderTest.St;')
    .replace('let Clutter = null;', 'let Clutter = globalThis.renderTest.Clutter;');
const {FeatureCarousel} = await load(carouselSource);
globalThis.renderTest.FeatureCarousel = FeatureCarousel;
let aiQuotaSource = (await readFile(new URL('../../extension/ui/aiQuotaView.js', import.meta.url), 'utf8'))
    .replace(/^import .*aiQuota\.js.*;$/gm, 'const {AiQuotaCollector} = globalThis.renderTest;')
    .replace('let St = null;', 'let St = globalThis.renderTest.St;')
    .replace('let Clutter = null;', 'let Clutter = globalThis.renderTest.Clutter;');
const {AiQuotaSection, AiQuotaProviderRow} = await load(aiQuotaSource);
globalThis.renderTest.AiQuotaSection = AiQuotaSection;
globalThis.renderTest.AiQuotaProviderRow = AiQuotaProviderRow;
let searchSource = (await readFile(new URL('../../extension/ui/searchView.js', import.meta.url), 'utf8'))
    .replace(/^import .*searchEngines.*;$/gm, 'const {SEARCH_ENGINES, DEFAULT_SEARCH_ENGINE, buildSearchUrl, isValidNavigationUrl} = globalThis.renderTest;')
    .replace('let St = null;', 'let St = globalThis.renderTest.St;')
    .replace('let Clutter = null;', 'let Clutter = globalThis.renderTest.Clutter;');
const {SearchSection} = await load(searchSource);
globalThis.renderTest.SearchSection = SearchSection;
let mediaSource = await readFile(new URL('../../extension/ui/mediaView.js', import.meta.url), 'utf8');
mediaSource = mediaSource.replace('let St = null;', 'let St = globalThis.renderTest.St;')
    .replace(/^import .*localArtwork.*;$/gm, 'const {loadLocalArtwork} = globalThis.renderTest;')
    .replace(/^import .*beatBars.*;$/gm, 'const {BeatBars} = globalThis.renderTest;')
    .replace(/^import .*mediaTimeline.*;$/gm, 'const {estimateTimeline, formatTime} = globalThis.renderTest;')
    .replace(/^import .*systemMetricTile.*;$/gm, 'const {SystemMetricsRow, NetMonitorView, computeSystemColumns} = globalThis.renderTest;')
    .replace(/^import .*quickToggle.*;$/gm, 'const {QuickTogglesRow} = globalThis.renderTest;')
    .replace(/^import .*featureCarousel.*;$/gm, 'const {FeatureCarousel} = globalThis.renderTest;')
    .replace(/^import .*aiQuotaView.*;$/gm, 'const {AiQuotaSection} = globalThis.renderTest;')
    .replace(/^import .*searchView.*;$/gm, 'const {SearchSection} = globalThis.renderTest;')
    .replace(/^import .*searchEngines.*;$/gm, 'const {DEFAULT_SEARCH_ENGINE, isValidNavigationUrl} = globalThis.renderTest;')
    .replace('let Gio = null;', 'let Gio = globalThis.renderTest.Gio;')
    .replace('let Clutter = null;', 'let Clutter = globalThis.renderTest.Clutter;');
const {MediaView, CAPSULE_SIZES} = await load(mediaSource);
globalThis.renderTest.MediaView = MediaView;
globalThis.renderTest.CAPSULE_SIZES = CAPSULE_SIZES;
let capsuleSource = await readFile(new URL('../../extension/ui/capsule.js', import.meta.url), 'utf8');
capsuleSource = capsuleSource.replace(/^import .*;$/gm, '').replaceAll('global.stage', 'globalThis.renderTest.stage');
const {Capsule} = await load(`const {St, Clutter, Gio, Main, MediaView, CAPSULE_SIZES, GrabHelper, BeatBars, loadLocalArtwork} = globalThis.renderTest;\n${capsuleSource}`);

const capsule = new Capsule();
assert.equal(typeof capsule.setTheme, 'function', 'renderer needs live theme switching');
assert.equal(typeof capsule.setCapsuleSize, 'function', 'renderer needs live capsule sizing');
assert.equal(typeof capsule.setHoverPreviewEnabled, 'function', 'renderer needs live hover preference');
assert.equal(typeof capsule.setVerticalOffset, 'function', 'renderer needs live vertical offset');
assert.equal(typeof capsule.setHorizontalOffset, 'function', 'renderer needs live horizontal offset');

const monitor = globalThis.renderTest.Main.layoutManager.primaryMonitor;
const [, natW] = capsule._widget.get_preferred_width(-1);
const expectedCenter = Math.round(monitor.x + (monitor.width - natW) / 2);
capsule.setVerticalOffset(24);
assert.equal(capsule._widget.position[1], monitor.y + 24, 'vertical offset updates y position to monitor.y + 24');
capsule.setHorizontalOffset(40);
assert.equal(capsule._widget.position[0], expectedCenter + 40, 'horizontal offset updates x position to center + 40');
capsule.setVerticalOffset(8);
capsule.setHorizontalOffset(0);
assert.equal(capsule._widget.position[1], monitor.y + 8, 'reset vertical offset restores monitor.y + 8');
assert.equal(capsule._widget.position[0], expectedCenter, 'reset horizontal offset restores baseline center');
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
assert.equal(capsule._mediaView._carousel.pageCount, 4, 'music, system & controls, AI quota, and search pages');
const carousel = capsule._mediaView._carousel;
assert.ok(carousel._navBox, 'section nav box exists');
assert.equal(carousel.actor.children[0], carousel._navBox, 'section nav is first child of carousel actor');
assert.equal(carousel._navButtons.length, 4, 'four section buttons');
assert.equal(carousel._navButtons[0].child.icon_name, 'audio-x-generic-symbolic', 'music section icon');
assert.equal(carousel._navButtons[1].child.icon_name, 'preferences-system-symbolic', 'system section icon');
assert.equal(carousel._navButtons[2].child.icon_name, 'applications-science-symbolic', 'AI quota section icon');
assert.equal(carousel._navButtons[3].child.icon_name, 'system-search-symbolic', 'search section icon');
assert.ok(carousel._navButtons[0].classes.has('linux-island__section-btn--active'), 'page 0 active initially');
assert.ok(!carousel._navButtons[1].classes.has('linux-island__section-btn--active'), 'page 1 inactive initially');
assert.ok(!carousel._navButtons[2].classes.has('linux-island__section-btn--active'), 'page 2 inactive initially');
assert.ok(!carousel._navButtons[3].classes.has('linux-island__section-btn--active'), 'page 3 inactive initially');

carousel._navButtons[1].handlers['clicked']();
assert.equal(carousel.currentPage, 1, 'clicking button 1 navigates to page 1');
assert.ok(carousel._navButtons[1].classes.has('linux-island__section-btn--active'), 'button 1 active');
assert.ok(!carousel._navButtons[0].classes.has('linux-island__section-btn--active'), 'button 0 inactive');
carousel._navButtons[2].handlers['clicked']();
assert.equal(carousel.currentPage, 2, 'clicking button 2 navigates to page 2');
assert.ok(carousel._navButtons[2].classes.has('linux-island__section-btn--active'), 'button 2 active');
assert.ok(!carousel._navButtons[0].classes.has('linux-island__section-btn--active'), 'button 0 inactive');
assert.ok(!carousel._navButtons[1].classes.has('linux-island__section-btn--active'), 'button 1 inactive');
carousel._navButtons[3].handlers['clicked']();
assert.equal(carousel.currentPage, 3, 'clicking button 3 navigates to the search page');
assert.ok(carousel._navButtons[3].classes.has('linux-island__section-btn--active'), 'button 3 active');
assert.ok(!carousel._navButtons[0].classes.has('linux-island__section-btn--active'), 'button 0 inactive');
assert.ok(!carousel._navButtons[1].classes.has('linux-island__section-btn--active'), 'button 1 inactive');
assert.ok(!carousel._navButtons[2].classes.has('linux-island__section-btn--active'), 'button 2 inactive');
assert.ok(capsule._mediaView._aiQuotaSection, 'AI quota section exists');
assert.equal(capsule._mediaView._aiQuotaSection.actor.children.length, 4, 'AI quota section has top bar + 3 provider rows');
assert.equal(capsule._mediaView._aiQuotaSection._topBar.children.length, 1, 'top bar has only AI Quota title');
assert.ok(capsule._mediaView._aiQuotaSection._antigravityRow._btn5h, 'row 5h button exists');
assert.ok(capsule._mediaView._aiQuotaSection._antigravityRow._btnWeekly, 'row weekly button exists');
assert.equal(capsule._mediaView._aiQuotaSection._antigravityRow._nameLabel.text, 'Antigravity');
assert.equal(capsule._mediaView._aiQuotaSection._codexRow._nameLabel.text, 'Codex');
assert.equal(capsule._mediaView._aiQuotaSection._claudeRow._nameLabel.text, 'Claude');
for (const row of [capsule._mediaView._aiQuotaSection._antigravityRow, capsule._mediaView._aiQuotaSection._codexRow, capsule._mediaView._aiQuotaSection._claudeRow]) {
    assert.doesNotMatch(row.actor.style, /#[0-9a-fA-F]{3,8}/, 'no inline hex color overrides on quota rows');
}

const search = capsule._mediaView._searchSection;
assert.ok(search, 'search section exists');
assert.equal(search._engine, 'google', 'search defaults to Google');
search._entry.set_text('linux island');
search._submit();
assert.equal(globalThis.renderTest.launchedUris.at(-1), 'https://www.google.com/search?q=linux%20island',
    'submitting the search opens the default browser');
assert.equal(search._entry.get_text(), '', 'search entry clears after a successful launch');

search._engineButtons.duckduckgo.handlers['clicked']();
assert.equal(search._engine, 'duckduckgo', 'engine chip switches the active engine');
assert.ok(search._engineButtons.duckduckgo.classes.has('linux-island__search-engine-btn--active'),
    'DuckDuckGo chip is active');
assert.ok(!search._engineButtons.google.classes.has('linux-island__search-engine-btn--active'),
    'Google chip is no longer active');

capsule.setSearchEngine('brave');
assert.equal(search._engine, 'brave', 'capsule pushes engine changes into the search page');
assert.ok(search._engineButtons.brave.classes.has('linux-island__search-engine-btn--active'),
    'Brave chip is active');
assert.ok(!search._engineButtons.duckduckgo.classes.has('linux-island__search-engine-btn--active'),
    'DuckDuckGo chip is no longer active');

// Companion subprocess launch and capsule handoff
{
    let subprocessArgs = null;
    let waitCallback = null;
    const signals = [];
    globalThis.renderTest.Gio.SubprocessFlags = {NONE: 0};
    globalThis.renderTest.Gio.Subprocess = class {
        constructor({argv}) {
            subprocessArgs = argv;
            this.signals = [];
        }
        init() {}
        wait_async(_cancellable, cb) {
            waitCallback = cb;
        }
        wait_finish() { return true; }
        send_signal(sig) { this.signals.push(sig); signals.push(sig); }
        force_exit() { this.forced = true; }
    };

    // Non-web URLs must never spawn a companion or open the browser. The
    // search entry percent-encodes its query into an https URL, so the
    // rejection boundary is _openSearch itself.
    const launchesBefore = globalThis.renderTest.launchedUris.length;
    const dismissals = [];
    capsule._onInteractionEvent = e => dismissals.push(e);
    for (const bad of ['javascript:alert(1)', 'file:///etc/passwd', 'data:text/html,x', '']) {
        capsule._mediaView._openSearch(bad);
    }
    assert.equal(subprocessArgs, null, 'invalid direct _openSearch never spawns a subprocess');
    assert.equal(globalThis.renderTest.launchedUris.length, launchesBefore,
        'invalid URL never reaches launch_default_for_uri');
    assert.deepEqual(dismissals, [], 'invalid URL dispatches no interaction events');

    search._entry.set_text('embedded companion query');
    search._submit();

    assert.ok(subprocessArgs, 'companion subprocess was created');
    assert.equal(subprocessArgs[1], '--companion', 'launched with --companion');
    assert.equal(subprocessArgs[2], 'https://search.brave.com/search?q=embedded%20companion%20query', 'correct encoded query passed');
    assert.ok(capsule._companionActive, 'capsule marks companion active');
    assert.equal(capsule._widget.visible, true, 'capsule widget remains visible as compact pill during companion session');
    assert.equal(capsule._currentState, 'COMPACT', 'capsule switches to compact pill mode');
    assert.deepEqual(dismissals, ['DISMISS'], 'companion start dispatches exactly one DISMISS');

    // Hover must not pop the capsule open over an active companion window.
    dismissals.length = 0;
    capsule._widget.hover = true;
    capsule._widget.handlers['notify::hover']();
    assert.deepEqual(dismissals, [], 'hover is ignored while the companion is active');
    capsule.restoreFromCompanion();
    capsule._widget.handlers['notify::hover']();
    assert.deepEqual(dismissals, ['HOVER_ENTER'], 'hover works again after the companion closes');

    // A second search must terminate the first companion rather than stacking
    // a second WebEngine process on top of it.
    const firstProc = capsule._mediaView._companionSubprocess;
    const firstWaitCallback = waitCallback;
    capsule._mediaView._openSearch('https://www.google.com/search?q=two');
    assert.deepEqual(firstProc.signals, [15], 'previous companion receives SIGTERM');
    assert.notEqual(capsule._mediaView._companionSubprocess, firstProc,
        'new companion subprocess replaces the old one');

    // The replaced process exiting late must not clear the new process state.
    const secondProc = capsule._mediaView._companionSubprocess;
    const secondWaitCallback = waitCallback;
    firstWaitCallback(null, {});
    assert.equal(capsule._mediaView._companionSubprocess, secondProc,
        'late exit of the replaced process leaves the new subprocess installed');
    assert.ok(capsule._companionActive, 'late exit does not mark the companion inactive');

    // Simulate companion window closing / process exit
    assert.ok(secondWaitCallback, 'wait callback registered');
    secondWaitCallback(null, {});
    assert.equal(capsule._mediaView._companionSubprocess, null, 'subprocess cleared on real exit');
    assert.equal(capsule._companionActive, false, 'companionActive cleared when companion exits');
    assert.equal(capsule._widget.visible, true, 'capsule widget remains visible after companion exits');
    // Verify clicking the compact pill while minimized dispatches CLICK and expands
    let lastEvent = null;
    capsule._onInteractionEvent = e => { lastEvent = e; };
    capsule._compactRow.handlers['button-press-event']();
    assert.equal(lastEvent, 'CLICK', 'clicking minimized pill dispatches CLICK');
    capsule.applyState('EXPANDED');
    assert.equal(capsule._currentState, 'EXPANDED', 'capsule expands on click');
    capsule.applyState('COMPACT');
    assert.equal(capsule._currentState, 'COMPACT', 'capsule stays in compact pill mode');
    delete globalThis.renderTest.Gio.Subprocess;
}


carousel._navButtons[0].handlers['clicked']();
assert.equal(carousel.currentPage, 0, 'clicking button 0 navigates to page 0');
assert.ok(carousel._navButtons[0].classes.has('linux-island__section-btn--active'), 'button 0 active again');
assert.ok(!carousel._navButtons[1].classes.has('linux-island__section-btn--active'), 'button 1 inactive again');
assert.ok(!carousel._navButtons[2].classes.has('linux-island__section-btn--active'), 'button 2 inactive again');
assert.equal(capsule._mediaView._mediaSection.children.length, 3, 'track, duration progress line, and controls rows in media section');
assert.ok(capsule._mediaView._mediaSection.children.includes(capsule._mediaView._progressTrack), 'duration line is restored in media section');
assert.equal(capsule._mediaView._systemSection.children.length, 3,
    'metrics, centred NET, and quick toggles in system section');
assert.equal(capsule._mediaView._systemSection.vertical, false, 'system section is horizontal');
assert.equal(capsule._mediaView._systemSection.children[0], capsule._mediaView._metricsSlot, 'metrics slot on the left');
assert.equal(capsule._mediaView._systemSection.children[1], capsule._mediaView._netView.actor, 'NET sits in the centre');
assert.equal(capsule._mediaView._systemSection.children[2], capsule._mediaView._togglesSlot, 'quick toggles slot on the right');
assert.equal(capsule._mediaView._metricsSlot.children[0], capsule._mediaView._metricsRow.actor, 'metrics row lives in the left slot');
assert.equal(capsule._mediaView._togglesSlot.children[0], capsule._mediaView._quickTogglesRow.actor, 'toggles live in the right slot');

// NET must be centred: equal side-slot widths, and no rounded container.
const netStyle = capsule._mediaView._netView.actor.style;
assert.doesNotMatch(netStyle, /border-radius/, 'NET has no rounded rectangle');
assert.doesNotMatch(netStyle, /background-color/, 'NET has no filled box');
assert.equal(capsule._mediaView._metricsSlot.width, capsule._mediaView._togglesSlot.width,
    'side slots share a width so NET lands on the centre line');
// The medium card measures 364px: MediaView's 328px content box plus 14px
// padding per side, wrapped by the expanded card's 2px padding/1.5px border.
// The System page must spend that whole 328px, otherwise its right column stops
// ~28px short of the card edge and the layout looks lopsided (left 26px vs
// right 54px in the reported screenshot).
assert.equal(capsule._mediaView._systemSection.width, 320,
    'system section content box spans the page minus its own 4px side padding');
assert.equal(capsule._mediaView._mediaSection.width, 328,
    'media section fills the same content box');
assert.equal(capsule._mediaView._metricsSlot.width + capsule._mediaView._netView.actor.width +
    capsule._mediaView._togglesSlot.width + 20, 320,
    'slots plus the two 10px gaps consume the full section content width');
assert.equal(capsule._mediaView._quickTogglesRow._storageIndicator.actor.width,
    capsule._mediaView._togglesSlot.width - 22 - 4,
    'storage block absorbs the extra width so icons reach the right edge');
// St.BoxLayout ignores x_align on its own main axis, so the right group must
// fill the slot; otherwise the icon column and disk readout drift toward the
// middle of the capsule instead of hugging its right side.
const togglesColumn = capsule._mediaView._quickTogglesRow.actor;
assert.equal(togglesColumn.x_expand, true, 'right group fills the right slot');
assert.match(togglesColumn.style,
    new RegExp(`width: ${capsule._mediaView._togglesSlot.width}px`),
    'right group is as wide as the right slot');
assert.equal(capsule._mediaView._quickTogglesRow._iconsBox.x_align, 2,
    'icon column hugs the right edge');
// The block gets an explicit width so disk + gap + icons fill the slot exactly;
// expansion is avoided because St.BoxLayout ignores x_align on its main axis.
assert.match(capsule._mediaView._quickTogglesRow._storageIndicator.actor.style,
    /width: \d+px/,
    'disk block has an explicit width so the slot divides exactly');
// The block centres each line as an actor. Pinning label widths made the text
// fill the block and render flush left, which is the reported "miring" bug.
assert.equal(capsule._mediaView._quickTogglesRow._storageIndicator._icon.x_align, 1,
    'disk glyph is centred');
assert.equal(capsule._mediaView._quickTogglesRow._storageIndicator._valueLabel.x_align, 1,
    'percentage label is centred as an actor');
assert.equal(capsule._mediaView._quickTogglesRow._storageIndicator._detailLabel.x_align, 1,
    'used/total label is centred as an actor');
assert.equal(capsule._mediaView._quickTogglesRow._storageIndicator.actor.vertical, true,
    'disk block stacks glyph, percentage and detail vertically');
assert.doesNotMatch(capsule._mediaView._quickTogglesRow._storageIndicator._valueLabel.style ?? '',
    /width:\s*\d+px/,
    'percentage label keeps its natural width so centring is meaningful');
assert.equal(capsule._mediaView._quickTogglesRow._iconsBox.children.length, 4,
    'quick settings form a single vertical column');
assert.deepEqual(capsule._mediaView._quickTogglesRow._iconsBox.children, [
    capsule._mediaView._quickTogglesRow._themeToggle.actor,
    capsule._mediaView._quickTogglesRow._dndToggle.actor,
    capsule._mediaView._quickTogglesRow._nightToggle.actor,
    capsule._mediaView._quickTogglesRow._settingsToggle.actor,
], 'Theme, DND, Night Light, Settings stacked in order');
const rightGroup = capsule._mediaView._quickTogglesRow.actor;
assert.equal(rightGroup.vertical, false, 'right group lays disk and icons out horizontally');
assert.equal(rightGroup.children[0],
    capsule._mediaView._quickTogglesRow._storageIndicator.actor,
    'disk readout sits first, directly right of NET');
assert.equal(rightGroup.children[1], capsule._mediaView._quickTogglesRow._iconsBox,
    'icon column sits second, against the capsule right edge');
assert.equal(rightGroup.children.length, 2,
    'no spacer widget: the disk block absorbs the leftover width');
assert.equal(rightGroup.children[0].x_expand, false,
    'disk block keeps an explicit width; the slot is divided exactly instead');
assert.equal(rightGroup.children[1].x_expand, false,
    'icon column keeps a fixed width so it stays on the right edge');
// The slot must divide exactly: disk + gap + icon column == slot width, so the
// icon column's right edge lands on the slot's right edge. If the disk block
// were narrower the icons would float left, which is the reported bug.
{
    const slot = capsule._mediaView._togglesSlot.width;
    const iconsW = capsule._mediaView._quickTogglesRow._iconsBox.width;
    const gap = 4;
    const diskW = slot - iconsW - gap;
    assert(diskW > 0, `disk block must keep positive width, got ${diskW}`);
    assert.equal(diskW + gap + iconsW, slot,
        'disk + gap + icons fills the right slot exactly');
    assert.match(capsule._mediaView._quickTogglesRow._storageIndicator.actor.style,
        new RegExp(`width: ${diskW}px`),
        'disk block owns exactly the leftover width');
}
// A 1px border used to add 2px per row (4*22 + 3*4 = 100px), so the fourth
// icon was clipped by the 98px section. Rows must be exactly 20px.
for (const toggle of [capsule._mediaView._quickTogglesRow._themeToggle,
    capsule._mediaView._quickTogglesRow._dndToggle,
    capsule._mediaView._quickTogglesRow._nightToggle,
    capsule._mediaView._quickTogglesRow._settingsToggle]) {
    assert.doesNotMatch(toggle.actor.style, /border:\s*[1-9]/,
        `${toggle._label} must have no border: 4 bordered rows overflow 98px`);
}
assert.match(capsule._mediaView._quickTogglesRow._iconsBox.style,
    /spacing: 4px/, 'icon column keeps the metric 4px gap');

const storageStyle = capsule._mediaView._quickTogglesRow._storageIndicator.actor.style;
assert.doesNotMatch(storageStyle, /border-radius/, 'storage tracker has no rounded rectangle');
assert.doesNotMatch(storageStyle, /background-color/, 'storage tracker has no filled box');
// Vertical rhythm of the disk block: 2px between glyph/percentage/detail and
// 3px padding above and below. setCapsuleSize() rewrites the style string, so
// this also guards against the padding being flattened on a resize.
assert.match(storageStyle, /spacing: 2px/, 'disk lines keep a 2px gap');
assert.match(storageStyle, /padding: 3px 0/, 'disk block keeps 3px top/bottom padding');
for (const size of ['small', 'medium', 'large']) {
    capsule.setCapsuleSize(size);
    const style = capsule._mediaView._quickTogglesRow._storageIndicator.actor.style;
    assert.match(style, /padding: 3px 0/, `disk padding survives ${size} resize`);
    assert.match(style, /spacing: 2px/, `disk line spacing survives ${size} resize`);
}
capsule.setCapsuleSize('medium');
for (const toggle of [capsule._mediaView._quickTogglesRow._themeToggle,
    capsule._mediaView._quickTogglesRow._dndToggle, capsule._mediaView._quickTogglesRow._nightToggle,
    capsule._mediaView._quickTogglesRow._settingsToggle]) {
    assert.equal(toggle._icon.icon_size, capsule._mediaView._metricsRow._cpuTile._icon.icon_size,
        'quick setting glyph matches metric icon size');
    assert.match(toggle.actor.style, /background-color: transparent/, 'no oversized circle behind quick setting icon');
    assert.match(toggle.actor.style, /border: 0/, 'no circle border around quick setting icon');
}
capsule._mediaView._carousel.setPage(1);
assert.ok(capsule._mediaView._systemSection.transitions.length > 0, 'page animates with horizontal slide transition');
assert.equal(capsule._mediaView._carousel._container.clip_to_allocation, true,
    'sliding music and controls must be clipped to the carousel viewport');
const systemPage = capsule._mediaView._systemSection;
const cancellations = systemPage.cancelled;
capsule._mediaView._carousel.setPage(0);
assert.ok(systemPage.cancelled > cancellations, 'switching back cancels the outgoing page tween');
assert.equal(systemPage.translation_x, 0, 'detached page has no lingering slide offset');
assert.equal(capsule._mediaView._quickTogglesRow._iconsBox.children.length, 4,
    'Quick controls stay a single vertical column');
assert.equal(capsule._mediaView._quickTogglesRow._iconsBox.children[3],
    capsule._mediaView._quickTogglesRow._settingsToggle.actor);
assert.equal(systemPage.opacity, 255, 'detached page has no lingering fade');

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
assert.equal(capsule._beatBars._bars[0].transitions.length, 1, 'one tween per actual audio update');
assert.notEqual(capsule._beatBars._bars[0].scaleBeforeEase, capsule._beatBars._bars[0].scale_y, 'animate from previous height');
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
capsule._widget.width = 180;
capsule._widget.height = 36;
capsule.applyState('EXPANDED');
assert.equal(capsule._compactRow.visible, false);
assert.equal(capsule._mediaView.actor.visible, true);
assert.equal(capsule._widget.transitions.at(-1).duration, 300);
assert.equal(capsule._widget.transitions.at(-1).width, 360, 'expand must tween width instead of snapping layout');
assert.equal(capsule._widget.transitions.at(-1).height, 184, 'expand must tween height');
assert.equal(capsule._widget.scaleBeforeEase, 1, 'opening does not reset scale and cause a pop');
assert.equal(capsule._mediaView.actor.transitions.at(-1).opacity, 255, 'incoming content fades in');
assert.equal(capsule._grabHelper.grabbed, true, 'expanded card owns dismissal grab');
capsule.applyState('COMPACT');
assert.equal(capsule._currentState, 'COMPACT');
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
const stageListenerId = capsule._outsideEventId;
const systemThemeSettings = capsule._systemSettings;
capsule.destroy();
assert.equal(Object.keys(systemThemeSettings.handlers).length, 0, 'theme listener removed');
assert.equal(stageHandlers.has(stageListenerId), false, 'destroy disconnects outside input listener');
assert.equal(widget.transitions.length, 0);
assert.equal(widget.destroyed, true);

// Verify that real extension state delivery wires connection and animation preferences.
const extensionSource = await readFile(new URL('../../extension/extension.js', import.meta.url), 'utf8');
const {default: Extension} = await load(`const Extension = class {};\n${extensionSource.replace(/^import .*;$/gm, '')}`);
const extension = new Extension();
extension._capsule = new Capsule();
extension._onCoreStateChanged({connected: true, media: {playerId: 'test', title: 'Recovered track'},
    settings: {animationEnabled: false, theme: 'dark', capsuleSize: 'large', verticalOffset: 32, horizontalOffset: 16}});
assert.equal(extension._capsule._verticalOffset, 32, 'Core verticalOffset reaches renderer');
assert.equal(extension._capsule._horizontalOffset, 16, 'Core horizontalOffset reaches renderer');
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
stage.emit({type: () => 3, get_key_symbol: () => 27});
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
GrabHelperDouble.failNext = false;
// Test that a click outside the expanded card triggers dismissal and releases grab
dismissEvents.length = 0;
outsideCard.applyState('EXPANDED');
const outsidePress = {
    type: () => globalThis.renderTest.Clutter.EventType.BUTTON_PRESS,
    get_coords: () => [50, 500],
};
assert.ok(stage.emit(outsidePress).every(result => result === 0), 'outside handler does not stop propagation');
assert.equal(outsideCard._currentState, 'COMPACT', 'outside click dismisses expanded island and ungrabs');
assert.equal(outsideCard._grabHelper.grabbed, false, 'stage outside clicks release modal input');
assert.deepEqual(dismissEvents, ['DISMISS']);
for (let attempt = 0; attempt < 10; attempt++) {
    outsideCard.applyState('EXPANDED');
    outsideCard._widget.get_transformed_size = () => [360, 184];
    const [x, y] = outsideCard._widget.position;
    stage.emit({type: () => 1, get_coords: () => [x + 1, y + 1]});
    assert.equal(outsideCard._currentState, 'EXPANDED', 'inside clicks keep Island open');
    stage.emit({type: () => 2, get_coords: () => [50, 500]});
    assert.equal(outsideCard._currentState, 'COMPACT', 'outside touch closes on repeated openings');
    assert.equal(outsideCard._grabHelper.grabbed, false);
}
const outsideListener = outsideCard._outsideEventId;
outsideCard.destroy();
assert.equal(stageHandlers.has(outsideListener), false, 'destroy removes stage capture');

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
assert.equal(timelineView._progressTrack.children[0], timelineView._progressFill, 'progress fill is child of track');
assert.deepEqual(timelineView._progressFill.pivot, [0, 0.5], 'progress fill pivot anchored to left edge');
assert.ok(timelineView._progressFill.transitions.length > 0, 'progress fill animates width from left to right');
const progressAnim = timelineView._progressFill.transitions[timelineView._progressFill.transitions.length - 1];
assert.equal(progressAnim.width, 30);
assert.equal(progressAnim.duration, 250);
assert.equal(timelineTicks.size, 1);
timelineNow += 5000000;
for (const fn of timelineTicks.values()) fn();
assert.equal(timelineView._elapsedLabel.text, '0:20');
timelineView.setMedia({...timelineMedia, audioLevels: [1, 0, 1]});
assert.equal(timelineView._elapsedLabel.text, '0:20', 'audio updates do not reset progress');
timelineView.setMedia({...timelineMedia, playbackStatus: 'Paused'});
assert.equal(timelineTicks.size, 0, 'pause cancels timeline timer');
// A seek changes position without changing track metadata or playback state.
const pausedMedia = {...timelineMedia, playbackStatus: 'Paused', canSeek: true};
timelineView.setMedia(pausedMedia);
timelineView.setMedia({...pausedMedia, positionUs: 70000000});
assert.equal(timelineView._elapsedLabel.text, '1:10', 'paused seek immediately updates elapsed time');
assert.equal(timelineView._progressFill.width, 140, 'paused seek immediately updates progress');
const seekActions = [];
timelineView._onControlAction = action => seekActions.push(action);
timelineView._progressTrack.transform_stage_point = () => [true, 50, 0];
timelineView._progressTrack.handlers['button-press-event'](timelineView._progressTrack, {
    get_coords: () => [350, 10],
});
assert.deepEqual(seekActions, ['SeekTo:25000000'], 'click seeks to local position on timeline');
assert.equal(timelineView._elapsedLabel.text, '0:25', 'click immediately previews selected time');
assert.deepEqual(pausedMedia.positionUs, 10000000, 'received snapshots remain unchanged');
// The current snapshot belongs to CoreProxy; optimistic preview must not mutate it.
const sharedSnapshot = {...pausedMedia};
timelineView.setMedia(sharedSnapshot);
assert.equal(timelineView._elapsedLabel.text, '0:25', 'stale snapshot does not roll back optimistic seek');
assert.equal(sharedSnapshot.positionUs, 10000000, 'seek does not mutate shared Core snapshot');

// Converged snapshot from player unlocks the timeline
timelineView.setMedia({...pausedMedia, positionUs: 25000000});
assert.equal(timelineView._elapsedLabel.text, '0:25', 'converged snapshot clears optimistic lock');
timelineView.setMedia({...pausedMedia, positionUs: 50000000});
assert.equal(timelineView._elapsedLabel.text, '0:50', 'external updates apply after lock clears');

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

// Keep tweens pending to exercise an actual mid-animation reversal.
const morph = new Capsule({idleTimeoutMs: 0});
const morphActor = morph._widget;
const starts = [];
morphActor.width = 180;
morphActor.height = 36;
morphActor.ease = function (params) {
    starts.push([this.width, this.height, this.scale_x, this.scale_y]);
    this.transitions.push(params);
};
morph.applyState('EXPANDED');
assert.deepEqual(starts[0], [180, 36, 1, 1], 'opening starts at displayed geometry');
morphActor.width = 250;
morphActor.height = 90;
morph.applyState('COMPACT');
assert.deepEqual(starts[1], [250, 90, 1, 1], 'reversal continues from the in-flight allocation');
assert.equal(morphActor.transitions.length, 1, 'reversal replaces the previous geometry tween');
morph.setAnimationEnabled(false);
assert.equal(morphActor.height, -1, 'reduced motion releases animated height');
assert.equal(morph._compactRow.opacity, 255, 'reduced motion completes content fade');
assert.equal(morph._compactRow.transitions.length, 0);
morph.destroy();

// Circle CSS must be released before measuring the pill, and quick hover
// reversals must replace child fades as well as the geometry tween.
const circleMorph = new Capsule({idleTimeoutMs: 0});
circleMorph.setAnimationEnabled(false);
circleMorph.setCapsuleSize('circle');
circleMorph.setAnimationEnabled(true);
const circleStarts = [];
circleMorph._widget.width = 36;
circleMorph._widget.height = 36;
circleMorph._widget.get_preferred_width = function () {
    return [36, /max-width: 36px/.test(this.style) ? 36 : 260];
};
circleMorph._widget.get_preferred_height = () => [36, 40];
circleMorph._widget.ease = function (params) {
    circleStarts.push({width: this.width, height: this.height, style: this.style, params});
    this.transitions.push(params);
};
circleMorph._label.ease = function (params) { this.transitions.push(params); };
circleMorph.applyState('PREVIEW');
assert.equal(circleStarts[0].width, 36, 'hover starts from the actual circle width');
assert.equal(circleStarts[0].params.width, 260, 'hover measures the unconstrained pill, not its circle row');
assert.doesNotMatch(circleStarts[0].style, /max-width: 36px/, 'circle size constraints are removed before tween');
assert.equal(circleStarts[0].params.duration, 300, 'circle hover uses emphasis timing');
circleMorph._widget.width = 130;
circleMorph._widget.height = 38;
circleMorph.applyState('COMPACT');
assert.equal(circleStarts.at(-1).width, 130, 'hover leave continues from current width');
assert.equal(circleMorph._widget.position[0], 618, 'shrinking stays centered at current width, not final circle width');
assert.doesNotMatch(circleStarts.at(-1).style, /max-width: 36px/, 'circle constraints apply only after shrinking');
assert.equal(circleMorph._widget.transitions.length, 1, 'one geometry tween after hover reversal');
assert.equal(circleMorph._label.transitions.length, 1, 'one child fade after hover reversal');
circleMorph._label.opacity = 110;
circleMorph.applyState('PREVIEW');
assert.equal(circleMorph._label.opacity, 110, 'hover reversal preserves the in-flight label opacity');
assert.equal(circleMorph._label.transitions.length, 1, 'return hover cancels the old hide callback');
const hoverStartCount = circleStarts.length;
circleMorph.applyState('PREVIEW');
assert.equal(circleStarts.length, hoverStartCount, 'repeated preview does not restart the tween');
assert.equal(circleMorph._widget.transitions.length, 1, 'repeated state delivery must not cancel the current morph');
circleMorph.setAnimationEnabled(false);
assert.equal(circleMorph._label.opacity, 255, 'reduced motion restores the visible label');
circleMorph.setAnimationEnabled(true);
circleMorph.applyState('COMPACT');
circleMorph.setAnimationEnabled(false);
assert.equal(circleMorph._label.visible, false, 'disabling motion completes pending circle label hide');
assert.equal(circleMorph._widget.classes.has('linux-island__capsule--circle'), true);
circleMorph.destroy();
const idleMorph = new Capsule({idleTimeoutMs: 0});
idleMorph.setAnimationEnabled(false);
idleMorph._enterIdleCircle();
idleMorph.setAnimationEnabled(true);
idleMorph._widget.width = 36;
idleMorph._widget.height = 36;
idleMorph._widget.ease = function (params) { this.transitions.push(params); };
idleMorph.applyState('PREVIEW');
idleMorph._widget.width = 100;
idleMorph.applyState('COMPACT');
assert.equal(idleMorph._widget.transitions.length, 1, 'leaving a waking idle circle must not freeze the partial pill');
assert.equal(idleMorph._widget.transitions[0].width, 360);
idleMorph.destroy();

// Idle 10s Circle Island & Media Thumbnail tests
const {Clutter} = globalThis.renderTest;
class MockScheduler {
    constructor() {
        this.timers = new Map();
        this.nextId = 0;
    }
    setTimeout(fn, ms) {
        const id = ++this.nextId;
        this.timers.set(id, {fn, ms});
        return id;
    }
    clearTimeout(id) {
        this.timers.delete(id);
    }
    advance(ms) {
        for (const [id, timer] of Array.from(this.timers.entries())) {
            timer.ms -= ms;
            if (timer.ms <= 0) {
                this.timers.delete(id);
                timer.fn();
            }
        }
    }
    get count() {
        return this.timers.size;
    }
}

const idleScheduler = new MockScheduler();
const interactionEvents = [];
const circleArtworkRequests = [];
const circleCapsule = new Capsule({
    scheduler: idleScheduler,
    artworkLoader: (uri, cancellable) =>
        new Promise(resolve => circleArtworkRequests.push({uri, cancellable, resolve})),
    onInteractionEvent: event => {
        interactionEvents.push(event);
        if (event === 'HOVER_ENTER') circleCapsule.applyState('PREVIEW');
        else if (event === 'HOVER_LEAVE') circleCapsule.applyState('COMPACT');
        else if (event === 'CLICK') circleCapsule.applyState('EXPANDED');
        else if (event === 'DISMISS') circleCapsule.applyState('COMPACT');
    },
    idleTimeoutMs: 10000,
});

// 1. Initial COMPACT starts as rectangle pill; after 10s idle without media transitions to circle
assert.equal(circleCapsule._currentState, 'COMPACT');
assert.equal(circleCapsule._isIdleCircle, false, 'initially pill is rectangle');
assert.equal(circleCapsule._widget.classes.has('linux-island__capsule--circle'), false);
assert.equal(circleCapsule._label.visible, true);
assert.equal(circleCapsule._icon.visible, true);
assert.equal(circleCapsule._icon.text, '🏝️');
assert.equal(circleCapsule._circleArtBox.visible, false);
assert.equal(idleScheduler.count, 1, 'initial 10s idle timer scheduled');

idleScheduler.advance(9999);
assert.equal(circleCapsule._isIdleCircle, false, 'stays rectangle at 9999ms');
idleScheduler.advance(1);
assert.equal(circleCapsule._isIdleCircle, true, 'transitions to circle after 10s idle');
assert.equal(circleCapsule._widget.classes.has('linux-island__capsule--circle'), true, 'has circle CSS class');
assert.match(circleCapsule._widget.style, /width: 36px/, 'circle widget width is 36px');
assert.match(circleCapsule._widget.style, /height: 36px/, 'circle widget height is 36px');
assert.equal(circleCapsule._label.visible, false, 'label hidden in circle mode');
assert.equal(circleCapsule._beatBars.actor.visible, false, 'beat bars hidden in circle mode');
assert.equal(circleCapsule._icon.visible, true, 'island icon visible');
assert.equal(circleCapsule._icon.text, '🏝️', 'island icon text is palm island');
assert.equal(circleCapsule._icon.x_expand, true, 'idle icon fills circle width for centered text');
assert.match(circleCapsule._icon.style, /width: 32px/, 'idle icon has bounded width inside circle');
assert.equal(circleCapsule._circleArtBox.visible, false, 'circle artwork box hidden when not playing');
assert.equal(circleCapsule._widget.position[0], 665, 'centered horizontally on screen for 36px circle');

// State changes can arrive from live preference updates, without a pointer
// notification. The renderer must leave circle layout for PREVIEW itself.
circleCapsule.applyState('PREVIEW');
assert.equal(circleCapsule._widget.classes.has('linux-island__capsule--circle'), false,
    'controller-driven preview must remove circle constraints');
assert.equal(circleCapsule._label.visible, true, 'preview must restore the track label');
circleCapsule.applyState('COMPACT');
idleScheduler.advance(10000);

// 3. Hovering the circle wakes it from circle mode and triggers PREVIEW
interactionEvents.length = 0;
circleCapsule._widget.hover = true;
circleCapsule._widget.handlers['notify::hover']();
assert.equal(circleCapsule._isIdleCircle, false, 'hover exits circle mode immediately');
assert.equal(circleCapsule._widget.classes.has('linux-island__capsule--circle'), false);
assert.equal(circleCapsule._label.visible, true);
const hoverTransition = circleCapsule._widget.transitions.find(t => t.duration === 300 && t.width > 36);
assert.ok(hoverTransition, 'hover transition animates width expansion');
assert.equal(hoverTransition.duration, 300);
assert.equal(hoverTransition.mode, globalThis.renderTest.Clutter.AnimationMode.EASE_IN_OUT_CUBIC);
assert.equal(hoverTransition.width, 360);
assert.equal(circleCapsule._widget.position[0], 503, 'pill stays centered using its actual width');
assert.deepEqual(interactionEvents, ['HOVER_ENTER']);
assert.equal(circleCapsule._currentState, 'PREVIEW');
// 4. Pointer leaving preview returns to COMPACT and restarts 10s timer
interactionEvents.length = 0;
circleCapsule._widget.hover = false;
circleCapsule._widget.handlers['notify::hover']();
assert.deepEqual(interactionEvents, ['HOVER_LEAVE']);
assert.equal(circleCapsule._currentState, 'COMPACT');
assert.equal(circleCapsule._isIdleCircle, false);
assert.equal(idleScheduler.count, 1, 'idle timer rescheduled after leaving PREVIEW');

// 5. Clicking the circle wakes it from circle mode and triggers EXPANDED
idleScheduler.advance(10000);
assert.equal(circleCapsule._isIdleCircle, true, 're-entered circle mode after 10s');
interactionEvents.length = 0;
circleCapsule._compactRow.handlers['button-press-event']();
assert.equal(circleCapsule._isIdleCircle, false, 'clicking exits circle mode');
assert.equal(circleCapsule._widget.classes.has('linux-island__capsule--circle'), false);
assert.deepEqual(interactionEvents, ['CLICK']);
assert.equal(circleCapsule._currentState, 'EXPANDED');
assert.equal(idleScheduler.count, 0, 'idle timer stopped while EXPANDED');
// A drag starts with a press, including presses picked on the card background.
// Bubble that press to the capsule before delivering horizontal motion.
interactionEvents.length = 0;
const swipeCarousel = circleCapsule._mediaView._carousel;
for (const source of [circleCapsule._widget, swipeCarousel.actor, null]) {
    const startPage = swipeCarousel.currentPage;
    const press = {get_button: () => 1, get_coords: () => [100, 100]};
    if (source) press.get_source = () => source;
    swipeCarousel.actor.handlers['button-press-event'](swipeCarousel.actor, press);
    const result = circleCapsule._widget.handlers['button-press-event'](circleCapsule._widget, press);
    assert.equal(result, Clutter.EVENT_PROPAGATE, 'expanded press must allow swipe');
    assert.equal(circleCapsule._currentState, 'EXPANDED', 'drag start must not dismiss');
    swipeCarousel.actor.handlers['motion-event'](swipeCarousel.actor, {get_coords: () => [50, 100]});
    assert.notEqual(swipeCarousel.currentPage, startPage, 'left drag switches page');
    swipeCarousel.actor.handlers['button-release-event']();
    swipeCarousel.actor.handlers['button-press-event'](swipeCarousel.actor, press);
    circleCapsule._widget.handlers['button-press-event'](circleCapsule._widget, press);
    swipeCarousel.actor.handlers['motion-event'](swipeCarousel.actor, {get_coords: () => [150, 100]});
    assert.equal(swipeCarousel.currentPage, startPage, 'right drag switches back');
    swipeCarousel.actor.handlers['button-release-event']();
}
assert.deepEqual(interactionEvents, [], 'swiping never dispatches dismissal');
assert.equal(idleScheduler.count, 0, 'idle collapse timer stays stopped during swipe');

// Regression tests: hovering and clicking controls must not trigger accidental page swipes
const navBtn = swipeCarousel._navButtons[0];
const navPress = {get_button: () => 1, get_coords: () => [100, 100], get_source: () => navBtn};
swipeCarousel.actor.handlers['button-press-event'](swipeCarousel.actor, navPress);
swipeCarousel.actor.handlers['motion-event'](swipeCarousel.actor, {get_coords: () => [30, 100]});
assert.equal(swipeCarousel.currentPage, 0, 'motion after clicking nav button must not swipe');

swipeCarousel.actor.handlers['button-release-event']();
swipeCarousel.actor.handlers['motion-event'](swipeCarousel.actor, {get_coords: () => [10, 100]});
assert.equal(swipeCarousel.currentPage, 0, 'hover motion without press must not swipe');

const scrollDown = {get_scroll_direction: () => 0 /* UP */};
const scrollRes = swipeCarousel.actor.handlers['scroll-event'](swipeCarousel.actor, scrollDown);
assert.equal(scrollRes, Clutter.EVENT_PROPAGATE, 'vertical scroll propagates without page switch');
assert.equal(swipeCarousel.currentPage, 0, 'vertical scroll does not change carousel page');

const bgPress = {get_button: () => 1, get_coords: () => [100, 100], get_source: () => swipeCarousel.actor};
swipeCarousel.actor.handlers['button-press-event'](swipeCarousel.actor, bgPress);
swipeCarousel.actor.handlers['leave-event']();
swipeCarousel.actor.handlers['motion-event'](swipeCarousel.actor, {get_coords: () => [10, 100]});
assert.equal(swipeCarousel.currentPage, 0, 'motion after pointer leaves actor must not swipe');

// Circle/pill width animations set an explicit Clutter width. Expansion must
// release that request so the wider media card receives its natural allocation.
assert.equal(circleCapsule._widget.width, -1,
    'expanded card must release the animated pill width instead of squeezing its contents');
circleCapsule.setCapsuleSize('large');
assert.equal(circleCapsule._widget.width, -1, 'resizing expanded card keeps natural width');
circleCapsule.setCapsuleSize('medium');

// 6. Escape / dismissal of EXPANDED returns to COMPACT and restarts 10s timer
circleCapsule._widget.handlers['key-press-event'](circleCapsule._widget, {get_key_symbol: () => Clutter.KEY_Escape});
assert.equal(circleCapsule._currentState, 'COMPACT');
assert.equal(circleCapsule._isIdleCircle, false);
assert.equal(idleScheduler.count, 1, 'idle timer restarted after dismissal of EXPANDED');

// WhatsApp notification activity dot and expanded action
let waActivated = false;
const waCapsule = new Capsule({
    onWhatsAppActivate: () => { waActivated = true; },
});
assert.ok(waCapsule._waDot, 'activity dot exists in compact row');
assert.ok(waCapsule._waActionRow, 'action row exists in card');
assert.equal(waCapsule._waDot.visible, false);
assert.equal(waCapsule._waActionRow.visible, false);

waCapsule.setWhatsAppActivity(true);
assert.equal(waCapsule._waDot.visible, false, 'activity without opt-in remains hidden');

waCapsule.setWhatsAppEnabled(true);
waCapsule.setWhatsAppActivity(true);
assert.equal(waCapsule._waDot.visible, true, 'dot visible in compact mode');
assert.equal(waCapsule._waActionRow.visible, false);

waCapsule.applyState('EXPANDED');
assert.equal(waCapsule._waDot.visible, false, 'dot hidden in expanded mode');
assert.equal(waCapsule._waActionRow.visible, true, 'action row visible in expanded mode');

waCapsule._waBtn.handlers['clicked']();
assert.equal(waActivated, true, 'clicking action invokes onWhatsAppActivate');
assert.equal(waCapsule._waActionRow.visible, false, 'activating clears action row');
assert.equal(waCapsule._waDot.visible, false, 'activating clears dot');

waCapsule.destroy();

// 2. When media with playbackStatus: 'Playing' is active, after 10s idle transitions to circle displaying music thumbnail artwork
circleCapsule.setMedia({
    playerId: 'spotify',
    title: 'Midnight City',
    playbackStatus: 'Playing',
    albumArtUri: 'file:///home/user/art.png',
});
assert.equal(circleCapsule._isIdleCircle, false);
assert.equal(circleCapsule._icon.text, '🎵');
idleScheduler.advance(10000);
assert.equal(circleCapsule._isIdleCircle, true, 'entered circle mode with active music');
assert.equal(circleCapsule._icon.visible, false, 'island icon hidden when playing');
assert.equal(circleCapsule._circleArtBox.visible, true, 'circle artwork thumbnail box visible');
assert.equal(circleArtworkRequests.length, 1);
assert.equal(circleArtworkRequests[0].uri, 'file:///home/user/art.png');
const mockGIcon = {get_file: () => ({get_uri: () => 'file:///home/user/art.png'})};
circleArtworkRequests[0].resolve(mockGIcon);
await Promise.resolve();
assert.equal(circleCapsule._circleArtIcon.visible, false, 'square icon must not cover rounded background');
assert.match(circleCapsule._circleArtBox.style, /background-image: url/, 'vetted artwork paints on rounded background');

// 7. Continuous audioLevels updates do not reset the idle timer or knock capsule out of circle mode
circleCapsule.setMedia({
    playerId: 'spotify',
    title: 'Midnight City',
    playbackStatus: 'Playing',
    albumArtUri: 'file:///home/user/art.png',
    audioLevels: [0.3, 0.6, 0.9],
});
assert.equal(circleCapsule._isIdleCircle, true, 'continuous audio levels keep capsule in circle mode');
assert.equal(circleCapsule._circleArtBox.visible, true);
assert.equal(circleCapsule._beatBars.actor.visible, false, 'beat bars remain hidden in circle mode');

// Verify audio levels do not reset the idle timer before entering circle mode
circleCapsule._widget.hover = true;
circleCapsule._widget.handlers['notify::hover']();
circleCapsule._widget.hover = false;
circleCapsule._widget.handlers['notify::hover']();
assert.equal(circleCapsule._isIdleCircle, false, 'woken up to rectangle');
idleScheduler.advance(5000);
circleCapsule.setMedia({
    playerId: 'spotify',
    title: 'Midnight City',
    playbackStatus: 'Playing',
    albumArtUri: 'file:///home/user/art.png',
    audioLevels: [0.4, 0.7, 0.2],
});
assert.equal(circleCapsule._isIdleCircle, false, 'halfway through idle timer');
idleScheduler.advance(5000);
assert.equal(circleCapsule._isIdleCircle, true, 'audio levels did not delay 10s circle transition');

// 8. Pausing music while in circle mode updates the circle to display '🏝️'
circleCapsule.setMedia({
    playerId: 'spotify',
    title: 'Midnight City',
    playbackStatus: 'Paused',
    albumArtUri: 'file:///home/user/art.png',
});
assert.equal(circleCapsule._isIdleCircle, true, 'pausing music keeps capsule in circle mode');
assert.equal(circleCapsule._circleArtBox.visible, false, 'thumbnail hidden when paused');
assert.equal(circleCapsule._icon.visible, true, 'island icon visible when paused');
assert.equal(circleCapsule._icon.text, '🏝️', 'island icon displays palm tree');

// Resuming music restores thumbnail
circleCapsule.setMedia({
    playerId: 'spotify',
    title: 'Midnight City',
    playbackStatus: 'Playing',
    albumArtUri: 'file:///home/user/art.png',
});
assert.equal(circleCapsule._isIdleCircle, true);
assert.equal(circleCapsule._circleArtBox.visible, true, 'thumbnail restored on resume');
assert.equal(circleCapsule._icon.visible, false);

// 9. Circle mode setting and hover transitions
circleCapsule.setCapsuleSize('circle');
assert.equal(circleCapsule._capsuleSize, 'circle');
assert.equal(circleCapsule._isCircleMode(), true, 'capsuleSize circle enters circle mode in COMPACT');
assert.equal(circleCapsule._isIdleCircle, true);
assert.equal(circleCapsule._widget.classes.has('linux-island__capsule--circle'), true);
assert.equal(idleScheduler.count, 0, 'no idle timer scheduled when capsuleSize is circle');

// Hovering circle preset expands to pill
interactionEvents.length = 0;
circleCapsule._widget.hover = true;
circleCapsule._widget.handlers['notify::hover']();
assert.equal(circleCapsule._isIdleCircle, false, 'hover exits circle mode');
assert.equal(circleCapsule._widget.classes.has('linux-island__capsule--circle'), false);
const circlePresetHoverExpand = circleCapsule._widget.transitions.find(t => t.duration === 300 && t.width > 36);
assert.ok(circlePresetHoverExpand, 'circle preset hover triggers width expansion transition');
assert.equal(circlePresetHoverExpand.width, 360);

// Hover leave collapses back to circle with animation
interactionEvents.length = 0;
circleCapsule._widget.hover = false;
circleCapsule._widget.handlers['notify::hover']();
const circlePresetHoverCollapse = circleCapsule._widget.transitions.find(t => t.duration === 300 && t.width === 36);
assert.ok(circlePresetHoverCollapse, 'circle preset hover leave triggers collapse transition');
assert.equal(circlePresetHoverCollapse.width, 36);
assert.equal(circlePresetHoverCollapse.duration, 300);
assert.equal(circlePresetHoverCollapse.mode, globalThis.renderTest.Clutter.AnimationMode.EASE_IN_OUT_CUBIC);
assert.equal(circleCapsule._isIdleCircle, true);
assert.equal(circleCapsule._widget.classes.has('linux-island__capsule--circle'), true);
assert.equal(idleScheduler.count, 0, 'idle timer not started when capsuleSize is circle');

// Disabling animations performs instant resize without queuing transitions
circleCapsule.setAnimationEnabled(false);
circleCapsule._widget.transitions = [];
circleCapsule._widget.hover = true;
circleCapsule._widget.handlers['notify::hover']();
assert.equal(circleCapsule._widget.transitions.length, 0, 'no transitions queued when animation is disabled');
assert.equal(circleCapsule._isIdleCircle, false);
assert.equal(circleCapsule._widget.classes.has('linux-island__capsule--circle'), false);

// Hover leave with animation disabled
circleCapsule._widget.transitions = [];
circleCapsule._widget.hover = false;
circleCapsule._widget.handlers['notify::hover']();
assert.equal(circleCapsule._widget.transitions.length, 0, 'no transitions queued on collapse when animation disabled');
assert.equal(circleCapsule._isIdleCircle, true);
assert.equal(circleCapsule._widget.classes.has('linux-island__capsule--circle'), true);

// Re-enable animation and restore medium capsule size
circleCapsule.setAnimationEnabled(true);
circleCapsule.setCapsuleSize('medium');
assert.equal(circleCapsule._isIdleCircle, false);
assert.equal(circleCapsule._widget.classes.has('linux-island__capsule--circle'), false);
assert.equal(idleScheduler.count, 1, 'idle timer restored after exiting circle size');
idleScheduler.advance(10000);
assert.equal(circleCapsule._isIdleCircle, true, 're-entered circle mode for destroy test');
assert.equal(circleCapsule._circleArtBox.visible, true);

// 10. Destroy clears pending timers and cancels pending artwork loaders
circleCapsule.setMedia({
    playerId: 'spotify',
    title: 'New Track',
    playbackStatus: 'Playing',
    albumArtUri: 'file:///home/user/art2.png',
});
assert.equal(circleArtworkRequests.length, 2);
const pendingCancellable = circleArtworkRequests[1].cancellable;
assert.equal(pendingCancellable.cancelled, undefined);
assert.ok(idleScheduler.count >= 0);
circleCapsule.destroy();
assert.equal(idleScheduler.count, 0, 'destroy clears pending idle timer');
assert.equal(pendingCancellable.cancelled, true, 'destroy cancels pending artwork loader');
assert.equal(circleCapsule._circleArtIcon, null);
assert.equal(circleCapsule._circleArtBox, null);
console.log('PASS: media rendering, offline recovery, interrupted transitions, reduced motion, fullscreen and cleanup');
