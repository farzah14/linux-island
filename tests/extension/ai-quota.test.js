import {
    formatResetCountdown,
    normalizeWindowLabel,
    parseOmpUsageCache,
    parseCodexSessionJsonl,
    parseNineRouterUsage,
    buildAiQuotaSnapshot,
    AiQuotaCollector,
    applySnapshotStatus,
} from '../../extension/lib/aiQuota.js';

function assert(condition, message = 'Assertion failed') {
    if (!condition) throw new Error(message);
}

function assertEqual(actual, expected, message) {
    if (actual !== expected) {
        throw new Error(`${message ? message + ': ' : ''}expected ${expected}, got ${actual}`);
    }
}

const NOW = 1793169738000;

// 1. formatResetCountdown
{
    assertEqual(formatResetCountdown(undefined, NOW), '', 'undefined resetsAt should return empty string');
    assertEqual(formatResetCountdown(null, NOW), '', 'null resetsAt should return empty string');
    assertEqual(formatResetCountdown(-100, NOW), '', 'negative resetsAt should return empty string');
    assertEqual(formatResetCountdown(0, NOW), '', '0 resetsAt should return empty string');
    assertEqual(formatResetCountdown(NOW, NOW), 'now', 'exact now returns now');
    assertEqual(formatResetCountdown(NOW - 5000, NOW), 'now', 'past resetsAt returns now');
    assertEqual(formatResetCountdown(NOW + 30000, NOW), '1m', 'under 1 min returns 1m');
    assertEqual(formatResetCountdown(NOW + 45 * 60000, NOW), '45m', '45 min returns 45m');
    assertEqual(formatResetCountdown(NOW + (4 * 3600 + 15 * 60) * 1000, NOW), '4h 15m', '4h 15m returns 4h 15m');
    assertEqual(formatResetCountdown(NOW + (3 * 86400 + 18 * 3600) * 1000, NOW), '3d 18h', '3d 18h returns 3d 18h');
}

// 2. normalizeWindowLabel
{
    assertEqual(normalizeWindowLabel('5 Hour', 18000000), '5h', '5 Hour duration maps to 5h');
    assertEqual(normalizeWindowLabel('5h'), '5h', '5h string maps to 5h');
    assertEqual(normalizeWindowLabel('Weekly', 604800000), '7d', 'Weekly duration maps to 7d');
    assertEqual(normalizeWindowLabel('7d'), '7d', '7d maps to 7d');
    assertEqual(normalizeWindowLabel('30 days', 2592000000), '30d', '30 days duration maps to 30d');
    assertEqual(normalizeWindowLabel('30d'), '30d', '30d string maps to 30d');
    assertEqual(normalizeWindowLabel('gemini-argon-wtu-weekly'), 'Argon 7d', 'argon maps to Argon 7d');
    assertEqual(normalizeWindowLabel('custom-window'), 'custom-window', 'preserves custom labels');
    assertEqual(normalizeWindowLabel(''), 'Quota', 'empty label defaults to Quota');
}

