#include "shelf_service.h"

#include <QCryptographicHash>
#include <QDateTime>
#include <QDir>
#include <QFile>
#include <QFileInfo>
#include <QJsonArray>
#include <QJsonDocument>
#include <QJsonObject>
#include <QMimeDatabase>
#include <QSaveFile>
#include <QStandardPaths>
#include <QUrl>

namespace {

QString resolveStoragePath(const QString &overridePath) {
    if (!overridePath.isEmpty()) {
        return overridePath;
    }
    const QByteArray xdgData = qgetenv("XDG_DATA_HOME");
    QString baseDir;
    if (!xdgData.isEmpty()) {
        baseDir = QFile::decodeName(xdgData);
    } else {
        baseDir = QStandardPaths::writableLocation(QStandardPaths::GenericDataLocation);
    }
    return baseDir + QStringLiteral("/linux-island/shelf.json");
}

QString itemIdForPath(const QString &canonicalPath) {
    const QByteArray digest = QCryptographicHash::hash(canonicalPath.toUtf8(), QCryptographicHash::Sha256).toHex();
    return QString::fromLatin1(digest.left(16));
}

} // namespace

ShelfService::ShelfService(const QString &storagePath, QObject *parent)
    : QObject(parent),
      m_storagePath(resolveStoragePath(storagePath)),
      m_clock([]() { return QDateTime::currentMSecsSinceEpoch(); }) {
    load();
}

QString ShelfService::storagePath() const {
    return m_storagePath;
}

ShelfSnapshot ShelfService::snapshot() const {
    return ShelfSnapshot{kMaxItems, m_items};
}

int ShelfService::count() const {
    return m_items.size();
}

void ShelfService::setClock(Clock clock) {
    if (clock) {
        m_clock = std::move(clock);
    }
}

QString ShelfService::formatSize(qint64 bytes, bool isDir) {
    if (isDir) {
        return QStringLiteral("Folder");
    }
    if (bytes < 0) {
        return QStringLiteral("0 B");
    }
    if (bytes < 1024) {
        return QString::number(bytes) + QStringLiteral(" B");
    }
    const double kb = static_cast<double>(bytes) / 1024.0;
    if (kb < 1024.0) {
        return QString::number(kb, 'f', kb < 10.0 ? 1 : 0) + QStringLiteral(" KB");
    }
    const double mb = kb / 1024.0;
    if (mb < 1024.0) {
        return QString::number(mb, 'f', mb < 10.0 ? 1 : 0) + QStringLiteral(" MB");
    }
    const double gb = mb / 1024.0;
    return QString::number(gb, 'f', 1) + QStringLiteral(" GB");
}

bool ShelfService::buildItem(const QString &rawUriOrPath, qint64 addedAtMs, ShelfItem *out, QString *error) const {
    const QString trimmed = rawUriOrPath.trimmed();
    if (trimmed.isEmpty()) {
        if (error) *error = QStringLiteral("Shelf URI cannot be empty");
        return false;
    }
    if (trimmed.toUtf8().size() > kMaxUriBytes) {
        if (error) *error = QStringLiteral("Shelf URI exceeds maximum length of 2048 bytes");
        return false;
    }

    QString localPath;
    if (trimmed.startsWith(QLatin1Char('/'))) {
        localPath = trimmed;
    } else {
        const QUrl url(trimmed, QUrl::StrictMode);
        if (!url.isValid() || !url.isLocalFile()) {
            if (error) *error = QStringLiteral("Only local file:// URIs or absolute paths are allowed");
            return false;
        }
        localPath = url.toLocalFile();
    }

    if (localPath.isEmpty()) {
        if (error) *error = QStringLiteral("Resolved local path is empty");
        return false;
    }

    QFileInfo info(localPath);
    if (!info.exists()) {
        if (error) *error = QStringLiteral("Target file does not exist");
        return false;
    }

    QString canonical = info.canonicalFilePath();
    if (canonical.isEmpty()) {
        canonical = info.absoluteFilePath();
    }
    QFileInfo canonicalInfo(canonical);
    if (!canonicalInfo.exists()) {
        if (error) *error = QStringLiteral("Target file is not accessible");
        return false;
    }

    const bool isDir = canonicalInfo.isDir();
    const qint64 sizeBytes = isDir ? 0 : canonicalInfo.size();

    QMimeDatabase mimeDb;
    const QMimeType mime = mimeDb.mimeTypeForFile(canonicalInfo);
    const QString mimeType = mime.isValid()
        ? mime.name()
        : (isDir ? QStringLiteral("inode/directory") : QStringLiteral("application/octet-stream"));
    QString iconName = isDir ? QStringLiteral("folder-symbolic") : mime.iconName();
    if (iconName.isEmpty()) {
        iconName = isDir ? QStringLiteral("folder-symbolic") : QStringLiteral("text-x-generic-symbolic");
    }

    QString displayName = canonicalInfo.fileName();
    if (displayName.isEmpty()) {
        displayName = canonical;
    }

    ShelfItem item;
    item.id = itemIdForPath(canonical);
    item.uri = QUrl::fromLocalFile(canonical).toString();
    item.path = canonical;
    item.name = displayName;
    item.sizeBytes = sizeBytes;
    item.sizeText = formatSize(sizeBytes, isDir);
    item.mimeType = mimeType;
    item.iconName = iconName;
    item.isDir = isDir;
    item.addedAtMs = addedAtMs;

    if (out) *out = item;
    return true;
}

