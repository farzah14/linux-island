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
    void testFloatingModeRejected();
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
}

void TestSettingsSchema::testValidPatch() {
    QVariantMap current = defaultSettings();
    QVariantMap patch = {
        {QStringLiteral("theme"), QStringLiteral("dark")},
        {QStringLiteral("capsuleSize"), QStringLiteral("large")},
        {QStringLiteral("notificationPeekEnabled"), true}
    };
    ValidationResult res = validateSettingsPatch(current, patch);
    QVERIFY(res.ok);
    QVERIFY(res.error.isEmpty());
    QCOMPARE(res.effective.value(QStringLiteral("theme")).toString(), QStringLiteral("dark"));
    QCOMPARE(res.effective.value(QStringLiteral("capsuleSize")).toString(), QStringLiteral("large"));
    QCOMPARE(res.effective.value(QStringLiteral("notificationPeekEnabled")).toBool(), true);
    QCOMPARE(res.effective.value(QStringLiteral("animationEnabled")).toBool(), true);
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
}

void TestSettingsSchema::testFloatingModeRejected() {
    QVariantMap current = defaultSettings();
    QVariantMap patch = {
        {QStringLiteral("displayMode"), QStringLiteral("floating")}
    };
    ValidationResult res = validateSettingsPatch(current, patch);
    QVERIFY(!res.ok);
    QVERIFY(!res.error.isEmpty());
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