// 3. parseOmpUsageCache
{
    const mockCache = [
        {
            value: {
                provider: 'google-antigravity',
                limits: [
                    {
                        id: 'google-antigravity:google:default:gemini-5h',
                        label: 'Gemini',
                        window: { id: '5h', label: '5 Hour', durationMs: 18000000, resetsAt: NOW + 18000000 },
                        amount: { remainingFraction: 1, usedFraction: 0, limit: 100 },
                    },
                    {
                        id: 'google-antigravity:google:default:gemini-weekly',
                        label: 'Gemini',
                        window: { id: 'weekly', label: 'Weekly', durationMs: 604800000, resetsAt: NOW + 300000000 },
                        amount: { remainingFraction: 0.778, usedFraction: 0.222, limit: 100 },
                    },
                    {
                        id: 'google-antigravity:google:default:gemini-argon-wtu-weekly',
                        label: 'Gemini (Argon)',
                        window: { id: 'weekly', label: 'Weekly', durationMs: 604800000, resetsAt: NOW + 400000000 },
                        amount: { remainingFraction: 0.972, usedFraction: 0.028, limit: 100 },
                    },
                    {
                        id: 'google-antigravity:anthropic:default:3p-weekly',
                        label: 'Claude & GPT (shared)',
                        window: { id: 'weekly', label: 'Weekly', durationMs: 604800000, resetsAt: NOW + 500000000 },
                        amount: { remainingFraction: 1, usedFraction: 0, limit: 100 },
                    },
                    {
                        id: 'google-antigravity:anthropic:default:3p-5h',
                        label: 'Claude & GPT (shared)',
                        window: { id: '5h', label: '5 Hour', durationMs: 18000000, resetsAt: NOW + 18000000 },
                        amount: { remainingFraction: 1, usedFraction: 0, limit: 100 },
                    },
                ],
            },
        },
        {
            value: {
                provider: 'openai-codex',
                limits: [
                    {
                        id: 'openai-codex:primary',
                        label: '30 days',
                        window: { id: '30d', label: '30 days', durationMs: 2592000000, resetsAt: NOW + 1500000000 },
                        amount: { used: 30, limit: 100, remaining: 70, remainingFraction: 0.7 },
                    },
                ],
            },
        },
    ];

    const parsed = parseOmpUsageCache(mockCache, NOW);
    assertEqual(parsed.antigravity.geminiLimits.length, 3, '3 gemini limits parsed');
    assertEqual(parsed.antigravity.geminiLimits[0].window, '5h');
    assertEqual(parsed.antigravity.geminiLimits[0].remainingPercent, 100);
    assertEqual(parsed.antigravity.geminiLimits[1].window, '7d');
    assertEqual(parsed.antigravity.geminiLimits[1].remainingPercent, 78);
    assertEqual(parsed.antigravity.geminiLimits[2].window, 'Argon 7d');
    assertEqual(parsed.antigravity.geminiLimits[2].remainingPercent, 97);

    assertEqual(parsed.antigravity.sharedLimits.length, 2, '2 shared 3P limits parsed');
    assertEqual(parsed.codex.limits.length, 1, '1 codex limit parsed');
    assertEqual(parsed.codex.limits[0].remainingPercent, 70);
    assertEqual(parsed.codex.limits[0].window, '30d');
}

// 4. parseCodexSessionJsonl
{
    const jsonlContent = [
        '{"type":"init","payload":{}}',
        JSON.stringify({
            timestamp: '2026-10-27T16:02:39.583Z',
            type: 'event_msg',
            payload: {
                type: 'token_count',
                rate_limits: {
                    limit_id: 'codex',
                    primary: { used_percent: 0.0, window_minutes: 300, resets_at: Math.floor((NOW + 15000000) / 1000) },
                    secondary: { used_percent: 27.0, window_minutes: 10080, resets_at: Math.floor((NOW + 340000000) / 1000) },
                },
            },
        }),
        '{"type":"footer","payload":{}}',
    ].join('\n');

    const parsed = parseCodexSessionJsonl(jsonlContent, NOW);
    assert(parsed, 'parsed token_count line');
    assertEqual(parsed.primary.window, '5h');
    assertEqual(parsed.primary.remainingPercent, 100);
    assertEqual(parsed.primary.usedPercent, 0);
    assertEqual(parsed.secondary.window, '7d');
    assertEqual(parsed.secondary.remainingPercent, 73);
    assertEqual(parsed.secondary.usedPercent, 27);
}

// 5. parseNineRouterUsage
{
    const nineRouterMock = {
        antigravity: {
            quotas: [
                { id: 'gemini-5h', displayName: '5h', remainingPercentage: 85, resetAt: NOW + 10000000 },
            ],
        },
        codex: {
            quotas: [
                { id: 'codex-weekly', displayName: '7d', remaining: 40, total: 50, resetAt: NOW + 200000000 },
            ],
        },
        claude: {
            quotas: [
                { id: 'claude-sonnet', displayName: '5h', used: 10, total: 100, resetAt: NOW + 8000000 },
            ],
        },
    };

    const res = parseNineRouterUsage(nineRouterMock, NOW);
    assertEqual(res.antigravity[0].remainingPercent, 85);
    assertEqual(res.codex[0].remainingPercent, 80);
    assertEqual(res.claude[0].remainingPercent, 90);
}

