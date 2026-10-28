#include "ai_quota_provider.h"
#include <QJsonDocument>
#include <QJsonObject>
#include <QJsonArray>
#include <QDateTime>
#include <cmath>
#include <algorithm>

static const char *PROBE_SNIPPET = R"PY(
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
# 2. Device Native Codex
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
)PY";

AiQuotaProvider::AiQuotaProvider(QObject *parent)
    : QObject(parent) {
    // Initial default offline maps
    m_antigravity = {
        {QStringLiteral("connected"), false},
        {QStringLiteral("remainingPercent"), 0},
        {QStringLiteral("usedPercent"), 0},
        {QStringLiteral("primaryText"), QStringLiteral("Offline")},
        {QStringLiteral("detailText"), QStringLiteral("No active session")},
        {QStringLiteral("altDetailText"), QStringLiteral("No active session")},
        {QStringLiteral("percent5h"), 0},
        {QStringLiteral("percent7d"), 0},
        {QStringLiteral("detail5h"), QStringLiteral("5h: --%")},
        {QStringLiteral("detail7d"), QStringLiteral("7d: --%")}
    };
    m_codex = m_antigravity;
    m_claude = m_antigravity;

    refresh();
}

AiQuotaProvider::~AiQuotaProvider() {
    if (m_process && m_process->state() != QProcess::NotRunning) {
        m_process->kill();
        m_process->waitForFinished(500);
    }
}

QString AiQuotaProvider::formatResetCountdown(qint64 resetsAtMs, qint64 nowMs) {
    if (resetsAtMs <= 0) return QString();
    qint64 diffMs = resetsAtMs - nowMs;
    if (diffMs <= 0) return QStringLiteral("now");
    if (diffMs < 3600000) {
        qint64 m = std::max<qint64>(1, diffMs / 60000);
        return QString::number(m) + QStringLiteral("m");
    }
    if (diffMs < 86400000) {
        qint64 h = diffMs / 3600000;
        qint64 m = (diffMs % 3600000) / 60000;
        return QString::number(h) + QStringLiteral("h ") + QString::number(m) + QStringLiteral("m");
    }
    qint64 d = diffMs / 86400000;
    qint64 h = (diffMs % 86400000) / 3600000;
    return QString::number(d) + QStringLiteral("d ") + QString::number(h) + QStringLiteral("h");
}

static int parseLimitPercent(const QJsonObject &limitObj) {
    QJsonObject amt = limitObj.value(QStringLiteral("amount")).toObject();
    if (amt.contains(QStringLiteral("remainingFraction"))) {
        double rf = amt.value(QStringLiteral("remainingFraction")).toDouble();
        return std::clamp<int>(std::round(rf * 100.0), 0, 100);
    }
    if (amt.contains(QStringLiteral("usedFraction"))) {
        double uf = amt.value(QStringLiteral("usedFraction")).toDouble();
        return std::clamp<int>(std::round((1.0 - uf) * 100.0), 0, 100);
    }
    if (amt.contains(QStringLiteral("remaining")) && amt.contains(QStringLiteral("limit"))) {
        double rem = amt.value(QStringLiteral("remaining")).toDouble();
        double lim = amt.value(QStringLiteral("limit")).toDouble();
        if (lim > 0) {
            return std::clamp<int>(std::round((rem / lim) * 100.0), 0, 100);
        }
    }
    return 100;
}

