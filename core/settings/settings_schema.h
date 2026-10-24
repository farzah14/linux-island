#pragma once

#include <QVariantMap>
#include <QString>

struct ValidationResult {
    bool ok = false;
    QVariantMap effective;
    QString error;
};

QVariantMap defaultSettings();
ValidationResult validateSettingsPatch(const QVariantMap &current, const QVariantMap &patch);