// 6. buildAiQuotaSnapshot
{
    // Antigravity & Codex combined snapshot
    const snap = buildAiQuotaSnapshot({
        ompCache: [
            {
                value: {
                    provider: 'google-antigravity',
                    limits: [
                        { id: 'gemini-5h', window: { durationMs: 18000000, resetsAt: NOW + 18000000 }, amount: { remainingFraction: 1 } },
                        { id: 'gemini-weekly', window: { durationMs: 604800000, resetsAt: NOW + 310000000 }, amount: { remainingFraction: 0.778 } },
                        { id: 'gemini-argon-wtu-weekly', window: { durationMs: 604800000, resetsAt: NOW + 410000000 }, amount: { remainingFraction: 0.972 } },
                        { id: '3p-weekly', window: { durationMs: 604800000, resetsAt: NOW + 510000000 }, amount: { remainingFraction: 1 } },
                        { id: '3p-5h', window: { durationMs: 18000000, resetsAt: NOW + 18000000 }, amount: { remainingFraction: 1 } },
                    ],
                },
            },
            {
                value: {
                    provider: 'openai-codex',
                    limits: [
                        { id: 'primary', window: { durationMs: 2592000000, resetsAt: NOW + 1728000000 }, amount: { remainingFraction: 0.7 } },
                    ],
                },
            },
        ],
        codexRateLimits: {
            primary: { used_percent: 0.0, window_minutes: 300, resets_at: Math.floor((NOW + 18000000) / 1000) },
            secondary: { used_percent: 27.0, window_minutes: 10080, resets_at: Math.floor((NOW + 310000000) / 1000) },
        },
    }, NOW);

    // Antigravity checks
    assertEqual(snap.antigravity.connected, true);
    assertEqual(snap.antigravity.remainingPercent, 78, 'Antigravity bottleneck remainingPercent is 78');
    assertEqual(snap.antigravity.primaryText, '78% left');
    assert(snap.antigravity.detailText.includes('5h 100%'), 'includes 5h window');
    assert(snap.antigravity.detailText.includes('7d 78%'), 'includes 7d window');
    assert(snap.antigravity.detailText.includes('Arg 97%'), 'includes Argon window');
    assert(snap.antigravity.detailText.includes('↻ 5h'), 'includes earliest reset countdown');
    assert(snap.antigravity.altDetailText.includes('Gemini 7d: 78% left (22% used)'), 'alt detail shows bottleneck');

    // Codex checks
    assertEqual(snap.codex.connected, true);
    assertEqual(snap.codex.remainingPercent, 70, 'Codex bottleneck remainingPercent is 70');
    assertEqual(snap.codex.primaryText, '70% left');
    assert(snap.codex.detailText.includes('5h 100%'), 'includes 5h window');
    assert(snap.codex.detailText.includes('7d 73%'), 'includes 7d window');
    assert(snap.codex.detailText.includes('30d 70%'), 'includes 30d window');
    assert(snap.codex.altDetailText.includes('30d: 70% left (30% used)'), 'codex alt detail shows bottleneck');

    // Claude checks: Fallback to Antigravity shared Claude
    assertEqual(snap.claude.connected, true);
    assertEqual(snap.claude.source, 'antigravity-shared');
    assertEqual(snap.claude.remainingPercent, 100);
    assertEqual(snap.claude.primaryText, '100% left');
    assert(snap.claude.detailText.includes('(AGY)'), 'detail text has (AGY) suffix');
    assert(snap.claude.detailText.includes('5h 100%'), 'includes 5h window');
    assert(snap.claude.detailText.includes('7d 100%'), 'includes 7d window');
    // Device-synced Codex test: strictly uses device account
    const snapDevice = buildAiQuotaSnapshot({
        deviceCodex: {
            source: 'device-online',
            email: 'i8hivwuti@mozmail.com',
            plan: 'k12',
            primary: { used_percent: 0, window_minutes: 300, resets_at: NOW + 18000000 },
            secondary: { used_percent: 29, window_minutes: 10080, resets_at: NOW + 310000000 },
        },
        ompCache: [
            {
                value: {
                    provider: 'openai-codex',
                    limits: [{ id: 'primary', window: { durationMs: 2592000000 }, amount: { remainingFraction: 0.5 } }],
                },
            },
        ],
    }, NOW);
    assertEqual(snapDevice.codex.connected, true);
    assertEqual(snapDevice.codex.remainingPercent, 71, 'strictly uses device Codex rate limits');
    assertEqual(snapDevice.codex.windows.length, 2, 'does not mix unrelated account 30d quota');
    assert(snapDevice.codex.altDetailText.includes('i8hivwuti@mozmail.com'), 'includes device account email in alt detail');


    // Claude priority 1: Standalone Claude
    const snapStandalone = buildAiQuotaSnapshot({
        ompCache: [
            {
                value: {
                    provider: 'claude',
                    limits: [
                        { id: 'claude-5h', window: { durationMs: 18000000, resetsAt: NOW + 10000000 }, amount: { remainingFraction: 0.65 } },
                    ],
                },
            },
        ],
    }, NOW);
    assertEqual(snapStandalone.claude.connected, true);
    assertEqual(snapStandalone.claude.source, 'standalone');
    assertEqual(snapStandalone.claude.remainingPercent, 65);
    assertEqual(snapStandalone.claude.primaryText, '65% left');
    assert(!snapStandalone.claude.detailText.includes('(AGY)'), 'standalone has no (AGY) suffix');

    // Claude priority 3: Local CLI installed without active session
    const snapLocal = buildAiQuotaSnapshot({
        claudeLocal: { installed: true },
    }, NOW);
    assertEqual(snapLocal.claude.connected, true);
    assertEqual(snapLocal.claude.source, 'local-installed');
    assertEqual(snapLocal.claude.primaryText, 'Ready');
    assertEqual(snapLocal.claude.detailText, 'Claude Code CLI installed · no active lock');

    // Offline snapshot
    const snapOffline = buildAiQuotaSnapshot({}, NOW);
    assertEqual(snapOffline.antigravity.connected, false);
    assertEqual(snapOffline.antigravity.primaryText, 'Offline');
    assertEqual(snapOffline.codex.connected, false);
    assertEqual(snapOffline.codex.primaryText, 'Offline');
    assertEqual(snapOffline.claude.connected, false);
    assertEqual(snapOffline.claude.primaryText, 'Offline');
}

