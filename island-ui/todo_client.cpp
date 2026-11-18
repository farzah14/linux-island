#include "todo_client.h"
#include <QDBusConnection>
#include <QDBusMessage>
#include <QDBusPendingCallWatcher>
#include <QDBusPendingReply>
#include <QJsonArray>
#include <QJsonDocument>

namespace {
constexpr auto service = "io.github.linuxisland.Core";
constexpr auto path = "/io/github/linuxisland/Core";
constexpr auto interface = "io.github.linuxisland.Todo1";
QDBusMessage message(const QString &method) { return QDBusMessage::createMethodCall(service, path, interface, method); }
}
TodoClient::TodoClient(QObject *parent) : QObject(parent), m_watcher(service, QDBusConnection::sessionBus(), QDBusServiceWatcher::WatchForOwnerChange, this) {
    auto bus = QDBusConnection::sessionBus();
    bus.connect(service, path, interface, "Changed", this, SLOT(onChanged(QString)));
    connect(&m_watcher, &QDBusServiceWatcher::serviceOwnerChanged, this, [this] { ++m_generation; refresh(); });
    refresh();
}
void TodoClient::onChanged(const QString &json) {
    ++m_generation;
    QJsonParseError error;
    const auto doc = QJsonDocument::fromJson(json.toUtf8(), &error);
    if (error.error != QJsonParseError::NoError || !doc.isArray()) { m_status = "Could not read tasks"; emit changed(); return; }
    m_items = doc.array().toVariantList();
    m_status = m_items.isEmpty() ? "No tasks yet" : QString::number(m_items.size()) + " tasks";
    emit changed();
}
void TodoClient::refresh() {
    const auto generation = m_generation;
    auto *watcher = new QDBusPendingCallWatcher(QDBusConnection::sessionBus().asyncCall(message("GetTasks")), this);
    connect(watcher, &QDBusPendingCallWatcher::finished, this, [this, generation](QDBusPendingCallWatcher *w) {
        QDBusPendingReply<QString> reply = *w;
        if (generation == m_generation) {
            if (reply.isError()) { m_status = "To-do service unavailable"; emit changed(); }
            else onChanged(reply.value());
        }
        w->deleteLater();
    });
}
void TodoClient::call(const QString &method, const QVariantList &args) {
    auto msg = message(method); msg.setArguments(args);
    auto *watcher = new QDBusPendingCallWatcher(QDBusConnection::sessionBus().asyncCall(msg), this);
    connect(watcher, &QDBusPendingCallWatcher::finished, this, [this, method, args](QDBusPendingCallWatcher *w) {
        QDBusPendingReply<bool> reply = *w;
        if (reply.isError() || !reply.value()) { m_status = "Could not update tasks"; emit changed(); }
        else if (method == "AddTask") emit added(args.value(0).toString());
        w->deleteLater();
    });
}
void TodoClient::add(const QString &title) { if (!title.trimmed().isEmpty()) call("AddTask", {title}); }
void TodoClient::setDone(const QString &id, bool done) { call("SetDone", {id, done}); }
void TodoClient::remove(const QString &id) { call("RemoveTask", {id}); }