QVariantMap AiQuotaProvider::buildSnapshotFromRawJson(const QByteArray &rawJson, qint64 nowMs) {
    QJsonDocument doc = QJsonDocument::fromJson(rawJson);
    QJsonObject root = doc.object();

    QVariantMap result;

    // 1. Antigravity
    QVariantMap agy;
    agy[QStringLiteral("connected")] = false;
    agy[QStringLiteral("remainingPercent")] = 0;
    agy[QStringLiteral("usedPercent")] = 0;
    agy[QStringLiteral("primaryText")] = QStringLiteral("Offline");
    agy[QStringLiteral("detailText")] = QStringLiteral("No active session");
    agy[QStringLiteral("altDetailText")] = QStringLiteral("No active session");
    agy[QStringLiteral("percent5h")] = 0;
    agy[QStringLiteral("percent7d")] = 0;
    agy[QStringLiteral("detail5h")] = QStringLiteral("5h: --%");
    agy[QStringLiteral("detail7d")] = QStringLiteral("7d: --%");

    // 2. Codex
    QVariantMap codex = agy;

    // 3. Claude
    QVariantMap claude = agy;

    int agyShared5 = -1;
    int agyShared7 = -1;
    QString agySharedReset5;
    QString agySharedReset7;

    QJsonArray ompCache = root.value(QStringLiteral("ompCache")).toArray();
    for (const QJsonValue &v : ompCache) {
        QJsonObject entry = v.toObject();
        QJsonObject val = entry.contains(QStringLiteral("value")) && entry.value(QStringLiteral("value")).isObject()
                              ? entry.value(QStringLiteral("value")).toObject()
                              : entry;

        QString provider = val.value(QStringLiteral("provider")).toString();
        QJsonArray limits = val.value(QStringLiteral("limits")).toArray();

        if (provider == QLatin1String("google-antigravity") || provider == QLatin1String("antigravity")) {
            int p5 = -1;
            int p7 = -1;
            int pArgon = -1;
            QString reset5;
            QString reset7;
            QString resetArgon;

            for (const QJsonValue &lv : limits) {
                QJsonObject l = lv.toObject();
                QString lid = l.value(QStringLiteral("id")).toString().toLower();
                QString llabel = l.value(QStringLiteral("label")).toString().toLower();
                QJsonObject win = l.value(QStringLiteral("window")).toObject();
                qint64 dur = qint64(win.value(QStringLiteral("durationMs")).toDouble());
                qint64 resetAt = qint64(win.value(QStringLiteral("resetsAt")).toDouble());
                QString resetStr = (resetAt > 0) ? formatResetCountdown(resetAt, nowMs) : QString();

                int pct = parseLimitPercent(l);
                bool is3p = lid.contains(QLatin1String("anthropic")) || lid.contains(QLatin1String("openai")) ||
                            lid.contains(QLatin1String("3p")) || llabel.contains(QLatin1String("claude"));

                if (is3p) {
                    if (dur == 18000000 || lid.contains(QLatin1String("5h"))) {
                        agyShared5 = pct;
                        if (!resetStr.isEmpty()) agySharedReset5 = resetStr;
                    } else if (dur == 604800000 || lid.contains(QLatin1String("7d")) || lid.contains(QLatin1String("weekly"))) {
                        agyShared7 = pct;
                        if (!resetStr.isEmpty()) agySharedReset7 = resetStr;
                    }
                    continue;
                }

                if (lid.contains(QLatin1String("argon"))) {
                    pArgon = pct;
                    if (!resetStr.isEmpty()) resetArgon = resetStr;
                } else if (dur == 18000000 || lid.contains(QLatin1String("5h")) || lid.contains(QLatin1String("flash"))) {
                    p5 = pct;
                    if (!resetStr.isEmpty()) reset5 = resetStr;
                } else if (dur == 604800000 || lid.contains(QLatin1String("7d")) || lid.contains(QLatin1String("weekly"))) {
                    p7 = pct;
                    if (!resetStr.isEmpty()) reset7 = resetStr;
                }
            }

            if (p5 >= 0 || p7 >= 0 || pArgon >= 0) {
                agy[QStringLiteral("connected")] = true;
                int act5 = (p5 >= 0) ? p5 : 100;
                int act7 = (p7 >= 0) ? p7 : ((pArgon >= 0) ? pArgon : 100);
                int minRem = std::min(act5, act7);
                if (pArgon >= 0) minRem = std::min(minRem, pArgon);

                agy[QStringLiteral("remainingPercent")] = minRem;
                agy[QStringLiteral("usedPercent")] = 100 - minRem;
                agy[QStringLiteral("primaryText")] = QString::number(minRem) + QStringLiteral("% left");
                agy[QStringLiteral("percent5h")] = act5;
                agy[QStringLiteral("percent7d")] = act7;
                agy[QStringLiteral("detail5h")] = QStringLiteral("5h: ") + QString::number(act5) + QStringLiteral("%");
                agy[QStringLiteral("detail7d")] = QStringLiteral("7d: ") + QString::number(act7) + QStringLiteral("%");

                QString detail = QString::number(act5) + QStringLiteral("% left (") + QString::number(100 - act5) + QStringLiteral("% used)");
                if (!reset5.isEmpty() && reset5 != QLatin1String("now")) {
                    detail += QStringLiteral(" · ↻ resets in ") + reset5;
                }
                QString altDetail = QString::number(act7) + QStringLiteral("% left (") + QString::number(100 - act7) + QStringLiteral("% used)");
                if (pArgon >= 0 && p7 >= 0) {
                    altDetail += QStringLiteral(" · Argon: ") + QString::number(pArgon) + QStringLiteral("%");
                }
                QString effReset7 = !reset7.isEmpty() ? reset7 : resetArgon;
                if (!effReset7.isEmpty() && effReset7 != QLatin1String("now")) {
                    altDetail += QStringLiteral(" · ↻ resets in ") + effReset7;
                }
                agy[QStringLiteral("detailText")] = detail;
                agy[QStringLiteral("altDetailText")] = altDetail;
            }
        } else if (provider == QLatin1String("claude") || provider == QLatin1String("claude-code") || provider == QLatin1String("anthropic")) {
            int p5 = -1;
            int p7 = -1;
            QString reset5;
            QString reset7;
            for (const QJsonValue &lv : limits) {
                QJsonObject l = lv.toObject();
                QString lid = l.value(QStringLiteral("id")).toString().toLower();
                QJsonObject win = l.value(QStringLiteral("window")).toObject();
                qint64 dur = qint64(win.value(QStringLiteral("durationMs")).toDouble());
                qint64 resetAt = qint64(win.value(QStringLiteral("resetsAt")).toDouble());
                QString resetStr = (resetAt > 0) ? formatResetCountdown(resetAt, nowMs) : QString();
                int pct = parseLimitPercent(l);
                if (dur == 18000000 || lid.contains(QLatin1String("5h"))) {
                    p5 = pct;
                    if (!resetStr.isEmpty()) reset5 = resetStr;
                } else if (dur == 604800000 || lid.contains(QLatin1String("7d")) || lid.contains(QLatin1String("weekly"))) {
                    p7 = pct;
                    if (!resetStr.isEmpty()) reset7 = resetStr;
                }
            }
            if (p5 >= 0 || p7 >= 0) {
                claude[QStringLiteral("connected")] = true;
                claude[QStringLiteral("source")] = QStringLiteral("standalone");
                int act5 = (p5 >= 0) ? p5 : 100;
                int act7 = (p7 >= 0) ? p7 : 100;
                int minRem = std::min(act5, act7);
                claude[QStringLiteral("remainingPercent")] = minRem;
                claude[QStringLiteral("usedPercent")] = 100 - minRem;
                claude[QStringLiteral("primaryText")] = QString::number(minRem) + QStringLiteral("% left");
                claude[QStringLiteral("percent5h")] = act5;
                claude[QStringLiteral("percent7d")] = act7;
                claude[QStringLiteral("detail5h")] = QStringLiteral("5h: ") + QString::number(act5) + QStringLiteral("%");
                claude[QStringLiteral("detail7d")] = QStringLiteral("7d: ") + QString::number(act7) + QStringLiteral("%");
                QString d5 = QString::number(act5) + QStringLiteral("% left (") + QString::number(100 - act5) + QStringLiteral("% used)");
                if (!reset5.isEmpty() && reset5 != QLatin1String("now")) d5 += QStringLiteral(" · ↻ resets in ") + reset5;
                QString d7 = QString::number(act7) + QStringLiteral("% left (") + QString::number(100 - act7) + QStringLiteral("% used)");
                if (!reset7.isEmpty() && reset7 != QLatin1String("now")) d7 += QStringLiteral(" · ↻ resets in ") + reset7;
                claude[QStringLiteral("detailText")] = d5;
                claude[QStringLiteral("altDetailText")] = d7;
            }
        }
    }

    // Codex Device
    if (root.contains(QStringLiteral("deviceCodex")) && root.value(QStringLiteral("deviceCodex")).isObject()) {
        QJsonObject dc = root.value(QStringLiteral("deviceCodex")).toObject();
        QJsonObject pw = dc.value(QStringLiteral("primary")).toObject();
        QJsonObject sw = dc.value(QStringLiteral("secondary")).toObject();

        double u5 = pw.value(QStringLiteral("used_percent")).toDouble();
        double u7 = sw.value(QStringLiteral("used_percent")).toDouble();
        int rem5 = std::clamp<int>(100 - std::round(u5), 0, 100);
        int rem7 = std::clamp<int>(100 - std::round(u7), 0, 100);

        qint64 r5Raw = qint64(pw.value(QStringLiteral("resets_at")).toDouble());
        qint64 r7Raw = qint64(sw.value(QStringLiteral("resets_at")).toDouble());
        qint64 r5Ms = (r5Raw > 0) ? (r5Raw > 100000000000LL ? r5Raw : r5Raw * 1000LL) : 0;
        qint64 r7Ms = (r7Raw > 0) ? (r7Raw > 100000000000LL ? r7Raw : r7Raw * 1000LL) : 0;
        if (r5Ms > 0 && nowMs >= r5Ms) rem5 = 100;
        if (r7Ms > 0 && nowMs >= r7Ms) rem7 = 100;
        QString reset5 = (r5Ms > nowMs) ? formatResetCountdown(r5Ms, nowMs) : QString();
        QString reset7 = (r7Ms > nowMs) ? formatResetCountdown(r7Ms, nowMs) : QString();

        codex[QStringLiteral("connected")] = true;
        int minRem = std::min(rem5, rem7);
        codex[QStringLiteral("remainingPercent")] = minRem;
        codex[QStringLiteral("usedPercent")] = 100 - minRem;
        codex[QStringLiteral("primaryText")] = QString::number(minRem) + QStringLiteral("% left");
        codex[QStringLiteral("percent5h")] = rem5;
        codex[QStringLiteral("percent7d")] = rem7;
        codex[QStringLiteral("detail5h")] = QStringLiteral("5h: ") + QString::number(rem5) + QStringLiteral("%");
        codex[QStringLiteral("detail7d")] = QStringLiteral("7d: ") + QString::number(rem7) + QStringLiteral("%");

        QString d5 = QString::number(rem5) + QStringLiteral("% left (") + QString::number(100 - rem5) + QStringLiteral("% used)");
        if (!reset5.isEmpty() && reset5 != QLatin1String("now")) d5 += QStringLiteral(" · ↻ resets in ") + reset5;
        QString d7 = QString::number(rem7) + QStringLiteral("% left (") + QString::number(100 - rem7) + QStringLiteral("% used)");
        if (!reset7.isEmpty() && reset7 != QLatin1String("now")) d7 += QStringLiteral(" · ↻ resets in ") + reset7;
        codex[QStringLiteral("detailText")] = d5;
        codex[QStringLiteral("altDetailText")] = d7;
    }

    // Claude fallback 1: Antigravity shared Claude & GPT quota
    if (!claude.value(QStringLiteral("connected")).toBool() && (agyShared5 >= 0 || agyShared7 >= 0)) {
        int act5 = (agyShared5 >= 0) ? agyShared5 : 100;
        int act7 = (agyShared7 >= 0) ? agyShared7 : 100;
        int minRem = std::min(act5, act7);
        claude[QStringLiteral("connected")] = true;
        claude[QStringLiteral("source")] = QStringLiteral("antigravity-shared");
        claude[QStringLiteral("remainingPercent")] = minRem;
        claude[QStringLiteral("usedPercent")] = 100 - minRem;
        claude[QStringLiteral("primaryText")] = QString::number(minRem) + QStringLiteral("% left");
        claude[QStringLiteral("percent5h")] = act5;
        claude[QStringLiteral("percent7d")] = act7;
        claude[QStringLiteral("detail5h")] = QStringLiteral("5h: ") + QString::number(act5) + QStringLiteral("%");
        claude[QStringLiteral("detail7d")] = QStringLiteral("7d: ") + QString::number(act7) + QStringLiteral("%");
        QString d5 = QString::number(act5) + QStringLiteral("% left (") + QString::number(100 - act5) + QStringLiteral("% used)");
        if (!agySharedReset5.isEmpty() && agySharedReset5 != QLatin1String("now")) d5 += QStringLiteral(" · ↻ resets in ") + agySharedReset5;
        QString d7 = QString::number(act7) + QStringLiteral("% left (") + QString::number(100 - act7) + QStringLiteral("% used)");
        if (!agySharedReset7.isEmpty() && agySharedReset7 != QLatin1String("now")) d7 += QStringLiteral(" · ↻ resets in ") + agySharedReset7;
        claude[QStringLiteral("detailText")] = d5;
        claude[QStringLiteral("altDetailText")] = d7;
    }

    // Claude fallback 2: local CLI installed
    if (!claude.value(QStringLiteral("connected")).toBool()) {
        QJsonObject cl = root.value(QStringLiteral("claudeLocal")).toObject();
        if (cl.value(QStringLiteral("installed")).toBool()) {
            claude[QStringLiteral("connected")] = true;
            claude[QStringLiteral("source")] = QStringLiteral("local-installed");
            claude[QStringLiteral("remainingPercent")] = 100;
            claude[QStringLiteral("usedPercent")] = 0;
            claude[QStringLiteral("primaryText")] = QStringLiteral("Ready");
            claude[QStringLiteral("detailText")] = QStringLiteral("Claude Code CLI installed");
            claude[QStringLiteral("altDetailText")] = QStringLiteral("Claude Code CLI installed");
            claude[QStringLiteral("percent5h")] = 100;
            claude[QStringLiteral("percent7d")] = 100;
            claude[QStringLiteral("detail5h")] = QStringLiteral("5h: 100%");
            claude[QStringLiteral("detail7d")] = QStringLiteral("7d: 100%");
        }
    }
    result[QStringLiteral("antigravity")] = agy;
    result[QStringLiteral("codex")] = codex;
    result[QStringLiteral("claude")] = claude;
    return result;
}

