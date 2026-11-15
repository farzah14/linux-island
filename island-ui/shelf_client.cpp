#include "shelf_client.h"

#include <QClipboard>
#include <QDBusArgument>
#include <QDBusInterface>
#include <QDBusMessage>
#include <QDBusPendingCall>
#include <QDBusPendingCallWatcher>
#include <QDBusPendingReply>
#include <QDesktopServices>
#include <QDrag>
#include <QGuiApplication>
#include <QMimeData>
#include <QUuid>
#include <QWindow>

namespace {
constexpr auto kService = "io.github.linuxisland.Core";
constexpr auto kPath = "/io/github/linuxisland/Core";
constexpr auto kInterface = "io.github.linuxisland.Shelf1";
constexpr int kMaxBatch = 32;
constexpr int kMaxUriLen = 2048;

QVariantMap demarshalMap(const QVariant &value) {
    if (value.userType() == qMetaTypeId<QDBusArgument>()) {
        QVariantMap map;
        const auto arg = value.value<QDBusArgument>();
        arg >> map;
        return map;
    }
    return value.toMap();
}

QVariantList demarshalList(const QVariant &value) {
    if (value.userType() == qMetaTypeId<QDBusArgument>()) {
        QVariantList list;
        const auto arg = value.value<QDBusArgument>();
        arg >> list;
        return list;
    }
    return value.toList();
}

QStringList sanitizeUriList(const QStringList &raw) {
    QStringList out;
    for (const QString &entry : raw) {
        const QString trimmed = entry.trimmed();
        if (trimmed.isEmpty() || trimmed.startsWith(QLatin1Char('#')) || trimmed.size() > kMaxUriLen)
            continue;
        if (!trimmed.startsWith(QLatin1String("file://")) && !trimmed.startsWith(QLatin1Char('/')))
            continue;
        if (out.contains(trimmed))
            continue;
        out.append(trimmed);
        if (out.size() >= kMaxBatch)
            break;
    }
    return out;
}
}  // namespace

ShelfClient::ShelfClient(QObject *parent)
    : QObject(parent)
    , m_bus(QDBusConnection::sessionBus()) {
    m_watcher = new QDBusServiceWatcher(
        QString::fromLatin1(kService),
        m_bus,
        QDBusServiceWatcher::WatchForOwnerChange,
        this);
    connect(m_watcher, &QDBusServiceWatcher::serviceOwnerChanged,
            this, &ShelfClient::onNameOwnerChanged);

    m_bus.connect(
        QString::fromLatin1(kService),
        QString::fromLatin1(kPath),
        QString::fromLatin1(kInterface),
        QStringLiteral("ShelfChanged"),
        this,
        SLOT(onShelfChanged(quint64,QVariantMap)));

    fetchShelf();
}

QString ShelfClient::compactIcon() const {
    return m_count > 0 ? QStringLiteral("📁") : QString();
}

QString ShelfClient::compactText() const {
    if (m_count <= 0)
        return {};
    return m_count == 1
        ? QStringLiteral("1 file")
        : QStringLiteral("%1 files").arg(m_count);
}

void ShelfClient::refresh() {
    fetchShelf();
}

void ShelfClient::fetchShelf() {
    QDBusMessage msg = QDBusMessage::createMethodCall(
        QString::fromLatin1(kService),
        QString::fromLatin1(kPath),
        QString::fromLatin1(kInterface),
        QStringLiteral("GetShelf"));

    auto *watcher = new QDBusPendingCallWatcher(m_bus.asyncCall(msg), this);
    connect(watcher, &QDBusPendingCallWatcher::finished, this, [this](QDBusPendingCallWatcher *w) {
        w->deleteLater();
        QDBusPendingReply<QVariantMap> reply = *w;
        if (reply.isError()) {
            if (m_serviceAvailable) {
                m_serviceAvailable = false;
                emit shelfChanged();
            }
            return;
        }
        m_serviceAvailable = true;
        applySnapshot(reply.value(), true);
    });
}

void ShelfClient::applySnapshot(const QVariantMap &raw, bool allowZeroRevision) {
    const quint64 rev = raw.value(QStringLiteral("revision")).toULongLong();
    if (m_hasRevision && !allowZeroRevision && rev <= m_revision)
        return;

    m_hasRevision = true;
    m_revision = rev;
    m_maxItems = qMax(1, raw.value(QStringLiteral("maxItems"), 12).toInt());

    const QVariantList rawItems = demarshalList(raw.value(QStringLiteral("items")));
    QVariantList normalized;
    normalized.reserve(rawItems.size());
    for (const QVariant &entry : rawItems) {
        QVariantMap item = demarshalMap(entry);
        if (!item.isEmpty())
            normalized.append(item);
    }
    m_items = normalized;
    m_count = raw.value(QStringLiteral("count"), normalized.size()).toInt();
    m_serviceAvailable = true;
    emit shelfChanged();
}

