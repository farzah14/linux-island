#pragma once

#include <QDBusConnection>
#include <QDBusServiceWatcher>
#include <QObject>
#include <QStringList>
#include <QUrl>
#include <QVariantList>
#include <QVariantMap>

class ShelfClient : public QObject {
    Q_OBJECT
    Q_PROPERTY(bool shelfServiceAvailable READ shelfServiceAvailable NOTIFY shelfChanged)
    Q_PROPERTY(int count READ count NOTIFY shelfChanged)
    Q_PROPERTY(int maxItems READ maxItems NOTIFY shelfChanged)
    Q_PROPERTY(QVariantList items READ items NOTIFY shelfChanged)
    Q_PROPERTY(QString compactIcon READ compactIcon NOTIFY shelfChanged)
    Q_PROPERTY(QString compactText READ compactText NOTIFY shelfChanged)

public:
    explicit ShelfClient(QObject *parent = nullptr);
    ~ShelfClient() override = default;

    bool shelfServiceAvailable() const { return m_serviceAvailable; }
    int count() const { return m_count; }
    int maxItems() const { return m_maxItems; }
    QVariantList items() const { return m_items; }
    QString compactIcon() const;
    QString compactText() const;

    Q_INVOKABLE void refresh();
    Q_INVOKABLE void addFiles(const QStringList &uris);
    Q_INVOKABLE void addUrls(const QList<QUrl> &urls);
    Q_INVOKABLE void removeFile(const QString &id);
    Q_INVOKABLE void clearShelf();
    Q_INVOKABLE void openFileChooser();
    Q_INVOKABLE void pasteFromClipboard();
    Q_INVOKABLE void copyItemToClipboard(const QString &uri);
    Q_INVOKABLE void copyAllToClipboard();
    Q_INVOKABLE void openItem(const QString &uri);
    Q_INVOKABLE void revealItem(const QString &uri);
    Q_INVOKABLE void startDrag(const QString &uri);
    Q_INVOKABLE void startDragAll();
    Q_INVOKABLE QString formatSize(qint64 bytes) const;

signals:
    void shelfChanged();

private slots:
    void onShelfChanged(quint64 revision, const QVariantMap &snapshot);
    void onNameOwnerChanged(const QString &service, const QString &oldOwner, const QString &newOwner);
    void onPortalResponse(uint response, const QVariantMap &results);

private:
    void fetchShelf();
    void applySnapshot(const QVariantMap &raw, bool allowZeroRevision);
    void clearPortalSubscription();

    QDBusConnection m_bus;
    QDBusServiceWatcher *m_watcher = nullptr;
    bool m_serviceAvailable = false;
    bool m_hasRevision = false;
    quint64 m_revision = 0;
    int m_count = 0;
    int m_maxItems = 12;
    QVariantList m_items;
    QString m_portalRequestPath;
};
