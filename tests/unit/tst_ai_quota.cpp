#include <QtTest>
#include "../../island-ui/ai_quota_provider.h"

class TestAiQuota : public QObject {
    Q_OBJECT

private slots:
    void testFormatResetCountdown();
    void testBuildSnapshotFromRawJson();
    void testAntigravitySeparatesGeminiAndShared3pLimits();
};

void TestAiQuota::testFormatResetCountdown() {
    qint64 now = 10000000;
    QCOMPARE(AiQuotaProvider::formatResetCountdown(now - 1000, now), QStringLiteral("now"));
    QCOMPARE(AiQuotaProvider::formatResetCountdown(now, now), QStringLiteral("now"));
    // 30 minutes in future: 1800000 ms
    QCOMPARE(AiQuotaProvider::formatResetCountdown(now + 1800000, now), QStringLiteral("30m"));
    // 2 hours 15 minutes: 2 * 3600000 + 15 * 60000 = 8100000 ms
    QCOMPARE(AiQuotaProvider::formatResetCountdown(now + 8100000, now), QStringLiteral("2h 15m"));
    // 3 days 4 hours: 3 * 86400000 + 4 * 3600000 = 273600000 ms
    QCOMPARE(AiQuotaProvider::formatResetCountdown(now + 273600000, now), QStringLiteral("3d 4h"));
}

void TestAiQuota::testBuildSnapshotFromRawJson() {
    QByteArray rawJson = R"({
        "ompCache": [
            {
                "provider": "google-antigravity",
                "limits": [
                    {
                        "id": "gemini-flash-5h",
                        "window": { "durationMs": 18000000, "resetsAt": 1001800000 },
                        "amount": { "remainingFraction": 0.85 }
                    },
                    {
                        "id": "argon-weekly",
                        "window": { "durationMs": 604800000, "resetsAt": 1006048000 },
                        "amount": { "remainingFraction": 0.92 }
                    }
                ]
            }
        ],
        "deviceCodex": {
            "source": "device-online",
            "primary": { "used_percent": 12.0 },
            "secondary": { "used_percent": 25.0 }
        },
        "claudeLocal": { "installed": true }
    })";

    qint64 now = 1000000000;
    QVariantMap snapshot = AiQuotaProvider::buildSnapshotFromRawJson(rawJson, now);
    QVERIFY(snapshot.contains(QStringLiteral("antigravity")));
    QVERIFY(snapshot.contains(QStringLiteral("codex")));
    QVERIFY(snapshot.contains(QStringLiteral("claude")));

    QVariantMap agy = snapshot.value(QStringLiteral("antigravity")).toMap();
    QCOMPARE(agy.value(QStringLiteral("connected")).toBool(), true);
    QCOMPARE(agy.value(QStringLiteral("percent5h")).toInt(), 85);
    QCOMPARE(agy.value(QStringLiteral("percent7d")).toInt(), 92);
    QCOMPARE(agy.value(QStringLiteral("remainingPercent")).toInt(), 85);

    QVariantMap codex = snapshot.value(QStringLiteral("codex")).toMap();
    QCOMPARE(codex.value(QStringLiteral("connected")).toBool(), true);
    QCOMPARE(codex.value(QStringLiteral("percent5h")).toInt(), 88);
    QCOMPARE(codex.value(QStringLiteral("percent7d")).toInt(), 75);

    QVariantMap claude = snapshot.value(QStringLiteral("claude")).toMap();
    QCOMPARE(claude.value(QStringLiteral("connected")).toBool(), true);
    QCOMPARE(claude.value(QStringLiteral("primaryText")).toString(), QStringLiteral("Ready"));
}

void TestAiQuota::testAntigravitySeparatesGeminiAndShared3pLimits() {
    QByteArray rawJson = R"JSON({
        "ompCache": [
            {
                "value": {
                    "provider": "google-antigravity",
                    "limits": [
                        {
                            "id": "google-antigravity:google:default:gemini-5h",
                            "label": "Gemini",
                            "window": { "durationMs": 18000000, "resetsAt": 1001800000 },
                            "amount": { "remainingFraction": 0.50 }
                        },
                        {
                            "id": "google-antigravity:google:default:gemini-weekly",
                            "label": "Gemini",
                            "window": { "durationMs": 604800000, "resetsAt": 1006048000 },
                            "amount": { "remainingFraction": 0.63 }
                        },
                        {
                            "id": "google-antigravity:google:default:gemini-argon-wtu-weekly",
                            "label": "Gemini (Argon)",
                            "window": { "durationMs": 604800000, "resetsAt": 1006048000 },
                            "amount": { "remainingFraction": 0.55 }
                        },
                        {
                            "id": "google-antigravity:anthropic:default:3p-weekly",
                            "label": "Claude & GPT (shared)",
                            "window": { "durationMs": 604800000, "resetsAt": 1006048000 },
                            "amount": { "remainingFraction": 1.0 }
                        },
                        {
                            "id": "google-antigravity:openai:default:3p-5h",
                            "label": "Claude & GPT (shared)",
                            "window": { "durationMs": 18000000, "resetsAt": 1001800000 },
                            "amount": { "remainingFraction": 1.0 }
                        }
                    ]
                }
            }
        ],
        "claudeLocal": { "installed": true }
    })JSON";

    qint64 now = 1000000000;
    QVariantMap snapshot = AiQuotaProvider::buildSnapshotFromRawJson(rawJson, now);
    QVariantMap agy = snapshot.value(QStringLiteral("antigravity")).toMap();
    QCOMPARE(agy.value(QStringLiteral("connected")).toBool(), true);
    QCOMPARE(agy.value(QStringLiteral("percent5h")).toInt(), 50);
    QCOMPARE(agy.value(QStringLiteral("percent7d")).toInt(), 63);
    QCOMPARE(agy.value(QStringLiteral("remainingPercent")).toInt(), 50);
    QVERIFY(agy.value(QStringLiteral("altDetailText")).toString().contains(QStringLiteral("Argon: 55%")));

    QVariantMap claude = snapshot.value(QStringLiteral("claude")).toMap();
    QCOMPARE(claude.value(QStringLiteral("connected")).toBool(), true);
    QCOMPARE(claude.value(QStringLiteral("source")).toString(), QStringLiteral("antigravity-shared"));
    QCOMPARE(claude.value(QStringLiteral("percent5h")).toInt(), 100);
    QCOMPARE(claude.value(QStringLiteral("percent7d")).toInt(), 100);
}

QTEST_MAIN(TestAiQuota)
#include "tst_ai_quota.moc"