void ShelfClient::onShelfChanged(quint64 revision, const QVariantMap &snapshot) {
    QVariantMap copy = snapshot;
    if (!copy.contains(QStringLiteral("revision")))
        copy.insert(QStringLiteral("revision"), QVariant::fromValue<quint64>(revision));
    applySnapshot(copy, false);
}

void ShelfClient::onNameOwnerChanged(const QString &service, const QString &oldOwner, const QString &newOwner) {
    Q_UNUSED(oldOwner);
    if (service != QLatin1String(kService))
        return;

    if (newOwner.isEmpty()) {
        m_serviceAvailable = false;
        m_hasRevision = false;
        m_revision = 0;
        m_count = 0;
        m_items.clear();
        emit shelfChanged();
        return;
    }
    fetchShelf();
}

void ShelfClient::addFiles(const QStringList &uris) {
    const QStringList clean = sanitizeUriList(uris);
    if (clean.isEmpty())
        return;

    QDBusMessage msg = QDBusMessage::createMethodCall(
        QString::fromLatin1(kService),
        QString::fromLatin1(kPath),
        QString::fromLatin1(kInterface),
        QStringLiteral("AddFiles"));
    msg << clean;

    auto *watcher = new QDBusPendingCallWatcher(m_bus.asyncCall(msg), this);
    connect(watcher, &QDBusPendingCallWatcher::finished, [](QDBusPendingCallWatcher *w) {
        w->deleteLater();
    });
}

void ShelfClient::addUrls(const QList<QUrl> &urls) {
    QStringList uris;
    uris.reserve(urls.size());
    for (const QUrl &url : urls) {
        if (url.isLocalFile())
            uris.append(url.toString(QUrl::FullyEncoded));
    }
    addFiles(uris);
}

void ShelfClient::removeFile(const QString &id) {
    if (id.trimmed().isEmpty())
        return;
    QDBusMessage msg = QDBusMessage::createMethodCall(
        QString::fromLatin1(kService),
        QString::fromLatin1(kPath),
        QString::fromLatin1(kInterface),
        QStringLiteral("RemoveFile"));
    msg << id;

    auto *watcher = new QDBusPendingCallWatcher(m_bus.asyncCall(msg), this);
    connect(watcher, &QDBusPendingCallWatcher::finished, [](QDBusPendingCallWatcher *w) {
        w->deleteLater();
    });
}

void ShelfClient::clearShelf() {
    QDBusMessage msg = QDBusMessage::createMethodCall(
        QString::fromLatin1(kService),
        QString::fromLatin1(kPath),
        QString::fromLatin1(kInterface),
        QStringLiteral("ClearShelf"));

    auto *watcher = new QDBusPendingCallWatcher(m_bus.asyncCall(msg), this);
    connect(watcher, &QDBusPendingCallWatcher::finished, [](QDBusPendingCallWatcher *w) {
        w->deleteLater();
    });
}

void ShelfClient::clearPortalSubscription() {
    if (m_portalRequestPath.isEmpty())
        return;
    m_bus.disconnect(
        QStringLiteral("org.freedesktop.portal.Desktop"),
        m_portalRequestPath,
        QStringLiteral("org.freedesktop.portal.Request"),
        QStringLiteral("Response"),
        this,
        SLOT(onPortalResponse(uint,QVariantMap)));
    m_portalRequestPath.clear();
}

void ShelfClient::openFileChooser() {
    clearPortalSubscription();
    const QString token = QStringLiteral("linux_island_ui_%1")
        .arg(QUuid::createUuid().toString(QUuid::Id128));
    const QVariantMap options{
        {QStringLiteral("handle_token"), token},
        {QStringLiteral("multiple"), true},
        {QStringLiteral("modal"), false},
    };

    QDBusMessage msg = QDBusMessage::createMethodCall(
        QStringLiteral("org.freedesktop.portal.Desktop"),
        QStringLiteral("/org/freedesktop/portal/desktop"),
        QStringLiteral("org.freedesktop.portal.FileChooser"),
        QStringLiteral("OpenFile"));
    msg << QString() << QStringLiteral("Add Files to Shelf") << options;

    auto *watcher = new QDBusPendingCallWatcher(m_bus.asyncCall(msg), this);
    connect(watcher, &QDBusPendingCallWatcher::finished, this, [this](QDBusPendingCallWatcher *w) {
        w->deleteLater();
        QDBusPendingReply<QDBusObjectPath> reply = *w;
        if (reply.isError())
            return;
        m_portalRequestPath = reply.value().path();
        m_bus.connect(
            QStringLiteral("org.freedesktop.portal.Desktop"),
            m_portalRequestPath,
            QStringLiteral("org.freedesktop.portal.Request"),
            QStringLiteral("Response"),
            this,
            SLOT(onPortalResponse(uint,QVariantMap)));
    });
}

