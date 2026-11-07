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
    void testCalendarAndTimerKeys();
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
    QCOMPARE(defaults.value(QStringLiteral("timerPresetMinutes")).toInt(), 25);
    QCOMPARE(defaults.value(QStringLiteral("timerBreakMinutes")).toInt(), 5);
    QCOMPARE(defaults.value(QStringLiteral("timerLongBreakMinutes")).toInt(), 15);
    QCOMPARE(defaults.value(QStringLiteral("timerCycles")).toInt(), 4);
    QCOMPARE(defaults.value(QStringLiteral("timerAutoAdvance")).toBool(), true);
    QCOMPARE(defaults.value(QStringLiteral("timerCompactHintEnabled")).toBool(), true);
}

void TestSettingsSchema::testValidPatch() {
    QVariantMap current = defaultSettings();
    QVariantMap patch = {
        {QStringLiteral("theme"), QStringLiteral("dark")},
        {QStringLiteral("capsuleSize"), QStringLiteral("large")},
        {QStringLiteral("notificationPeekEnabled"), true},
        {QStringLiteral("whatsappIntegrationEnabled"), true},
    };
    ValidationResult res = validateSettingsPatch(current, patch);
    QVERIFY(res.ok);
    QVERIFY(res.error.isEmpty());
    QCOMPARE(res.effective.value(QStringLiteral("theme")).toString(), QStringLiteral("dark"));
    QCOMPARE(res.effective.value(QStringLiteral("capsuleSize")).toString(), QStringLiteral("large"));
    QCOMPARE(res.effective.value(QStringLiteral("notificationPeekEnabled")).toBool(), true);
    QCOMPARE(res.effective.value(QStringLiteral("animationEnabled")).toBool(), true);
    QCOMPARE(res.effective.value(QStringLiteral("whatsappIntegrationEnabled")).toBool(), true);

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

void TestSettingsSchema::testCalendarAndTimerKeys() {
    const QVariantMap current = defaultSettings();

    QVariantMap accepted = {
        {QStringLiteral("timerPresetMinutes"), 45},
        {QStringLiteral("timerBreakMinutes"), 10},
        {QStringLiteral("timerLongBreakMinutes"), 30},
        {QStringLiteral("timerCycles"), 6},
        {QStringLiteral("timerAutoAdvance"), false},
        {QStringLiteral("timerCompactHintEnabled"), false},
    };
    ValidationResult res = validateSettingsPatch(current, accepted);
    QVERIFY2(res.ok, qPrintable(res.error));
    QCOMPARE(res.effective.value(QStringLiteral("timerPresetMinutes")).toInt(), 45);
    QCOMPARE(res.effective.value(QStringLiteral("timerLongBreakMinutes")).toInt(), 30);
    QCOMPARE(res.effective.value(QStringLiteral("timerCycles")).toInt(), 6);
    QCOMPARE(res.effective.value(QStringLiteral("timerAutoAdvance")).toBool(), false);

    // Inclusive bounds.
    QVERIFY(validateSettingsPatch(current, {{QStringLiteral("timerLongBreakMinutes"), 1}}).ok);
    QVERIFY(validateSettingsPatch(current, {{QStringLiteral("timerLongBreakMinutes"), 60}}).ok);
    QVERIFY(validateSettingsPatch(current, {{QStringLiteral("timerCycles"), 2}}).ok);
    QVERIFY(validateSettingsPatch(current, {{QStringLiteral("timerCycles"), 12}}).ok);

    struct Rejection {
        QString key;
        QVariant value;
        QString message;
    };
    const QList<Rejection> rejections = {
        {QStringLiteral("timerLongBreakMinutes"), 0, QStringLiteral("timerLongBreakMinutes must be between 1 and 60")},
        {QStringLiteral("timerLongBreakMinutes"), 61, QStringLiteral("timerLongBreakMinutes must be between 1 and 60")},
        {QStringLiteral("timerCycles"), 1, QStringLiteral("timerCycles must be between 2 and 12")},
        {QStringLiteral("timerCycles"), 13, QStringLiteral("timerCycles must be between 2 and 12")},
        {QStringLiteral("timerPresetMinutes"), 0, QStringLiteral("timerPresetMinutes must be between 1 and 180")},
        {QStringLiteral("timerPresetMinutes"), 181, QStringLiteral("timerPresetMinutes must be between 1 and 180")},
        {QStringLiteral("timerBreakMinutes"), 61, QStringLiteral("timerBreakMinutes must be between 1 and 60")},
        {QStringLiteral("timerCycles"), QStringLiteral("4"), QStringLiteral("timerCycles must be an integer")},
        {QStringLiteral("timerAutoAdvance"), 1, QStringLiteral("timerAutoAdvance must be a boolean")},
    };
    for (const Rejection &r : rejections) {
        ValidationResult bad = validateSettingsPatch(current, {{r.key, r.value}});
        QVERIFY2(!bad.ok, qPrintable(r.key));
        QCOMPARE(bad.error, r.message);
    }
}

QTEST_MAIN(TestSettingsSchema)
#include "tst_settings_schema.moc"
