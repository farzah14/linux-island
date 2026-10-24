#include "settings_schema.h"
#include <QSet>

QVariantMap defaultSettings() {
    QVariantMap map;
    map[QStringLiteral("theme")] = QStringLiteral("system");
    map[QStringLiteral("capsuleSize")] = QStringLiteral("medium");
    map[QStringLiteral("animationEnabled")] = true;
    map[QStringLiteral("hoverPreviewEnabled")] = true;
    map[QStringLiteral("notificationPeekEnabled")] = false;
    map[QStringLiteral("smartAdaptiveEnabled")] = true;
    map[QStringLiteral("preferredPlayerId")] = QStringLiteral("");
    map[QStringLiteral("displayMode")] = QStringLiteral("dynamic");
    return map;
}

ValidationResult validateSettingsPatch(const QVariantMap &current, const QVariantMap &patch) {
    static const QSet<QString> allowedKeys = {
        QStringLiteral("theme"),
        QStringLiteral("capsuleSize"),
        QStringLiteral("animationEnabled"),
        QStringLiteral("hoverPreviewEnabled"),
        QStringLiteral("notificationPeekEnabled"),
        QStringLiteral("smartAdaptiveEnabled"),
        QStringLiteral("preferredPlayerId"),
        QStringLiteral("displayMode")
    };

    static const QSet<QString> allowedThemes = {
        QStringLiteral("system"),
        QStringLiteral("dark"),
        QStringLiteral("light")
    };

    static const QSet<QString> allowedCapsuleSizes = {
        QStringLiteral("small"),
        QStringLiteral("medium"),
        QStringLiteral("large")
    };

    if (patch.size() > 32) {
        return ValidationResult{false, current, QStringLiteral("Settings patch exceeds maximum entry limit of 32")};
    }

    int approxSize = 0;
    for (auto it = patch.begin(); it != patch.end(); ++it) {
        approxSize += it.key().toUtf8().size() + it.value().toString().toUtf8().size() + 16;
    }
    if (approxSize > 16384) {
        return ValidationResult{false, current, QStringLiteral("Settings patch exceeds maximum payload limit of 16 KiB")};
    }

    // First validate all keys in patch
    for (auto it = patch.begin(); it != patch.end(); ++it) {
        const QString &key = it.key();
        const QVariant &val = it.value();

        if (!allowedKeys.contains(key)) {
            return ValidationResult{false, current, QStringLiteral("Unknown settings key: ") + key};
        }

        if (key == QLatin1String("theme")) {
            if (val.typeId() != QMetaType::QString) {
                return ValidationResult{false, current, QStringLiteral("theme must be a string")};
            }
            if (!allowedThemes.contains(val.toString())) {
                return ValidationResult{false, current, QStringLiteral("Invalid theme value: ") + val.toString()};
            }
        } else if (key == QLatin1String("capsuleSize")) {
            if (val.typeId() != QMetaType::QString) {
                return ValidationResult{false, current, QStringLiteral("capsuleSize must be a string")};
            }
            if (!allowedCapsuleSizes.contains(val.toString())) {
                return ValidationResult{false, current, QStringLiteral("Invalid capsuleSize value: ") + val.toString()};
            }
        } else if (key == QLatin1String("animationEnabled") ||
                   key == QLatin1String("hoverPreviewEnabled") ||
                   key == QLatin1String("notificationPeekEnabled") ||
                   key == QLatin1String("smartAdaptiveEnabled")) {
            if (val.typeId() != QMetaType::Bool) {
                return ValidationResult{false, current, key + QStringLiteral(" must be a boolean")};
            }
        } else if (key == QLatin1String("preferredPlayerId")) {
            if (val.typeId() != QMetaType::QString) {
                return ValidationResult{false, current, QStringLiteral("preferredPlayerId must be a string")};
            }
            if (val.toString().toUtf8().size() > 256) {
                return ValidationResult{false, current, QStringLiteral("preferredPlayerId exceeds maximum length of 256 bytes")};
            }
        } else if (key == QLatin1String("displayMode")) {
            if (val.typeId() != QMetaType::QString) {
                return ValidationResult{false, current, QStringLiteral("displayMode must be a string")};
            }
            if (val.toString() != QLatin1String("dynamic")) {
                return ValidationResult{false, current, QStringLiteral("displayMode '") + val.toString() + QStringLiteral("' not supported in v0.1 (only 'dynamic' is allowed)")};
            }
        }
    }

    // All patch entries valid; merge into a copy of current
    QVariantMap effective = current;
    for (auto it = patch.begin(); it != patch.end(); ++it) {
        effective.insert(it.key(), it.value());
    }

    return ValidationResult{true, effective, QString()};
}