// 7. AiQuotaCollector tests
{
    let probeCalls = 0;
    const collector = new AiQuotaCollector({
        probeRunner: () => {
            probeCalls++;
            return {
                ompCache: [
                    {
                        value: {
                            provider: 'google-antigravity',
                            limits: [
                                { id: 'gemini-5h', window: { durationMs: 18000000 }, amount: { remainingFraction: 0.9 } },
                            ],
                        },
                    },
                ],
            };
        },
        now: () => NOW,
    });

    const snap = collector.collect();
    assertEqual(probeCalls, 1, 'collect calls probeRunner');
    assertEqual(snap.antigravity.remainingPercent, 90);
    assertEqual(collector.lastSnapshot.antigravity.remainingPercent, 90);
}

// 8. AiQuotaProviderRow & AiQuotaSection presentation tests with double actors
{
    // Lightweight St/Clutter doubles
    class MockActor {
        constructor(props = {}) {
            this.props = props;
            this.children = [];
            this.width = props.width || 0;
            this.style = props.style || '';
            this.handlers = {};
            this.destroyed = false;
            this.text = props.text || '';
            this.clutter_text = { set_ellipsize() {} };
        }
        add_child(child) { this.children.push(child); }
        set_child(child) { this.children = [child]; }
        connect(event, fn) { this.handlers[event] = fn; return event; }
        disconnect(event) { delete this.handlers[event]; }
        destroy() { this.destroyed = true; }
    }

    const MockSt = {
        Button: MockActor,
        BoxLayout: MockActor,
        Label: MockActor,
        Icon: MockActor,
        Widget: MockActor,
    };
    const MockClutter = {
        ActorAlign: { CENTER: 1, START: 2, END: 3 },
    };

    // Load aiQuotaView with mocked St & Clutter
    const fs = await import('fs/promises');
    const rawSource = await fs.readFile(new URL('../../extension/ui/aiQuotaView.js', import.meta.url), 'utf8');
    const aiQuotaUrl = new URL('../../extension/lib/aiQuota.js', import.meta.url).href;
    const source = rawSource
        .replace(/^import .*aiQuota\.js.*;$/gm, `import {AiQuotaCollector} from '${aiQuotaUrl}';`)
        .replace('let St = null;', 'let St = MockSt;')
        .replace('let Clutter = null;', 'let Clutter = MockClutter;');

    const module = await import(`data:text/javascript;base64,${Buffer.from(
        `const MockSt = ${JSON.stringify(MockSt)};\n` +
        `class MockActor {\n` +
        `  constructor(p = {}) { Object.assign(this, p); this.children = []; this.handlers = {}; this.text = p.text || ''; this.classes = new Set((p.style_class || '').split(/\\s+/).filter(Boolean)); this.clutter_text = { set_ellipsize() {} }; }\n` +
        `  add_child(c) { this.children.push(c); }\n` +
        `  set_child(c) { this.children = [c]; }\n` +
        `  add_style_class_name(c) { this.classes.add(c); }\n` +
        `  remove_style_class_name(c) { this.classes.delete(c); }\n` +
        `  has_style_class_name(c) { return this.classes.has(c); }\n` +
        `  connect(ev, fn) { this.handlers[ev] = fn; return ev; }\n` +
        `  disconnect(ev) { delete this.handlers[ev]; }\n` +
        `  destroy() { this.destroyed = true; }\n` +
        `}\n` +
        `MockSt.Button = MockActor;\nMockSt.BoxLayout = MockActor;\nMockSt.Label = MockActor;\nMockSt.Icon = MockActor;\nMockSt.Widget = MockActor;\n` +
        `const MockClutter = { ActorAlign: { CENTER: 1, START: 2, END: 3 } };\n` +
        source
    ).toString('base64')}`);

    const { AiQuotaProviderRow, AiQuotaSection } = module;

    // Test row
    const row = new AiQuotaProviderRow({ id: 'antigravity', label: 'Antigravity' });
    assert(row.actor, 'row actor created');
    row.setWidth(280);
    assertEqual(row.actor.width, 280);

    row.update({
        connected: true,
        primaryText: '78% left',
        remainingPercent: 78,
        windows: [
            { window: '5h', remainingPercent: 100, usedPercent: 0, resetText: '4h 15m' },
            { window: '7d', remainingPercent: 78, usedPercent: 22, resetText: '3d 17h' },
            { window: 'Argon 7d', remainingPercent: 55, usedPercent: 45, resetText: '4d 16h' },
        ],
        detailText: '5h 100% · 7d 78%',
        altDetailText: 'Gemini 7d: 78% left',
    });
    assertEqual(row._btn5h.label, '5h');
    assertEqual(row._btnWeekly.label, '7d');
    assert(row._quotaBars[0].style.includes('height: 34px'), 'full quota fills the equalizer bar');
    assert(row._quotaBars[1].style.includes('height: 27px'), 'weekly quota is proportional');
    assert(row._detailLabel.text.includes('4h 15m'), '5h detail includes reset countdown');

    // Click weekly button on row
    row._btnWeekly.handlers['clicked']();
    assertEqual(row._activeMode, 'weekly');
    assert(row._detailLabel.text.includes('3d 17h'), 'weekly detail includes weekly reset countdown');
    assert(row._detailLabel.text.includes('Argon: 55%'), 'weekly detail includes Argon 7d percentage');

    // Click 5h button on row
    row._btn5h.handlers['clicked']();
    assertEqual(row._activeMode, '5h');
    assert(row._detailLabel.text.includes('4h 15m'), '5h detail restored');
    row.update({connected: false, windows: [{window: '5h', remainingPercent: 100}]});
    assert(row._quotaBars[0].style.includes('height: 0px'), 'offline quota does not show stale fill');
    row.destroy();
    assert(row.actor === null, 'row destroyed');

    // Test section
    let scheduledTimer = null;
    let cancelledTimer = null;
    const mockScheduler = {
        add: (ms, fn) => { scheduledTimer = ms; return 456; },
        remove: (id) => { cancelledTimer = id; },
    };

    const mockCollector = {
        collect: () => buildAiQuotaSnapshot({}, NOW),
        refreshAsync: (cb) => { cb?.(buildAiQuotaSnapshot({}, NOW)); },
    };

    const section = new AiQuotaSection({
        collector: mockCollector,
        scheduler: mockScheduler,
    });
    assert(section.actor, 'section actor created');
    assertEqual(section.actor.children.length, 3, 'section has top bar, equalizer chart card, and bottom window card');
    assertEqual(section._chartCard.children.length, 3, 'equalizer chart card holds 3 provider columns');
    assertEqual(section._topBar.children.length, 3, 'top bar has title, summary readout, and refresh button');
    assert(section._refreshBtn, 'section has manual refresh button');
    assertEqual(section._claudeRow._label, 'Claude', 'Claude row label is Claude');

    // Only selected provider has active pill highlight
    assert(section._antigravityRow._btn5h.has_style_class_name('linux-island__quota-pill-btn--active'), 'selected provider has active pill');
    assert(!section._codexRow._btn5h.has_style_class_name('linux-island__quota-pill-btn--active'), 'unselected codex has no active pill');
    assert(!section._claudeRow._btn5h.has_style_class_name('linux-island__quota-pill-btn--active'), 'unselected claude has no active pill');

    // Test Claude (AGY) dynamic naming
    section._claudeRow.update({
        source: 'antigravity-shared',
        connected: true,
        windows: [{ window: '5h', remainingPercent: 100 }],
    });
    assertEqual(section._claudeRow._label, 'Claude (AGY)', 'Claude row changes to Claude (AGY) when source is antigravity-shared');

    section._claudeRow.update({
        source: 'standalone',
        connected: true,
        windows: [{ window: '5h', remainingPercent: 80 }],
    });
    assertEqual(section._claudeRow._label, 'Claude', 'Claude row reverts to Claude when source is standalone');

    // Test row click independence
    section._antigravityRow.setMode('weekly');
    assertEqual(section._antigravityRow._activeMode, 'weekly', 'antigravity row is weekly');
    assertEqual(section._codexRow._activeMode, '5h', 'codex row remains 5h when antigravity is clicked');
    assertEqual(section._claudeRow._activeMode, '5h', 'claude row remains 5h when antigravity is clicked');
    section.setWidth(320);
    assertEqual(section.actor.width, 320);

    section.start();
    assertEqual(scheduledTimer, 15000, 'section schedules 15s refresh');

    section.stop();
    assertEqual(cancelledTimer, 456, 'stop cancels scheduled timer');

    section.destroy();
    assert(section.actor === null, 'section destroyed');

    // Test repeat(fn, ms) scheduler receives 15000ms from start()
    let repeatMsPassed = null;
    let repeatCancelledId = null;
    const repeatSched = {
        repeat: (fn, ms) => {
            repeatMsPassed = ms;
            return 'repeat-timer-1';
        },
        cancel: (id) => {
            repeatCancelledId = id;
        },
    };
    const repeatSection = new AiQuotaSection({
        collector: mockCollector,
        scheduler: repeatSched,
    });
    repeatSection.start();
    assertEqual(repeatMsPassed, 15000, 'AiQuotaSection passes 15000 ms to repeat scheduler');
    repeatSection.stop();
    assertEqual(repeatCancelledId, 'repeat-timer-1', 'AiQuotaSection cancels repeat scheduler');
    repeatSection.destroy();

    // Test notify::mapped stops section when unmapped
    const mappedSection = new AiQuotaSection({
        collector: mockCollector,
        scheduler: repeatSched,
    });
    assert(typeof mappedSection.actor.handlers['notify::mapped'] === 'function', 'notify::mapped listener attached to actor');
    mappedSection.start();
    assert(mappedSection._active, 'mappedSection is active');
    mappedSection.actor.mapped = false;
    mappedSection.actor.handlers['notify::mapped']();
    assert(!mappedSection._active, 'mappedSection stops when unmapped');
    mappedSection.destroy();
    assertEqual(mappedSection._mappedSignalId, null, 'mapped signal disconnected on destroy');
}


