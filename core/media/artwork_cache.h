#pragma once

#include <QObject>
#include <QString>
#include <QUrl>
#include <QHash>
#include <functional>
#include <memory>

class QNetworkAccessManager;
class QNetworkReply;

class ArtworkCache : public QObject {
    Q_OBJECT

public:
    using CompletionCallback = std::function<void(const QString &cachedLocalUri)>;

    explicit ArtworkCache(const QString &cacheDir = QString(), QObject *parent = nullptr);
    ~ArtworkCache() override;

    // Requests remote artwork. If cached, invokes callback immediately.
    // If remote, downloads asynchronously to cacheDir, and invokes callback with local file:// URI.
    // If not remote (empty or file://), invokes callback with artUri directly.
    void fetchArtwork(const QString &playerId, const QString &artUri, CompletionCallback callback);

    // Cancels in-flight download for a specific player (e.g. track changed)
    void cancelPlayer(const QString &playerId);

    QString cacheDirectory() const;
    static QString urlToHash(const QUrl &url);
    static bool isRemoteUrl(const QString &uri);

    static constexpr qint64 MaxFileSize = 4 * 1024 * 1024; // 4 MB
    static constexpr qint64 MaxTotalCacheSize = 50 * 1024 * 1024; // 50 MB
    static constexpr int TimeoutMs = 5000; // 5s

private:
    void pruneCache();

    QString m_cacheDir;
    std::unique_ptr<QNetworkAccessManager> m_nam;

    struct ActiveFetch {
        QString playerId;
        QString url;
        QNetworkReply *reply = nullptr;
        CompletionCallback callback;
    };
    QHash<QString, ActiveFetch> m_activeFetches;
};
