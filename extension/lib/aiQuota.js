// Multi-source AI Quota Collector & Parsers for Linux Island
// Collects and parses quota data for Google Antigravity, OpenAI Codex, and Claude Code.

let Gio = null;
let GLib = null;
if (typeof process === 'undefined') {
    try {
        Gio = (await import('gi://Gio')).default;
        GLib = (await import('gi://GLib')).default;
    } catch (_) {}
}

export function formatResetCountdown(resetsAtMs, nowMs = Date.now()) {
    if (!Number.isFinite(resetsAtMs) || resetsAtMs <= 0) {
        return '';
    }
    const diffMs = resetsAtMs - nowMs;
    if (diffMs <= 0) {
        return 'now';
    }
    if (diffMs < 3600000) {
        return `${Math.max(1, Math.floor(diffMs / 60000))}m`;
    }
    if (diffMs < 86400000) {
        const h = Math.floor(diffMs / 3600000);
        const m = Math.floor((diffMs % 3600000) / 60000);
        return `${h}h ${m}m`;
    }
    const d = Math.floor(diffMs / 86400000);
    const h = Math.floor((diffMs % 86400000) / 3600000);
    return `${d}d ${h}h`;
}

export function normalizeWindowLabel(rawLabel, durationMs) {
    if (typeof durationMs === 'number' && durationMs > 0) {
        if (durationMs === 18000000 || durationMs === 300 * 60 * 1000) return '5h';
        if (durationMs === 604800000 || durationMs === 10080 * 60 * 1000) return '7d';
        if (durationMs === 2592000000 || durationMs === 30 * 86400 * 1000) return '30d';
    }
    const s = String(rawLabel || '').trim().toLowerCase();
    if (s.includes('argon')) return 'Argon 7d';
    if (s.includes('weekly') || s.includes('7d') || s === '10080m') return '7d';
    if (s.includes('5h') || s.includes('5 hour') || s.includes('flash') || s.includes('sonnet') || s.includes('opus') || s.includes('300m')) return '5h';
    if (s.includes('30d') || s.includes('30 day') || s.includes('month') || s.includes('session')) return '30d';
    return String(rawLabel || '').trim() || 'Quota';
}

function clamp(min, max, val) {
    return Math.max(min, Math.min(max, val));
}

function parseLimitItem(limit, nowMs) {
    if (!limit || typeof limit !== 'object') return null;
    const id = String(limit.id || '');
    const label = String(limit.label || '');
    const win = limit.window || {};
    const amt = limit.amount || {};

    let windowLabel = normalizeWindowLabel(win.label || win.id, win.durationMs);
    if (id.toLowerCase().includes('argon')) {
        windowLabel = 'Argon 7d';
    }

    let remainingFraction = null;
    if (typeof amt.remainingFraction === 'number' && Number.isFinite(amt.remainingFraction)) {
        remainingFraction = amt.remainingFraction;
    } else if (typeof amt.usedFraction === 'number' && Number.isFinite(amt.usedFraction)) {
        remainingFraction = 1.0 - amt.usedFraction;
    } else if (typeof amt.remaining === 'number' && typeof amt.limit === 'number' && amt.limit > 0) {
        remainingFraction = amt.remaining / amt.limit;
    } else if (typeof amt.used === 'number' && typeof amt.limit === 'number' && amt.limit > 0) {
        remainingFraction = 1.0 - (amt.used / amt.limit);
    } else if (typeof amt.remaining === 'number' && amt.unit === 'percent') {
        remainingFraction = amt.remaining / 100.0;
    }

    const rf = (remainingFraction !== null) ? clamp(0, 1, remainingFraction) : 1.0;
    const remainingPercent = Math.round(rf * 100);
    const usedPercent = 100 - remainingPercent;
    const resetsAt = (typeof win.resetsAt === 'number' && win.resetsAt > 0) ? win.resetsAt : null;
    const resetText = formatResetCountdown(resetsAt, nowMs);

    return {
        id,
        label,
        window: windowLabel,
        durationMs: win.durationMs || 0,
        remainingPercent,
        usedPercent,
        resetsAt,
        resetText,
    };
}