// 9. Single-window providers must not fabricate the missing window
{
    const snap = buildAiQuotaSnapshot({
        ompCache: [{
            value: {
                provider: 'google-antigravity',
                limits: [{
                    id: 'google-antigravity:anthropic:default:3p-weekly',
                    label: 'Claude & GPT (shared)',
                    window: { durationMs: 604800000, resetsAt: NOW + 3600000 },
                    amount: { remainingFraction: 0 },
                }],
            },
        }],
    }, NOW);

    assertEqual(snap.claude.connected, true);
    assertEqual(snap.claude.has5h, false, 'shared Claude has no 5h window');
    assertEqual(snap.claude.has7d, true, 'shared Claude has a 7d window');
    assert(!snap.claude.detailText.startsWith('0% left (100% used)'),
        'primary detail must not describe a missing 5h window');

    const offline = buildAiQuotaSnapshot({}, NOW);
    for (const provider of ['antigravity', 'codex', 'claude']) {
        assertEqual(offline[provider].has5h, false, `${provider} offline has no 5h window`);
        assertEqual(offline[provider].has7d, false, `${provider} offline has no 7d window`);
    }
}

// 10. applySnapshotStatus distinguishes checking from honestly offline
{
    const empty = buildAiQuotaSnapshot({}, NOW);
    const checking = applySnapshotStatus(empty, { checking: true });
    assertEqual(checking.checking, true);
    assertEqual(checking.antigravity.primaryText, 'Checking…', 'in-flight probe reads as checking');
    assertEqual(checking.antigravity.detailText, 'Checking…');

    const settled = applySnapshotStatus(empty, { checking: false });
    assertEqual(settled.antigravity.primaryText, 'Offline');
    assertEqual(settled.antigravity.detailText, 'No active session', 'completed probe reads as offline');

    // A connected provider keeps its real numbers while a refresh is running.
    const connected = buildAiQuotaSnapshot({
        ompCache: [{
            value: {
                provider: 'google-antigravity',
                limits: [{ id: 'gemini-5h', window: { durationMs: 18000000 }, amount: { remainingFraction: 0.9 } }],
            },
        }],
    }, NOW);
    const refreshing = applySnapshotStatus(connected, { checking: true, cached: true });
    assertEqual(refreshing.antigravity.primaryText, '90% left', 'live data survives a background refresh');
    assertEqual(refreshing.antigravity.cached, true, 'cached marker is preserved');
}

