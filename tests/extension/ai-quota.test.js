import {
    formatResetCountdown,
    normalizeWindowLabel,
    parseOmpUsageCache,
    parseCodexSessionJsonl,
    parseNineRouterUsage,
    buildAiQuotaSnapshot,
    AiQuotaCollector,
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
        `  constructor(p = {}) { Object.assign(this, p); this.children = []; this.handlers = {}; this.text = p.text || ''; this.clutter_text = { set_ellipsize() {} }; }\n` +
        `  add_child(c) { this.children.push(c); }\n` +
        `  set_child(c) { this.children = [c]; }\n` +
        `  connect(ev, fn) { this.handlers[ev] = fn; return ev; }\n` +
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
    assertEqual(row._btn5h.label, '5h: 100%');
    assertEqual(row._btnWeekly.label, '7d: 78%');
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
    assertEqual(section.actor.children.length, 4, 'section has top bar + 3 provider rows');
    assertEqual(section._topBar.children.length, 1, 'top bar has only AI Quota title');
    assertEqual(section._claudeRow._label, 'Claude', 'Claude row label is Claude');

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
}

console.log('PASS: AI quota parsers, multi-window remaining % calculations, fallback, and view lifecycle tests');