export function parseOmpUsageCache(cacheEntries, nowMs = Date.now()) {
    const result = {
        antigravity: { geminiLimits: [], sharedLimits: [] },
        codex: { limits: [] },
        claude: { limits: [] },
    };

    if (!Array.isArray(cacheEntries)) {
        return result;
    }

    for (const rawEntry of cacheEntries) {
        let entry = rawEntry;
        if (typeof entry === 'string') {
            try {
                entry = JSON.parse(entry);
            } catch (_) {
                continue;
            }
        }
        if (!entry || typeof entry !== 'object') continue;

        const val = (entry.value && typeof entry.value === 'object') ? entry.value : entry;
        const provider = String(val.provider || '');
        const limits = Array.isArray(val.limits) ? val.limits : [];

        if (provider === 'google-antigravity') {
            if (val.metadata?.email) {
                result.antigravity.email = val.metadata.email;
            }
            for (const lim of limits) {
                const parsed = parseLimitItem(lim, nowMs);
                if (!parsed) continue;
                if (parsed.id.toLowerCase().includes('gemini')) {
                    result.antigravity.geminiLimits.push(parsed);
                } else if (parsed.id.toLowerCase().includes('anthropic') || parsed.id.toLowerCase().includes('3p')) {
                    // Avoid duplicate window entries for shared limits (e.g. anthropic and openai shared weekly)
                    const exists = result.antigravity.sharedLimits.some(s => s.window === parsed.window);
                    if (!exists) {
                        result.antigravity.sharedLimits.push(parsed);
                    }
                }
            }
        } else if (provider === 'openai-codex') {
            for (const lim of limits) {
                const parsed = parseLimitItem(lim, nowMs);
                if (parsed) {
                    result.codex.limits.push(parsed);
                }
            }
        } else if (provider === 'anthropic' || provider === 'claude') {
            for (const lim of limits) {
                const parsed = parseLimitItem(lim, nowMs);
                if (parsed) {
                    result.claude.limits.push(parsed);
                }
            }
        }
    }

    return result;
}

export function parseCodexSessionJsonl(jsonlText, nowMs = Date.now()) {
    if (!jsonlText || typeof jsonlText !== 'string') return null;
    const lines = jsonlText.split('\n');

    for (let i = lines.length - 1; i >= 0; --i) {
        const line = lines[i].trim();
        if (!line || !line.includes('token_count') || !line.includes('rate_limits')) continue;

        try {
            const data = JSON.parse(line);
            const rateLimits = data?.payload?.rate_limits;
            if (!rateLimits) continue;

            const res = {};
            if (rateLimits.primary && typeof rateLimits.primary.used_percent === 'number') {
                const p = rateLimits.primary;
                const resetsAt = (typeof p.resets_at === 'number' && p.resets_at > 0) ? p.resets_at * 1000 : null;
                const isReset = Boolean(resetsAt && nowMs >= resetsAt);
                const usedPercent = isReset ? 0 : clamp(0, 100, Math.round(p.used_percent));
                const remainingPercent = 100 - usedPercent;
                const window = normalizeWindowLabel('', (p.window_minutes || 300) * 60 * 1000);
                res.primary = {
                    window,
                    remainingPercent,
                    usedPercent,
                    resetsAt: isReset ? null : resetsAt,
                    resetText: isReset ? '' : formatResetCountdown(resetsAt, nowMs),
                };
            }
            if (rateLimits.secondary && typeof rateLimits.secondary.used_percent === 'number') {
                const s = rateLimits.secondary;
                const resetsAt = (typeof s.resets_at === 'number' && s.resets_at > 0) ? s.resets_at * 1000 : null;
                const isReset = Boolean(resetsAt && nowMs >= resetsAt);
                const usedPercent = isReset ? 0 : clamp(0, 100, Math.round(s.used_percent));
                const remainingPercent = 100 - usedPercent;
                const window = normalizeWindowLabel('', (s.window_minutes || 10080) * 60 * 1000);
                res.secondary = {
                    window,
                    remainingPercent,
                    usedPercent,
                    resetsAt: isReset ? null : resetsAt,
                    resetText: isReset ? '' : formatResetCountdown(resetsAt, nowMs),
                };
            }

            if (res.primary || res.secondary) {
                return res;
            }
        } catch (_) {}
    }

    return null;
}

