#include "settings_store.h"
#include <QFile>
#include <QSaveFile>
#include <QFileInfo>
#include <QDir>
#include <QStandardPaths>
#include <QJsonDocument>
#include <QJsonObject>

static QString resolveConfigPath(const QString &overridePath) {
    if (!overridePath.isEmpty()) {
        return overridePath;
    }
    QByteArray xdgConfig = qgetenv("XDG_CONFIG_HOME");
    QString baseDir;
    if (!xdgConfig.isEmpty()) {
        baseDir = QFile::decodeName(xdgConfig);
    } else {
        baseDir = QStandardPaths::writableLocation(QStandardPaths::ConfigLocation);
    }
    return baseDir + QStringLiteral("/linux-island/settings.json");
}

SettingsStore::SettingsStore(const QString &customConfigPath, QObject *parent)
    : QObject(parent),
      m_filePath(resolveConfigPath(customConfigPath)),
      m_settings(defaultSettings()) {
    load();
}

QVariantMap SettingsStore::settings() const {
    return m_settings;
}

QString SettingsStore::configFilePath() const {
    return m_filePath;
}

void SettingsStore::load() {
    QFile file(m_filePath);
    if (!file.exists()) {
        m_settings = defaultSettings();
        return;
    }

    if (!file.open(QIODevice::ReadOnly)) {
        m_settings = defaultSettings();
        return;
    }

    QByteArray data = file.readAll();
    file.close();

    QJsonParseError parseError;
    QJsonDocument doc = QJsonDocument::fromJson(data, &parseError);
    if (parseError.error != QJsonParseError::NoError || !doc.isObject()) {
        m_settings = defaultSettings();
        return;
    }

    QVariantMap loaded = doc.object().toVariantMap();
    ValidationResult val = validateSettingsPatch(defaultSettings(), loaded);
    if (val.ok) {
        m_settings = val.effective;
    } else {
        m_settings = defaultSettings();
    }
}

bool SettingsStore::save(const QVariantMap &newSettings, QString *errorMsg) {
    QFileInfo fi(m_filePath);
    QDir dir = fi.dir();
    if (!dir.exists()) {
        if (!dir.mkpath(QStringLiteral("."))) {
            if (errorMsg) {
                *errorMsg = QStringLiteral("Failed to create configuration directory: ") + dir.absolutePath();
            }
            return false;
        }
    }

    QSaveFile saveFile(m_filePath);
    if (!saveFile.open(QIODevice::WriteOnly)) {
        if (errorMsg) {
            *errorMsg = QStringLiteral("Cannot open settings file for writing: ") + saveFile.errorString();
        }
        return false;
    }

    QJsonObject obj = QJsonObject::fromVariantMap(newSettings);
    QJsonDocument doc(obj);
    saveFile.write(doc.toJson(QJsonDocument::Indented));

    if (!saveFile.commit()) {
        if (errorMsg) {
            *errorMsg = QStringLiteral("Failed to commit settings file: ") + saveFile.errorString();
        }
        return false;
    }

    return true;
}

SettingsStore::UpdateResult SettingsStore::updateSettings(const QVariantMap &patch) {
    ValidationResult val = validateSettingsPatch(m_settings, patch);
    if (!val.ok) {
        return UpdateResult{false, false, val.error, m_settings};
    }

    QString saveErr;
    if (!save(val.effective, &saveErr)) {
        return UpdateResult{false, true, saveErr, m_settings};
    }

    m_settings = val.effective;
    return UpdateResult{true, false, QString(), m_settings};
}