// 11. AiQuotaCollector caches the last good probe and starts warm
{
    const raw = {
        ompCache: [{
            value: {
                provider: 'google-antigravity',
                limits: [{ id: 'gemini-5h', window: { durationMs: 18000000 }, amount: { remainingFraction: 0.8 } }],
            },
        }],
    };

    const store = new Map();
    // Override at class level: the constructor hydrates from cache, so the
    // double must be in place before construction.
    class CachedCollector extends AiQuotaCollector {
        _readProbeCache() {
            const value = store.get('probe');
            return value ? { raw: value, savedAt: NOW } : null;
        }
        _writeProbeCache(value) {
            store.set('probe', value);
        }
    }
    const makeCollector = () => new CachedCollector({ now: () => NOW, cachePath: '/tmp/linux-island-test-cache/probe.json' });

    // Without a subprocess backend the collector settles honestly instead of
    // latching the checking state forever.
    const pending = makeCollector();
    const settledOffline = pending.collect();
    assertEqual(settledOffline.checking, false, 'no-backend collector does not stay in checking');
    assertEqual(settledOffline.antigravity.detailText, 'No active session');

    // A successful probe persists the raw payload and drops the checking state.
    const writer = makeCollector();
    writer._probeRunner = () => raw;
    await writer.refreshAsync();
    assertEqual(store.get('probe'), raw, 'successful probe is persisted');

    // A later cold start hydrates from that cache before any probe runs.
    const warm = makeCollector();
    assertEqual(warm.lastSnapshot.antigravity.connected, true, 'cold start hydrates from cache');
    assertEqual(warm.lastSnapshot.antigravity.remainingPercent, 80);
    assertEqual(warm.hasData, true, 'cached data counts as data');
    assertEqual(warm.lastSnapshot.antigravity.cached, true, 'hydrated snapshot is marked cached');

    // Expired cache is ignored so stale quotas never masquerade as live.
    class StaleCollector extends CachedCollector {
        _readProbeCache() {
            const value = store.get('probe');
            return value ? { raw: value, savedAt: NOW - 24 * 3600 * 1000 } : null;
        }
    }
    const stale = new StaleCollector({ now: () => NOW, cachePath: '/tmp/linux-island-test-cache/probe.json' });
    assertEqual(stale.lastSnapshot.antigravity.connected, false, 'expired cache is not used');
}

