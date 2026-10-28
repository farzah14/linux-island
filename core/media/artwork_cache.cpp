#include "artwork_cache.h"

#include <QCryptographicHash>
#include <QDir>
#include <QFile>
#include <QFileInfo>
#include <QNetworkAccessManager>
#include <QNetworkReply>
#include <QNetworkRequest>
#include <QStandardPaths>

ArtworkCache::ArtworkCache(const QString &cacheDir, QObject *parent)
    : QObject(parent)
    , m_nam(std::make_unique<QNetworkAccessManager>(this))
{
    if (!cacheDir.isEmpty()) {
        m_cacheDir = cacheDir;
    } else {
        QString base = QStandardPaths::writableLocation(QStandardPaths::CacheLocation);
        if (base.isEmpty()) {
            base = QDir::homePath() + QStringLiteral("/.cache");
        }
        m_cacheDir = base + QStringLiteral("/linux-island/artwork");
    }

    QDir().mkpath(m_cacheDir);
    QFile::setPermissions(m_cacheDir, QFileDevice::ReadOwner | QFileDevice::WriteOwner | QFileDevice::ExeOwner);
}

ArtworkCache::~ArtworkCache()
{
    for (auto &fetch : m_activeFetches) {
        if (fetch.reply) {
            fetch.reply->abort();
            fetch.reply->deleteLater();
        }
    }
    m_activeFetches.clear();
}

QString ArtworkCache::cacheDirectory() const
{
    return m_cacheDir;
}

bool ArtworkCache::isRemoteUrl(const QString &uri)
{
    return uri.startsWith(QStringLiteral("https://"), Qt::CaseInsensitive) ||
           uri.startsWith(QStringLiteral("http://"), Qt::CaseInsensitive);
}

QString ArtworkCache::urlToHash(const QUrl &url)
{
    return QString::fromLatin1(
        QCryptographicHash::hash(url.toString().toUtf8(), QCryptographicHash::Sha256).toHex()
    );
}

void ArtworkCache::cancelPlayer(const QString &playerId)
{
    auto it = m_activeFetches.find(playerId);
    if (it != m_activeFetches.end()) {
        if (it->reply) {
            it->reply->abort();
            it->reply->deleteLater();
        }
        m_activeFetches.erase(it);
    }
}

void ArtworkCache::fetchArtwork(const QString &playerId, const QString &artUri, CompletionCallback callback)
{
    if (!callback) return;

    if (!isRemoteUrl(artUri)) {
        cancelPlayer(playerId);
        callback(artUri);
        return;
    }

    QUrl url(artUri);
    if (!url.isValid() || url.host().isEmpty()) {
        cancelPlayer(playerId);
        callback(QString());
        return;
    }

    QString hash = urlToHash(url);
    for (const auto &ext : {QStringLiteral(".png"), QStringLiteral(".jpg"), QStringLiteral(".webp")}) {
        QString candidate = m_cacheDir + QLatin1Char('/') + hash + ext;
        QFileInfo fi(candidate);
        if (fi.exists() && fi.isFile() && fi.size() > 0) {
            cancelPlayer(playerId);
            callback(QStringLiteral("file://") + candidate);
            return;
        }
    }

    // Cancel existing fetch for this player if URL changed
    auto it = m_activeFetches.find(playerId);
    if (it != m_activeFetches.end()) {
        if (it->url == artUri) {
            return; // in-flight already
        }
        cancelPlayer(playerId);
    }

    QNetworkRequest request(url);
    request.setAttribute(QNetworkRequest::RedirectPolicyAttribute, QNetworkRequest::NoLessSafeRedirectPolicy);
    request.setTransferTimeout(TimeoutMs);

    QNetworkReply *reply = m_nam->get(request);
    ActiveFetch fetch;
    fetch.playerId = playerId;
    fetch.url = artUri;
    fetch.reply = reply;
    fetch.callback = callback;
    m_activeFetches.insert(playerId, fetch);

    connect(reply, &QNetworkReply::finished, this, [this, playerId, reply, hash, callback]() {
        reply->deleteLater();
        auto it = m_activeFetches.find(playerId);
        if (it == m_activeFetches.end() || it->reply != reply) {
            return;
        }
        m_activeFetches.erase(it);

        if (reply->error() != QNetworkReply::NoError) {
            callback(QString());
            return;
        }

        int statusCode = reply->attribute(QNetworkRequest::HttpStatusCodeAttribute).toInt();
        if (statusCode != 200 && statusCode != 0) {
            callback(QString());
            return;
        }

        QByteArray data = reply->readAll();
        if (data.isEmpty() || data.size() > MaxFileSize) {
            callback(QString());
            return;
        }

        QString ext;
        if (data.startsWith("\x89PNG\r\n\x1a\n")) {
            ext = QStringLiteral(".png");
        } else if (data.startsWith("\xff\xd8\xff")) {
            ext = QStringLiteral(".jpg");
        } else if (data.size() >= 12 && data.startsWith("RIFF") && data.mid(8, 4) == "WEBP") {
            ext = QStringLiteral(".webp");
        } else {
            callback(QString());
            return;
        }

        QString targetPath = m_cacheDir + QLatin1Char('/') + hash + ext;
        QString tempPath = targetPath + QStringLiteral(".tmp.") + QString::number(reinterpret_cast<quintptr>(reply));
        QFile file(tempPath);
        if (!file.open(QIODevice::WriteOnly)) {
            callback(QString());
            return;
        }

        file.write(data);
        file.close();
        file.setPermissions(QFileDevice::ReadOwner | QFileDevice::WriteOwner);

        // Atomic replace
        QFile::remove(targetPath);
        if (QFile::rename(tempPath, targetPath)) {
            pruneCache();
            callback(QStringLiteral("file://") + targetPath);
        } else {
            QFile::remove(tempPath);
            callback(QString());
        }
    });
}

void ArtworkCache::pruneCache()
{
    QDir dir(m_cacheDir);
    QFileInfoList list = dir.entryInfoList({QStringLiteral("*.png"), QStringLiteral("*.jpg"), QStringLiteral("*.webp")}, QDir::Files, QDir::Time);

    qint64 totalBytes = 0;
    for (const auto &info : list) {
        totalBytes += info.size();
    }

    if (totalBytes <= MaxTotalCacheSize) {
        return;
    }

    // Prune oldest files (list sorted newest to oldest by QDir::Time)
    for (int i = list.size() - 1; i >= 0 && totalBytes > (MaxTotalCacheSize * 8 / 10); --i) {
        qint64 sz = list[i].size();
        if (QFile::remove(list[i].absoluteFilePath())) {
            totalBytes -= sz;
        }
    }
}
