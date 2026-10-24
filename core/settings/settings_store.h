#pragma once

#include <QObject>
#include <QVariantMap>
#include <QString>
#include "settings_schema.h"

class SettingsStore : public QObject {
    Q_OBJECT
public:
    explicit SettingsStore(const QString &customConfigPath = QString(), QObject *parent = nullptr);

    QVariantMap settings() const;
    QString configFilePath() const;

    struct UpdateResult {
        bool ok = false;
        bool isWriteError = false; // true if file I/O error, false if validation error
        QString error;
        QVariantMap effective;
    };

    UpdateResult updateSettings(const QVariantMap &patch);

private:
    void load();
    bool save(const QVariantMap &newSettings, QString *errorMsg);

    QString m_filePath;
    QVariantMap m_settings;
};