// 12. Antigravity error classification & transient network cache preservation
{
    const expiredSnap = buildAiQuotaSnapshot({
        errors: { antigravity: 'token_expired' },
    }, NOW);
    assertEqual(expiredSnap.antigravity.connected, false);
    assertEqual(expiredSnap.antigravity.primaryText, 'Session expired');
    assertEqual(expiredSnap.antigravity.detailText, 'Token expired · open CLI or refresh');
    assertEqual(expiredSnap.antigravity.error, 'token_expired');

    const netSnap = buildAiQuotaSnapshot({
        errors: { antigravity: 'network' },
    }, NOW);
    assertEqual(netSnap.antigravity.connected, false);
    assertEqual(netSnap.antigravity.primaryText, 'Unreachable');
    assertEqual(netSnap.antigravity.detailText, 'Network error · retrying');
    assertEqual(netSnap.antigravity.error, 'network');

    const goodRaw = {
        ompCache: [{
            value: {
                provider: 'google-antigravity',
                limits: [{ id: 'gemini-5h', window: { durationMs: 18000000 }, amount: { remainingFraction: 0.88 } }],
            },
        }],
    };
    const store = new Map();
    class ResilientCollector extends AiQuotaCollector {
        _readProbeCache() {
            const v = store.get('probe');
            return v ? { raw: v, savedAt: NOW } : null;
        }
        _writeProbeCache(v) {
            store.set('probe', v);
        }
    }
    const col = new ResilientCollector({ now: () => NOW, cachePath: '/tmp/linux-island-test-cache/resilient.json' });
    col._probeRunner = () => goodRaw;
    await col.refreshAsync();
    assertEqual(col.lastSnapshot.antigravity.remainingPercent, 88);

    // Transient network error preserves previous Antigravity entry in snapshot & cache
    col._probeRunner = () => ({ ompCache: [], errors: { antigravity: 'network' } });
    await col.refreshAsync();
    assertEqual(col.lastSnapshot.antigravity.connected, true, 'network error preserves cached Antigravity');
    assertEqual(col.lastSnapshot.antigravity.remainingPercent, 88);

    // Auth expiry is NOT hidden behind stale cache
    col._probeRunner = () => ({ ompCache: [], errors: { antigravity: 'token_expired' } });
    await col.refreshAsync();
    assertEqual(col.lastSnapshot.antigravity.connected, false, 'token_expired clears stale Antigravity');
    assertEqual(col.lastSnapshot.antigravity.primaryText, 'Session expired');
}

console.log('PASS: AI quota parsers, multi-window remaining % calculations, fallback, and view lifecycle tests');