export function parseNineRouterUsage(nineRouterData, nowMs = Date.now()) {
    const res = { antigravity: [], codex: [], claude: [], antigravityEmail: null };
    if (!nineRouterData || typeof nineRouterData !== 'object') return res;

    res.antigravityEmail = nineRouterData.antigravity?.email || null;

    if (nineRouterData.antigravity && typeof nineRouterData.antigravity === 'object') {
        const quotas = nineRouterData.antigravity.quotas || nineRouterData.antigravity.limits || {};
        const quotaEntries = Array.isArray(quotas)
            ? quotas.map(q => [q.id || q.displayName, q])
            : Object.entries(quotas);

        for (const [key, q] of quotaEntries) {
            if (!q || typeof q !== 'object') continue;
            let remainingPercent = 100;
            if (typeof q.remainingPercentage === 'number') {
                remainingPercent = clamp(0, 100, Math.round(q.remainingPercentage));
            } else if (typeof q.remaining === 'number' && typeof q.total === 'number' && q.total > 0) {
                remainingPercent = clamp(0, 100, Math.round((q.remaining / q.total) * 100));
            } else if (typeof q.used === 'number' && typeof q.total === 'number' && q.total > 0) {
                remainingPercent = clamp(0, 100, Math.round((1 - (q.used / q.total)) * 100));
            }

            const usedPercent = 100 - remainingPercent;
            let resetsAt = null;
            if (typeof q.resetAt === 'number') {
                resetsAt = q.resetAt > 1e11 ? q.resetAt : q.resetAt * 1000;
            } else if (typeof q.resetAt === 'string') {
                const parsed = Date.parse(q.resetAt);
                if (!isNaN(parsed)) resetsAt = parsed;
            }

            const isReset = Boolean(resetsAt && nowMs >= resetsAt);
            const actualRemaining = isReset ? 100 : remainingPercent;
            const actualUsed = isReset ? 0 : usedPercent;
            const window = normalizeWindowLabel(q.displayName || key, q.durationMs);

            const isClaude = key.includes('claude') || (q.displayName && q.displayName.toLowerCase().includes('claude'));
            const targetList = isClaude ? res.claude : res.antigravity;

            targetList.push({
                id: key,
                label: q.displayName || key,
                window,
                remainingPercent: actualRemaining,
                usedPercent: actualUsed,
                resetsAt: isReset ? null : resetsAt,
                resetText: isReset ? '' : formatResetCountdown(resetsAt, nowMs),
            });
        }
    }

    if (nineRouterData.codex && typeof nineRouterData.codex === 'object') {
        const quotas = nineRouterData.codex.quotas || nineRouterData.codex.limits || {};
        const quotaEntries = Array.isArray(quotas)
            ? quotas.map(q => [q.id || q.displayName, q])
            : Object.entries(quotas);

        for (const [key, q] of quotaEntries) {
            if (!q || typeof q !== 'object') continue;
            let remainingPercent = 100;
            if (typeof q.remainingPercentage === 'number') {
                remainingPercent = clamp(0, 100, Math.round(q.remainingPercentage));
            } else if (typeof q.remaining === 'number' && typeof q.total === 'number' && q.total > 0) {
                remainingPercent = clamp(0, 100, Math.round((q.remaining / q.total) * 100));
            } else if (typeof q.used === 'number' && typeof q.total === 'number' && q.total > 0) {
                remainingPercent = clamp(0, 100, Math.round((1 - (q.used / q.total)) * 100));
            }

            const usedPercent = 100 - remainingPercent;
            let resetsAt = null;
            if (typeof q.resetAt === 'number') {
                resetsAt = q.resetAt > 1e11 ? q.resetAt : q.resetAt * 1000;
            } else if (typeof q.resetAt === 'string') {
                const parsed = Date.parse(q.resetAt);
                if (!isNaN(parsed)) resetsAt = parsed;
            }

            const isReset = Boolean(resetsAt && nowMs >= resetsAt);
            const actualRemaining = isReset ? 100 : remainingPercent;
            const actualUsed = isReset ? 0 : usedPercent;
            const window = normalizeWindowLabel(q.displayName || key, q.durationMs);

            res.codex.push({
                id: key,
                label: q.displayName || key,
                window,
                remainingPercent: actualRemaining,
                usedPercent: actualUsed,
                resetsAt: isReset ? null : resetsAt,
                resetText: isReset ? '' : formatResetCountdown(resetsAt, nowMs),
            });
        }
    }
    if (nineRouterData.claude && typeof nineRouterData.claude === 'object') {
        const quotas = nineRouterData.claude.quotas || nineRouterData.claude.limits || {};
        const quotaEntries = Array.isArray(quotas)
            ? quotas.map(q => [q.id || q.displayName, q])
            : Object.entries(quotas);

        for (const [key, q] of quotaEntries) {
            if (!q || typeof q !== 'object') continue;
            let remainingPercent = 100;
            if (typeof q.remainingPercentage === 'number') {
                remainingPercent = clamp(0, 100, Math.round(q.remainingPercentage));
            } else if (typeof q.remaining === 'number' && typeof q.total === 'number' && q.total > 0) {
                remainingPercent = clamp(0, 100, Math.round((q.remaining / q.total) * 100));
            } else if (typeof q.used === 'number' && typeof q.total === 'number' && q.total > 0) {
                remainingPercent = clamp(0, 100, Math.round((1 - (q.used / q.total)) * 100));
            }

            const usedPercent = 100 - remainingPercent;
            let resetsAt = null;
            if (typeof q.resetAt === 'number') {
                resetsAt = q.resetAt > 1e11 ? q.resetAt : q.resetAt * 1000;
            } else if (typeof q.resetAt === 'string') {
                const parsed = Date.parse(q.resetAt);
                if (!isNaN(parsed)) resetsAt = parsed;
            }

            const isReset = Boolean(resetsAt && nowMs >= resetsAt);
            const actualRemaining = isReset ? 100 : remainingPercent;
            const actualUsed = isReset ? 0 : usedPercent;
            const window = normalizeWindowLabel(q.displayName || key, q.durationMs);

            res.claude.push({
                id: key,
                label: q.displayName || key,
                window,
                remainingPercent: actualRemaining,
                usedPercent: actualUsed,
                resetsAt: isReset ? null : resetsAt,
                resetText: isReset ? '' : formatResetCountdown(resetsAt, nowMs),
            });
        }
    }

    return res;
}

function deduplicateWindows(windows) {
    const map = new Map();
    for (const w of windows) {
        if (!w || !w.window) continue;
        const existing = map.get(w.window);
        if (!existing || w.remainingPercent < existing.remainingPercent) {
            map.set(w.window, w);
        }
    }
    return Array.from(map.values());
}