void AiQuotaProvider::refresh() {
    if (m_refreshing) return;
    m_refreshing = true;
    emit refreshingChanged();

    if (!m_process) {
        m_process = new QProcess(this);
        connect(m_process, QOverload<int, QProcess::ExitStatus>::of(&QProcess::finished),
                this, &AiQuotaProvider::onProcessFinished);
    }

    m_process->start(QStringLiteral("python3"), {QStringLiteral("-c"), QString::fromUtf8(PROBE_SNIPPET)});
}

void AiQuotaProvider::onProcessFinished(int exitCode, QProcess::ExitStatus exitStatus) {
    m_refreshing = false;
    emit refreshingChanged();

    if (exitStatus == QProcess::NormalExit && exitCode == 0 && m_process) {
        QByteArray stdoutData = m_process->readAllStandardOutput();
        qint64 nowMs = QDateTime::currentMSecsSinceEpoch();
        QVariantMap snapshot = buildSnapshotFromRawJson(stdoutData, nowMs);
        if (snapshot.contains(QStringLiteral("antigravity"))) {
            m_antigravity = snapshot.value(QStringLiteral("antigravity")).toMap();
            m_codex = snapshot.value(QStringLiteral("codex")).toMap();
            m_claude = snapshot.value(QStringLiteral("claude")).toMap();
            emit quotaChanged();
        }
    }
}