bool ShelfService::addFiles(const QStringList &uris, QString *error) {
    if (uris.isEmpty()) {
        if (error) *error = QStringLiteral("At least one file URI is required");
        return false;
    }
    if (uris.size() > kMaxBatchSize) {
        if (error) *error = QStringLiteral("Batch exceeds maximum of 32 file URIs");
        return false;
    }

    const qint64 nowMs = m_clock();
    QList<ShelfItem> validated;
    validated.reserve(uris.size());
    for (const QString &raw : uris) {
        ShelfItem item;
        if (!buildItem(raw, nowMs, &item, error)) {
            return false;
        }
        // Deduplicate within the incoming batch, keeping the latest occurrence.
        for (int i = validated.size() - 1; i >= 0; --i) {
            if (validated[i].id == item.id) {
                validated.removeAt(i);
            }
        }
        validated.append(item);
    }

    // Insert in reverse so the first item in `uris` ends up first on the shelf.
    for (int i = validated.size() - 1; i >= 0; --i) {
        const ShelfItem &item = validated[i];
        for (int j = m_items.size() - 1; j >= 0; --j) {
            if (m_items[j].id == item.id) {
                m_items.removeAt(j);
            }
        }
        m_items.prepend(item);
    }

    while (m_items.size() > kMaxItems) {
        m_items.removeLast();
    }

    save();
    emit changed();
    return true;
}

bool ShelfService::removeFile(const QString &id, QString *error) {
    const QString trimmed = id.trimmed();
    if (trimmed.isEmpty() || trimmed.toUtf8().size() > 64) {
        if (error) *error = QStringLiteral("Invalid shelf item ID");
        return false;
    }

    for (int i = 0; i < m_items.size(); ++i) {
        if (m_items[i].id == trimmed) {
            m_items.removeAt(i);
            save();
            emit changed();
            return true;
        }
    }

    if (error) *error = QStringLiteral("Shelf item not found");
    return false;
}

bool ShelfService::clear() {
    if (m_items.isEmpty()) {
        return true;
    }
    m_items.clear();
    save();
    emit changed();
    return true;
}

bool ShelfService::pruneMissing() {
    bool pruned = false;
    for (int i = m_items.size() - 1; i >= 0; --i) {
        if (!QFileInfo::exists(m_items[i].path)) {
            m_items.removeAt(i);
            pruned = true;
        }
    }
    if (pruned) {
        save();
        emit changed();
    }
    return pruned;
}

void ShelfService::load() {
    QFile file(m_storagePath);
    if (!file.exists() || !file.open(QIODevice::ReadOnly)) {
        return;
    }

    QJsonParseError parseError;
    const QJsonDocument doc = QJsonDocument::fromJson(file.readAll(), &parseError);
    file.close();
    if (parseError.error != QJsonParseError::NoError || !doc.isObject()) {
        return;
    }

    const QJsonArray arr = doc.object().value(QStringLiteral("items")).toArray();
    bool droppedAny = false;
    for (const QJsonValue &val : arr) {
        if (m_items.size() >= kMaxItems) {
            droppedAny = true;
            break;
        }
        if (!val.isObject()) {
            droppedAny = true;
            continue;
        }
        const QJsonObject obj = val.toObject();
        const QString path = obj.value(QStringLiteral("path")).toString();
        const qint64 addedAtMs = static_cast<qint64>(obj.value(QStringLiteral("addedAtMs")).toDouble(m_clock()));

        ShelfItem item;
        if (!buildItem(path, addedAtMs, &item, nullptr)) {
            droppedAny = true;
            continue;
        }
        bool dup = false;
        for (const ShelfItem &existing : m_items) {
            if (existing.id == item.id) {
                dup = true;
                break;
            }
        }
        if (!dup) {
            m_items.append(item);
        }
    }

    if (droppedAny) {
        save();
    }
}

bool ShelfService::save() const {
    const QFileInfo fi(m_storagePath);
    QDir dir = fi.dir();
    if (!dir.exists() && !dir.mkpath(QStringLiteral("."))) {
        return false;
    }

    QJsonArray arr;
    for (const ShelfItem &item : m_items) {
        QJsonObject obj;
        obj[QStringLiteral("path")] = item.path;
        obj[QStringLiteral("addedAtMs")] = static_cast<double>(item.addedAtMs);
        arr.append(obj);
    }

    QJsonObject root;
    root[QStringLiteral("version")] = 1;
    root[QStringLiteral("items")] = arr;

    QSaveFile out(m_storagePath);
    if (!out.open(QIODevice::WriteOnly)) {
        return false;
    }
    out.write(QJsonDocument(root).toJson(QJsonDocument::Compact));
    if (!out.commit()) {
        return false;
    }
    QFile::setPermissions(m_storagePath, QFile::ReadOwner | QFile::WriteOwner);
    return true;
}