function formatWindowSummary(w) {
    if (w.window === 'Argon 7d') {
        return `Arg ${w.remainingPercent}%`;
    }
    return `${w.window} ${w.remainingPercent}%`;
}

function findEarliestResetText(windows, nowMs) {
    let minReset = Infinity;
    for (const w of windows) {
        if (typeof w.resetsAt === 'number' && w.resetsAt > nowMs) {
            if (w.resetsAt < minReset) {
                minReset = w.resetsAt;
            }
        }
    }
    return Number.isFinite(minReset) ? formatResetCountdown(minReset, nowMs) : '';
}

export function buildAiQuotaSnapshot(rawSources = {}, nowMs = Date.now()) {
    let omp = { antigravity: { geminiLimits: [], sharedLimits: [] }, codex: { limits: [] }, claude: { limits: [] } };
    if (Array.isArray(rawSources.ompCache)) {
        omp = parseOmpUsageCache(rawSources.ompCache, nowMs);
    } else if (rawSources.ompCache && typeof rawSources.ompCache === 'object') {
        omp = rawSources.ompCache;
    }

    let codexSession = null;
    const codexRl = rawSources.deviceCodex || rawSources.codexRateLimits;
    if (typeof rawSources.codexJsonl === 'string') {
        codexSession = parseCodexSessionJsonl(rawSources.codexJsonl, nowMs);
    } else if (codexRl && typeof codexRl === 'object') {
        const rl = codexRl;
        codexSession = {};
        if (rl.primary && typeof rl.primary.used_percent === 'number') {
            const resetsAt = (typeof rl.primary.resets_at === 'number' && rl.primary.resets_at > 0)
                ? (rl.primary.resets_at > 1e11 ? rl.primary.resets_at : rl.primary.resets_at * 1000)
                : null;
            const isReset = Boolean(resetsAt && nowMs >= resetsAt);
            const usedPercent = isReset ? 0 : clamp(0, 100, Math.round(rl.primary.used_percent));
            codexSession.primary = {
                window: normalizeWindowLabel('', (rl.primary.window_minutes || 300) * 60 * 1000),
                remainingPercent: 100 - usedPercent,
                usedPercent,
                resetsAt: isReset ? null : resetsAt,
                resetText: isReset ? '' : formatResetCountdown(resetsAt, nowMs),
            };
        }
        if (rl.secondary && typeof rl.secondary.used_percent === 'number') {
            const resetsAt = (typeof rl.secondary.resets_at === 'number' && rl.secondary.resets_at > 0)
                ? (rl.secondary.resets_at > 1e11 ? rl.secondary.resets_at : rl.secondary.resets_at * 1000)
                : null;
            const isReset = Boolean(resetsAt && nowMs >= resetsAt);
            const usedPercent = isReset ? 0 : clamp(0, 100, Math.round(rl.secondary.used_percent));
            codexSession.secondary = {
                window: normalizeWindowLabel('', (rl.secondary.window_minutes || 10080) * 60 * 1000),
                remainingPercent: 100 - usedPercent,
                usedPercent,
                resetsAt: isReset ? null : resetsAt,
                resetText: isReset ? '' : formatResetCountdown(resetsAt, nowMs),
            };
        }
    }

    const nineRouter = rawSources.nineRouter ? parseNineRouterUsage(rawSources.nineRouter, nowMs) : null;

    // 1. Antigravity: strictly use the Google account on Antigravity
    const agWindowsRaw = (omp?.antigravity?.geminiLimits && omp.antigravity.geminiLimits.length > 0)
        ? [...omp.antigravity.geminiLimits]
        : [...(nineRouter?.antigravity || [])];

    // Sort windows order: 5h, 7d, Argon 7d
    const agOrder = { '5h': 1, '7d': 2, 'Argon 7d': 3 };
    agWindowsRaw.sort((a, b) => (agOrder[a.window] || 99) - (agOrder[b.window] || 99));
    const agWindows = deduplicateWindows(agWindowsRaw);

    let antigravityState;
    if (agWindows.length > 0) {
        const remainingPercent = Math.min(...agWindows.map(w => w.remainingPercent));
        const usedPercent = 100 - remainingPercent;
        const earliestReset = findEarliestResetText(agWindows, nowMs);

        const winParts = agWindows.map(formatWindowSummary);
        if (earliestReset) {
            winParts.push(`↻ ${earliestReset}`);
        }
        const detailText = winParts.join(' · ');

        // Bottleneck and Argon summary
        const bottleneck = agWindows.reduce((min, cur) => cur.remainingPercent < min.remainingPercent ? cur : min, agWindows[0]);
        const argonWin = agWindows.find(w => w.window === 'Argon 7d');
        let altDetailText = `Gemini ${bottleneck.window}: ${bottleneck.remainingPercent}% left (${bottleneck.usedPercent}% used)`;
        if (argonWin && argonWin !== bottleneck) {
            altDetailText += ` · Argon 7d: ${argonWin.remainingPercent}%`;
        }
        if (earliestReset) {
            altDetailText += ` · ↻ ${earliestReset}`;
        }
        const agEmail = omp?.antigravity?.email || nineRouter?.antigravityEmail;
        if (agEmail) {
            altDetailText += ` · ${agEmail}`;
        }

        antigravityState = {
            connected: true,
            remainingPercent,
            usedPercent,
            primaryText: `${remainingPercent}% left`,
            detailText,
            altDetailText,
            windows: agWindows,
        };
    } else {
        antigravityState = {
            connected: false,
            remainingPercent: 0,
            usedPercent: 0,
            primaryText: 'Offline',
            detailText: 'No active session',
            altDetailText: 'No active session',
            windows: [],
        };
    }

    // 2. OpenAI Codex: strictly prioritize device's native Codex session
    const codexWindowsRaw = [];
    if (codexSession?.primary) codexWindowsRaw.push(codexSession.primary);
    if (codexSession?.secondary) codexWindowsRaw.push(codexSession.secondary);
    if (!rawSources.deviceCodex) {
        if (omp?.codex?.limits) {
            codexWindowsRaw.push(...omp.codex.limits);
        }
        if (nineRouter?.codex) {
            codexWindowsRaw.push(...nineRouter.codex);
        }
    }
    const codexOrder = { '5h': 1, '7d': 2, '30d': 3 };
    codexWindowsRaw.sort((a, b) => (codexOrder[a.window] || 99) - (codexOrder[b.window] || 99));
    const codexWindows = deduplicateWindows(codexWindowsRaw);

    let codexState;
    if (codexWindows.length > 0) {
        const remainingPercent = Math.min(...codexWindows.map(w => w.remainingPercent));
        const usedPercent = 100 - remainingPercent;
        const earliestReset = findEarliestResetText(codexWindows, nowMs);

        const winParts = codexWindows.map(formatWindowSummary);
        if (earliestReset) {
            winParts.push(`↻ ${earliestReset}`);
        }
        const detailText = winParts.join(' · ');

        const bottleneck = codexWindows.reduce((min, cur) => cur.remainingPercent < min.remainingPercent ? cur : min, codexWindows[0]);
        const otherWindows = codexWindows.filter(w => w !== bottleneck);
        let altDetailText = `${bottleneck.window}: ${bottleneck.remainingPercent}% left (${bottleneck.usedPercent}% used)`;
        if (otherWindows.length > 0) {
            altDetailText += ` · ${otherWindows[0].window}: ${otherWindows[0].remainingPercent}% left`;
        }
        if (codexRl?.email) {
            altDetailText += ` · ${codexRl.email}`;
        }
        codexState = {
            connected: true,
            remainingPercent,
            usedPercent,
            primaryText: `${remainingPercent}% left`,
            detailText,
            altDetailText,
            windows: codexWindows,
        };
    } else {
        codexState = {
            connected: false,
            remainingPercent: 0,
            usedPercent: 0,
            primaryText: 'Offline',
            detailText: 'No active session',
            altDetailText: 'No active session',
            windows: [],
        };
    }

    // 3. Claude Code
    let claudeState;
    const standaloneClaude = [
        ...(omp?.claude?.limits || []),
        ...(nineRouter?.claude || []),
    ];
    if (rawSources.claudeQuota && Array.isArray(rawSources.claudeQuota)) {
        standaloneClaude.push(...rawSources.claudeQuota);
    }

    if (standaloneClaude.length > 0) {
        const windowOrder = { '5h': 1, '7d': 2, '30d': 3 };
        const claudeWindows = deduplicateWindows(standaloneClaude).sort((a, b) => (windowOrder[a.window] || 99) - (windowOrder[b.window] || 99));
        const remainingPercent = Math.min(...claudeWindows.map(w => w.remainingPercent));
        const usedPercent = 100 - remainingPercent;
        const earliestReset = findEarliestResetText(claudeWindows, nowMs);

        const winParts = claudeWindows.map(formatWindowSummary);
        if (earliestReset) {
            winParts.push(`↻ ${earliestReset}`);
        }
        const detailText = winParts.join(' · ');

        const bottleneck = claudeWindows.reduce((min, cur) => cur.remainingPercent < min.remainingPercent ? cur : min, claudeWindows[0]);
        let altDetailText = `Claude ${bottleneck.window}: ${bottleneck.remainingPercent}% left (${bottleneck.usedPercent}% used)`;
        if (earliestReset) {
            altDetailText += ` · ↻ ${earliestReset}`;
        }

        claudeState = {
            connected: true,
            remainingPercent,
            usedPercent,
            primaryText: `${remainingPercent}% left`,
            detailText,
            altDetailText,
            source: 'standalone',
            windows: claudeWindows,
        };
    } else if (omp?.antigravity?.sharedLimits && omp.antigravity.sharedLimits.length > 0) {
        // Fallback: Antigravity Claude & GPT (shared) quota
        const windowOrder = { '5h': 1, '7d': 2, '30d': 3 };
        const sharedWindows = deduplicateWindows(omp.antigravity.sharedLimits).sort((a, b) => (windowOrder[a.window] || 99) - (windowOrder[b.window] || 99));
        const remainingPercent = Math.min(...sharedWindows.map(w => w.remainingPercent));
        const usedPercent = 100 - remainingPercent;
        const earliestReset = findEarliestResetText(sharedWindows, nowMs);

        const winParts = sharedWindows.map(formatWindowSummary);
        const detailPrefix = `${winParts.join(' · ')} (AGY)`;
        const detailText = earliestReset ? `${detailPrefix} · ↻ ${earliestReset}` : detailPrefix;

        let altDetailText = `Antigravity Claude (shared): ${remainingPercent}% left`;
        if (earliestReset) {
            altDetailText += ` · ↻ ${earliestReset}`;
        }

        claudeState = {
            connected: true,
            remainingPercent,
            usedPercent,
            primaryText: `${remainingPercent}% left`,
            detailText,
            altDetailText,
            source: 'antigravity-shared',
            windows: sharedWindows,
        };
    } else if (rawSources.claudeLocal?.installed) {
        claudeState = {
            connected: true,
            remainingPercent: 100,
            usedPercent: 0,
            primaryText: 'Ready',
            detailText: 'Claude Code CLI installed · no active lock',
            altDetailText: 'Claude Code CLI installed',
            source: 'local-installed',
            windows: [],
        };
    } else {
        claudeState = {
            connected: false,
            remainingPercent: 0,
            usedPercent: 0,
            primaryText: 'Offline',
            detailText: 'No active session',
            altDetailText: 'No active session',
            source: 'none',
            windows: [],
        };
    }

    return {
        timestamp: nowMs,
        antigravity: antigravityState,
        codex: codexState,
        claude: claudeState,
    };
}

