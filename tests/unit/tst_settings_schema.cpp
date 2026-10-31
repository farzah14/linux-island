#include <QtTest>
#include "settings/settings_schema.h"

class TestSettingsSchema : public QObject {
    Q_OBJECT

private slots:
    void testDefaultSettings();
    void testValidPatch();
    void testUnknownKeyRejected();
    void testWrongTypeRejected();
    void testInvalidEnumRejected();
    void testDisplayModesValidation();
    void testLongPlayerIdRejected();
    void testOversizedPayloadRejected();
    void testTooManyEntriesRejected();
    void testPartialInvalidLeavesCurrentUnchanged();
};

void TestSettingsSchema::testDefaultSettings() {
    QVariantMap defaults = defaultSettings();
    QCOMPARE(defaults.value(QStringLiteral("theme")).toString(), QStringLiteral("system"));
    QCOMPARE(defaults.value(QStringLiteral("capsuleSize")).toString(), QStringLiteral("medium"));
    QCOMPARE(defaults.value(QStringLiteral("animationEnabled")).toBool(), true);
    QCOMPARE(defaults.value(QStringLiteral("hoverPreviewEnabled")).toBool(), true);
    QCOMPARE(defaults.value(QStringLiteral("notificationPeekEnabled")).toBool(), false);
    QCOMPARE(defaults.value(QStringLiteral("smartAdaptiveEnabled")).toBool(), true);
    QCOMPARE(defaults.value(QStringLiteral("preferredPlayerId")).toString(), QStringLiteral(""));
    QCOMPARE(defaults.value(QStringLiteral("displayMode")).toString(), QStringLiteral("dynamic"));
    QCOMPARE(defaults.value(QStringLiteral("whatsappIntegrationEnabled")).toBool(), false);
    QCOMPARE(defaults.value(QStringLiteral("verticalOffset")).toInt(), 8);
    QCOMPARE(defaults.value(QStringLiteral("horizontalOffset")).toInt(), 0);
    QCOMPARE(defaults.value(QStringLiteral("searchEngine")).toString(), QStringLiteral("google"));
}

void TestSettingsSchema::testValidPatch() {
    QVariantMap current = defaultSettings();
    QVariantMap patch = {
        {QStringLiteral("theme"), QStringLiteral("dark")},
        {QStringLiteral("capsuleSize"), QStringLiteral("large")},
        {QStringLiteral("notificationPeekEnabled"), true},
        {QStringLiteral("whatsappIntegrationEnabled"), true},
        {QStringLiteral("searchEngine"), QStringLiteral("duckduckgo")}
    };
    ValidationResult res = validateSettingsPatch(current, patch);
    QVERIFY(res.ok);
    QVERIFY(res.error.isEmpty());
    QCOMPARE(res.effective.value(QStringLiteral("theme")).toString(), QStringLiteral("dark"));
    QCOMPARE(res.effective.value(QStringLiteral("capsuleSize")).toString(), QStringLiteral("large"));
    QCOMPARE(res.effective.value(QStringLiteral("notificationPeekEnabled")).toBool(), true);
    QCOMPARE(res.effective.value(QStringLiteral("animationEnabled")).toBool(), true);
    QCOMPARE(res.effective.value(QStringLiteral("whatsappIntegrationEnabled")).toBool(), true);
    QCOMPARE(res.effective.value(QStringLiteral("searchEngine")).toString(), QStringLiteral("duckduckgo"));

    QVariantMap circlePatch = {
        {QStringLiteral("capsuleSize"), QStringLiteral("circle")}
    };
    ValidationResult circleRes = validateSettingsPatch(current, circlePatch);
    QVERIFY(circleRes.ok);
    QVERIFY(circleRes.error.isEmpty());
    QCOMPARE(circleRes.effective.value(QStringLiteral("capsuleSize")).toString(), QStringLiteral("circle"));

    QVariantMap offsetPatch = {
        {QStringLiteral("verticalOffset"), 24},
        {QStringLiteral("horizontalOffset"), -50}
    };
    ValidationResult offsetRes = validateSettingsPatch(current, offsetPatch);
    QVERIFY(offsetRes.ok);
    QVERIFY(offsetRes.error.isEmpty());
    QCOMPARE(offsetRes.effective.value(QStringLiteral("verticalOffset")).toInt(), 24);
    QCOMPARE(offsetRes.effective.value(QStringLiteral("horizontalOffset")).toInt(), -50);
}
void TestSettingsSchema::testUnknownKeyRejected() {
    QVariantMap current = defaultSettings();
    QVariantMap patch = {
        {QStringLiteral("nonExistentKey"), 123}
    };
    ValidationResult res = validateSettingsPatch(current, patch);
    QVERIFY(!res.ok);
    QVERIFY(!res.error.isEmpty());
}

