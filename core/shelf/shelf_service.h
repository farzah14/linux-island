#pragma once

#include <QObject>
#include <QString>
#include <QStringList>
#include <functional>
#include "shelf_types.h"

// Core-owned staging tray for local file references. Validates local paths,
// resolves MIME metadata via QMimeDatabase, enforces bounded capacity, and
// persists entries atomically via QSaveFile.
class ShelfService : public QObject {
    Q_OBJECT
public:
    using Clock = std::function<qint64()>;

    static constexpr int kMaxItems = 12;
    static constexpr int kMaxBatchSize = 32;
    static constexpr int kMaxUriBytes = 2048;

    explicit ShelfService(const QString &storagePath = QString(), QObject *parent = nullptr);

    QString storagePath() const;
    ShelfSnapshot snapshot() const;
    int count() const;

    void setClock(Clock clock);
    bool addFiles(const QStringList &uris, QString *error = nullptr);
    bool removeFile(const QString &id, QString *error = nullptr);
    bool clear();
    bool pruneMissing();

    static QString formatSize(qint64 bytes, bool isDir);

signals:
    void changed();

private:
    void load();
    bool save() const;
    bool buildItem(const QString &rawUriOrPath, qint64 addedAtMs, ShelfItem *out, QString *error) const;

    QString m_storagePath;
    QList<ShelfItem> m_items;
    Clock m_clock;
};