const PROBE_PYTHON_SNIPPET = `
import sqlite3, os, glob, json, urllib.request, urllib.parse, datetime

raw = {'ompCache': [], 'deviceCodex': None, 'claudeLocal': {'installed': False}}

def iso_to_ms(iso_str):
    if not iso_str or not isinstance(iso_str, str):
        return None
    try:
        dt = datetime.datetime.fromisoformat(iso_str.replace('Z', '+00:00'))
        return int(dt.timestamp() * 1000)
    except Exception:
        return None

# 1. Live Google Antigravity API (Keyring + OMP Credentials) with OMP Cache fallback
agy_live_entry = None
agy_creds = []
try:
    import gi
    gi.require_version('Secret', '1')
    from gi.repository import Secret
    s = Secret.Schema.new("org.freedesktop.Secret.Generic", Secret.SchemaFlags.NONE, {
        "service": Secret.SchemaAttributeType.STRING,
        "username": Secret.SchemaAttributeType.STRING,
    })
    sec_val = Secret.password_lookup_sync(s, {"service": "gemini", "username": "antigravity"}, None)
    if sec_val:
        sec_data = json.loads(sec_val)
        tok_obj = sec_data.get("token", {})
        if tok_obj.get("access_token"):
            agy_creds.append({
                "access": tok_obj.get("access_token"),
                "refresh": tok_obj.get("refresh_token"),
                "email": sec_data.get("id_token_email"),
                "projectId": "aicode-consumers"
            })
except Exception:
    pass

db_path = os.path.expanduser('~/.omp/agent/agent.db')
if os.path.exists(db_path):
    try:
        conn = sqlite3.connect(f'file:{db_path}?mode=ro', uri=True)
        cur = conn.cursor()
        cur.execute("SELECT data FROM auth_credentials WHERE provider='google-antigravity' AND disabled_cause IS NULL ORDER BY updated_at DESC LIMIT 1")
        row = cur.fetchone()
        if row and row[0]:
            c_data = json.loads(row[0])
            if c_data.get("access"):
                agy_creds.append({
                    "access": c_data.get("access"),
                    "refresh": c_data.get("refresh"),
                    "email": c_data.get("email"),
                    "projectId": c_data.get("projectId") or "aicode-consumers"
                })
        conn.close()
    except Exception:
        pass

ua = 'antigravity/hub/2.26.0 (aidev_client; os_type=linux; arch=amd64; cl=1005016104)'
for cred in agy_creds:
    acc_tok = cred['access']
    for attempt in range(2):
        try:
            req = urllib.request.Request(
                'https://daily-cloudcode-pa.googleapis.com/v1internal:retrieveUserQuotaSummary',
                data=json.dumps({'project': cred['projectId']}).encode('utf-8'),
                headers={
                    'Authorization': f'Bearer {acc_tok}',
                    'Content-Type': 'application/json',
                    'User-Agent': ua
                },
                method='POST'
            )
            with urllib.request.urlopen(req, timeout=1.8) as resp:
                if resp.status == 200:
                    qsum = json.loads(resp.read().decode())
                    limits = []
                    for g in qsum.get('groups', []):
                        for b in g.get('buckets', []):
                            if b.get('disabled') is True:
                                continue
                            bid = str(b.get('bucketId') or '')
                            win_raw = str(b.get('window') or '').lower()
                            dname = str(b.get('displayName') or '')
                            rf = b.get('remainingFraction')
                            if rf is None:
                                continue
                            rf = max(0.0, min(1.0, float(rf)))
                            dur_ms = 18000000 if ('5h' in win_raw or '5h' in bid) else 604800000
                            win_id = '5h' if dur_ms == 18000000 else 'weekly'
                            win_lbl = '5 Hour' if dur_ms == 18000000 else 'Weekly'
                            reset_ms = iso_to_ms(b.get('resetTime'))
                            if bid.startswith('3p-') or 'claude' in dname.lower() or 'gpt' in dname.lower():
                                providers_sub = [('anthropic', 'Claude & GPT (shared)'), ('openai', 'Claude & GPT (shared)')]
                            elif 'argon' in bid.lower():
                                providers_sub = [('google', 'Gemini (Argon)')]
                            else:
                                providers_sub = [('google', 'Gemini')]
                            for p_sub, lbl in providers_sub:
                                limits.append({
                                    'id': f'google-antigravity:{p_sub}:default:{bid}',
                                    'label': lbl,
                                    'window': {
                                        'id': win_id,
                                        'label': win_lbl,
                                        'durationMs': dur_ms,
                                        'resetsAt': reset_ms
                                    },
                                    'amount': {
                                        'unit': 'percent',
                                        'remainingFraction': rf,
                                        'usedFraction': 1.0 - rf,
                                        'remaining': rf * 100.0,
                                        'used': (1.0 - rf) * 100.0,
                                        'limit': 100
                                    },
                                    'status': 'ok'
                                })
                    if limits:
                        agy_live_entry = {
                            'value': {
                                'provider': 'google-antigravity',
                                'limits': limits,
                                'metadata': {'email': cred.get('email')} if cred.get('email') else {}
                            }
                        }
                        break
        except urllib.error.HTTPError as he:
            if he.code == 401 and attempt == 0 and cred.get('refresh'):
                try:
                    _cid = os.environ.get('GOOGLE_CLIENT_ID')
                    _csec = os.environ.get('GOOGLE_CLIENT_SECRET')
                    cfg_path = os.path.expanduser('~/.config/linux-island/oauth.json')
                    if (not _cid or not _csec) and os.path.exists(cfg_path):
                        try:
                            with open(cfg_path, 'r') as f:
                                cdata = json.load(f)
                                _cid = _cid or cdata.get('google_client_id')
                                _csec = _csec or cdata.get('google_client_secret')
                        except Exception:
                            pass
                    if _cid and _csec:
                        rbody = urllib.parse.urlencode({
                            'client_id': _cid,
                            'client_secret': _csec,
                            'refresh_token': cred['refresh'],
                            'grant_type': 'refresh_token'
                        }).encode('utf-8')
                        rreq = urllib.request.Request('https://oauth2.googleapis.com/token', data=rbody, method='POST')
                        with urllib.request.urlopen(rreq, timeout=1.8) as rresp:
                            rdata = json.loads(rresp.read().decode())
                            if rdata.get('access_token'):
                                acc_tok = rdata['access_token']
                                continue
                except Exception:
                    pass
            break
        except Exception:
            break
    if agy_live_entry:
        break

if agy_live_entry:
    raw['ompCache'].append(agy_live_entry)

if os.path.exists(db_path):
    try:
        conn = sqlite3.connect(f'file:{db_path}?mode=ro', uri=True)
        cur = conn.cursor()
        cur.execute("SELECT value FROM cache WHERE key LIKE 'usage_cache:report:%'")
        for (val_str,) in cur.fetchall():
            try:
                entry = json.loads(val_str)
                if isinstance(entry, dict):
                    v = entry.get('value', entry)
                    if isinstance(v, dict):
                        if agy_live_entry and v.get('provider') == 'google-antigravity':
                            continue
                        if 'metadata' in v and isinstance(v['metadata'], dict):
                            v['metadata'] = {k: v['metadata'][k] for k in v['metadata'] if k not in ('accountId', 'org')}
                raw['ompCache'].append(entry)
            except Exception:
                pass
        conn.close()
    except Exception:
        pass
# 2. Device Native Codex (~/.codex/auth.json live sync + session fallback)
device_codex = None
codex_auth_path = os.path.expanduser('~/.codex/auth.json')
if os.path.exists(codex_auth_path):
    try:
        with open(codex_auth_path, 'r', encoding='utf-8') as f:
            auth_data = json.load(f)
            tokens = auth_data.get('tokens', {})
            access_tok = tokens.get('access_token')
            acc_id = tokens.get('account_id')
            if access_tok:
                req = urllib.request.Request(
                    'https://chatgpt.com/backend-api/wham/usage',
                    headers={
                        'Authorization': f'Bearer {access_tok}',
                        'User-Agent': 'codex-cli/0.164.0',
                        'OpenAI-Account': acc_id or ''
                    }
                )
                try:
                    with urllib.request.urlopen(req, timeout=1.8) as resp:
                        if resp.status == 200:
                            wham = json.loads(resp.read().decode())
                            rl = wham.get('rate_limit', {})
                            pw = rl.get('primary_window')
                            sw = rl.get('secondary_window')
                            device_codex = {
                                'source': 'device-online',
                                'email': wham.get('email'),
                                'plan': wham.get('plan_type'),
                                'primary': {
                                    'used_percent': pw.get('used_percent', 0) if pw else 0,
                                    'window_minutes': (pw.get('limit_window_seconds', 18000) // 60) if pw else 300,
                                    'resets_at': pw.get('reset_at') if pw else None,
                                } if pw else None,
                                'secondary': {
                                    'used_percent': sw.get('used_percent', 0) if sw else 0,
                                    'window_minutes': (sw.get('limit_window_seconds', 604800) // 60) if sw else 10080,
                                    'resets_at': sw.get('reset_at') if sw else None,
                                } if sw else None,
                            }
                except Exception:
                    pass
    except Exception:
        pass

if not device_codex:
    codex_dir = os.path.expanduser('~/.codex/sessions')
    if os.path.isdir(codex_dir):
        try:
            files = sorted(glob.glob(f'{codex_dir}/*/*/*/*.jsonl'), key=os.path.getmtime, reverse=True)
            for filepath in files[:3]:
                try:
                    with open(filepath, 'r', encoding='utf-8') as f:
                        for line in reversed(f.readlines()):
                            if '"type":"token_count"' in line and 'rate_limits' in line:
                                obj = json.loads(line)
                                rl = obj.get('payload', {}).get('rate_limits')
                                if rl and (rl.get('primary') or rl.get('secondary')):
                                    device_codex = rl
                                    break
                    if device_codex:
                        break
                except Exception:
                    pass
        except Exception:
            pass

raw['deviceCodex'] = device_codex

# 3. Claude local presence
claude_json = os.path.expanduser('~/.claude.json')
claude_dir = os.path.expanduser('~/.claude')
if os.path.exists(claude_json) or os.path.isdir(claude_dir):
    raw['claudeLocal']['installed'] = True

print(json.dumps(raw))
`.trim();