void TestSettingsSchema::testWrongTypeRejected() {
    QVariantMap current = defaultSettings();
    // String instead of bool
    QVariantMap patch1 = {
        {QStringLiteral("animationEnabled"), QStringLiteral("true")}
    };
    ValidationResult res1 = validateSettingsPatch(current, patch1);
    QVERIFY(!res1.ok);

    // Bool instead of string
    QVariantMap patch2 = {
        {QStringLiteral("theme"), true}
    };
    ValidationResult res2 = validateSettingsPatch(current, patch2);
    QVERIFY(!res2.ok);

    // String instead of int
    QVariantMap patch3 = {
        {QStringLiteral("verticalOffset"), QStringLiteral("20")}
    };
    ValidationResult res3 = validateSettingsPatch(current, patch3);
    QVERIFY(!res3.ok);

    // Bool instead of int
    QVariantMap patch4 = {
        {QStringLiteral("horizontalOffset"), false}
    };
    ValidationResult res4 = validateSettingsPatch(current, patch4);
    QVERIFY(!res4.ok);

    // Bool instead of string for searchEngine
    QVariantMap patch5 = {
        {QStringLiteral("searchEngine"), true}
    };
    QVERIFY(!validateSettingsPatch(current, patch5).ok);
}

void TestSettingsSchema::testInvalidEnumRejected() {
    QVariantMap current = defaultSettings();
    QVariantMap patch = {
        {QStringLiteral("theme"), QStringLiteral("neon")},
        {QStringLiteral("capsuleSize"), QStringLiteral("huge")}
    };
    ValidationResult res = validateSettingsPatch(current, patch);
    QVERIFY(!res.ok);
    QVERIFY(!res.error.isEmpty());

    // Unknown search engine should be rejected on its own, since validation
    // stops at the first invalid key.
    QVariantMap patchSearch = {
        {QStringLiteral("searchEngine"), QStringLiteral("yandex")}
    };
    QVERIFY(!validateSettingsPatch(current, patchSearch).ok);

    // Out of bounds offsets
    QVariantMap patchBounds1 = {
        {QStringLiteral("verticalOffset"), -1}
    };
    QVERIFY(!validateSettingsPatch(current, patchBounds1).ok);

    QVariantMap patchBounds2 = {
        {QStringLiteral("verticalOffset"), 121}
    };
    QVERIFY(!validateSettingsPatch(current, patchBounds2).ok);

    QVariantMap patchBounds3 = {
        {QStringLiteral("horizontalOffset"), -501}
    };
    QVERIFY(!validateSettingsPatch(current, patchBounds3).ok);

    QVariantMap patchBounds4 = {
        {QStringLiteral("horizontalOffset"), 501}
    };
    QVERIFY(!validateSettingsPatch(current, patchBounds4).ok);
}

void TestSettingsSchema::testDisplayModesValidation() {
    QVariantMap current = defaultSettings();

    // dynamic, floating, and integrated should all be valid
    for (const QString &mode : {QStringLiteral("dynamic"), QStringLiteral("floating"), QStringLiteral("integrated")}) {
        QVariantMap patch = {{QStringLiteral("displayMode"), mode}};
        ValidationResult res = validateSettingsPatch(current, patch);
        QVERIFY(res.ok);
        QVERIFY(res.error.isEmpty());
        QCOMPARE(res.effective.value(QStringLiteral("displayMode")).toString(), mode);
    }

    // Unknown display mode should be rejected
    QVariantMap invalidPatch = {{QStringLiteral("displayMode"), QStringLiteral("unknown_mode")}};
    ValidationResult invalidRes = validateSettingsPatch(current, invalidPatch);
    QVERIFY(!invalidRes.ok);
    QVERIFY(!invalidRes.error.isEmpty());
}

void TestSettingsSchema::testLongPlayerIdRejected() {
    QVariantMap current = defaultSettings();
    QString longId(300, 'a');
    QVariantMap patch = {
        {QStringLiteral("preferredPlayerId"), longId}
    };
    ValidationResult res = validateSettingsPatch(current, patch);
    QVERIFY(!res.ok);
    QVERIFY(!res.error.isEmpty());
}

void TestSettingsSchema::testOversizedPayloadRejected() {
    QVariantMap current = defaultSettings();
    QString huge(20000, 'x');
    QVariantMap patch = {
        {QStringLiteral("theme"), huge}
    };
    ValidationResult res = validateSettingsPatch(current, patch);
    QVERIFY(!res.ok);
}

void TestSettingsSchema::testTooManyEntriesRejected() {
    QVariantMap current = defaultSettings();
    QVariantMap patch;
    for (int i = 0; i < 35; ++i) {
        patch[QStringLiteral("key_%1").arg(i)] = i;
    }
    ValidationResult res = validateSettingsPatch(current, patch);
    QVERIFY(!res.ok);
}

void TestSettingsSchema::testPartialInvalidLeavesCurrentUnchanged() {
    QVariantMap current = defaultSettings();
    // One valid key, one invalid key
    QVariantMap patch = {
        {QStringLiteral("theme"), QStringLiteral("dark")},
        {QStringLiteral("capsuleSize"), QStringLiteral("huge")}
    };
    ValidationResult res = validateSettingsPatch(current, patch);
    QVERIFY(!res.ok);
    // If validation fails, current must remain completely untouched
    QCOMPARE(current.value(QStringLiteral("theme")).toString(), QStringLiteral("system"));
}

QTEST_MAIN(TestSettingsSchema)
#include "tst_settings_schema.moc"