void ShelfClient::onPortalResponse(uint response, const QVariantMap &results) {
    clearPortalSubscription();
    if (response != 0)
        return;
    const QStringList uris = results.value(QStringLiteral("uris")).toStringList();
    addFiles(uris);
}

void ShelfClient::pasteFromClipboard() {
    const QClipboard *clipboard = QGuiApplication::clipboard();
    if (!clipboard)
        return;
    const QMimeData *mime = clipboard->mimeData();
    if (!mime)
        return;

    if (mime->hasUrls()) {
        addUrls(mime->urls());
        return;
    }
    if (mime->hasText()) {
        addFiles(mime->text().split(QLatin1Char('\n'), Qt::SkipEmptyParts));
    }
}

void ShelfClient::copyItemToClipboard(const QString &uri) {
    QClipboard *clipboard = QGuiApplication::clipboard();
    if (!clipboard || uri.isEmpty())
        return;
    auto *mime = new QMimeData();
    mime->setUrls({QUrl(uri)});
    mime->setText(uri);
    clipboard->setMimeData(mime);
}

void ShelfClient::copyAllToClipboard() {
    QClipboard *clipboard = QGuiApplication::clipboard();
    if (!clipboard || m_items.isEmpty())
        return;
    QList<QUrl> urls;
    QStringList lines;
    for (const QVariant &entry : m_items) {
        const QString uri = entry.toMap().value(QStringLiteral("uri")).toString();
        if (!uri.isEmpty()) {
            urls.append(QUrl(uri));
            lines.append(uri);
        }
    }
    if (urls.isEmpty())
        return;
    auto *mime = new QMimeData();
    mime->setUrls(urls);
    mime->setText(lines.join(QLatin1Char('\n')));
    clipboard->setMimeData(mime);
}

void ShelfClient::openItem(const QString &uri) {
    if (!uri.isEmpty())
        QDesktopServices::openUrl(QUrl(uri));
}

void ShelfClient::revealItem(const QString &uri) {
    if (uri.isEmpty())
        return;
    QDBusMessage msg = QDBusMessage::createMethodCall(
        QStringLiteral("org.freedesktop.FileManager1"),
        QStringLiteral("/org/freedesktop/FileManager1"),
        QStringLiteral("org.freedesktop.FileManager1"),
        QStringLiteral("ShowItems"));
    msg << QStringList{uri} << QString();

    auto *watcher = new QDBusPendingCallWatcher(m_bus.asyncCall(msg), this);
    connect(watcher, &QDBusPendingCallWatcher::finished, [](QDBusPendingCallWatcher *w) {
        w->deleteLater();
    });
}

void ShelfClient::startDrag(const QString &uri) {
    if (uri.isEmpty())
        return;
    QObject *source = QGuiApplication::focusWindow();
    if (!source)
        source = this;
    auto *drag = new QDrag(source);
    auto *mime = new QMimeData();
    mime->setUrls({QUrl(uri)});
    drag->setMimeData(mime);
    drag->exec(Qt::CopyAction);
}

void ShelfClient::startDragAll() {
    QList<QUrl> urls;
    for (const QVariant &entry : m_items) {
        const QString uri = entry.toMap().value(QStringLiteral("uri")).toString();
        if (!uri.isEmpty())
            urls.append(QUrl(uri));
    }
    if (urls.isEmpty())
        return;
    QObject *source = QGuiApplication::focusWindow();
    if (!source)
        source = this;
    auto *drag = new QDrag(source);
    auto *mime = new QMimeData();
    mime->setUrls(urls);
    drag->setMimeData(mime);
    drag->exec(Qt::CopyAction);
}

QString ShelfClient::formatSize(qint64 bytes) const {
    if (bytes <= 0)
        return QStringLiteral("0 B");
    const char *units[] = {"B", "KB", "MB", "GB"};
    double val = static_cast<double>(bytes);
    int idx = 0;
    while (val >= 1024.0 && idx < 3) {
        val /= 1024.0;
        ++idx;
    }
    if (idx == 0 || val >= 10.0)
        return QStringLiteral("%1 %2").arg(qRound(val)).arg(QLatin1String(units[idx]));
    return QStringLiteral("%1 %2").arg(QString::number(val, 'f', 1), QLatin1String(units[idx]));
}