export class AiQuotaCollector {
    constructor({ probeRunner, readFile, now = () => Date.now() } = {}) {
        this._probeRunner = probeRunner;
        this._readFile = readFile;
        this._now = now;
        this._lastSnapshot = buildAiQuotaSnapshot({}, this._now());
        this._refreshing = false;
        this._callbacks = [];
    }

    get lastSnapshot() {
        return this._lastSnapshot;
    }

    collect(onUpdated) {
        if (typeof this._probeRunner === 'function') {
            try {
                const res = this._probeRunner();
                if (res && typeof res === 'object') {
                    this._lastSnapshot = buildAiQuotaSnapshot(res, this._now());
                    return this._lastSnapshot;
                }
            } catch (_) {}
        }

        if (typeof this._readFile === 'function') {
            try {
                const res = this._readFile();
                if (res) {
                    const parsed = typeof res === 'string' ? JSON.parse(res) : res;
                    this._lastSnapshot = buildAiQuotaSnapshot(parsed, this._now());
                    return this._lastSnapshot;
                }
            } catch (_) {}
        }

        this.refreshAsync(onUpdated).catch(() => {});
        return this._lastSnapshot;
    }

    async refreshAsync(onUpdated) {
        if (typeof onUpdated === 'function') {
            this._callbacks.push(onUpdated);
        }

        if (this._refreshing) return this._lastSnapshot;
        this._refreshing = true;

        try {
            if (typeof this._probeRunner === 'function') {
                const raw = await this._probeRunner();
                const data = (raw && typeof raw === 'string') ? JSON.parse(raw) : (raw || {});
                this._lastSnapshot = buildAiQuotaSnapshot(data, this._now());
                this._flushCallbacks(this._lastSnapshot);
                return this._lastSnapshot;
            }

            if (!Gio?.Subprocess) {
                this._flushCallbacks(this._lastSnapshot);
                return this._lastSnapshot;
            }

            const proc = new Gio.Subprocess({
                argv: ['python3', '-c', PROBE_PYTHON_SNIPPET],
                flags: Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_SILENCE,
            });
            proc.init(null);

            await new Promise((resolve, reject) => {
                proc.communicate_utf8_async(null, null, (p, res) => {
                    try {
                        const [ok, stdout] = p.communicate_utf8_finish(res);
                        if (ok && stdout) {
                            const raw = JSON.parse(stdout);
                            this._lastSnapshot = buildAiQuotaSnapshot(raw, this._now());
                            this._flushCallbacks(this._lastSnapshot);
                        }
                        resolve(this._lastSnapshot);
                    } catch (e) {
                        reject(e);
                    }
                });
            });
        } catch (_) {
        } finally {
            this._refreshing = false;
        }

        return this._lastSnapshot;
    }

    _flushCallbacks(snapshot) {
        const cbs = this._callbacks;
        this._callbacks = [];
        for (const cb of cbs) {
            try { cb(snapshot); } catch (_) {}
        }
    }
}
