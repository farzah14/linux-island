#include "todo_service.h"
#include <QFile>
#include <QJsonArray>
#include <QJsonDocument>
#include <QJsonObject>
#include <QSaveFile>
#include <QDir>
#include <QStandardPaths>
#include <QUuid>

TodoService::TodoService(const QString &storagePath) : m_path(storagePath) {
    if (m_path.isEmpty()) {
        const auto dir = QStandardPaths::writableLocation(QStandardPaths::GenericDataLocation) + "/linux-island";
        QDir().mkpath(dir);
        m_path = dir + "/todo.json";
    }
    QFile file(m_path);
    if (!file.exists()) return;
    if (!file.open(QIODevice::ReadOnly)) { m_readable = false; return; }
    QJsonParseError error;
    const auto doc = QJsonDocument::fromJson(file.readAll(), &error);
    if (error.error != QJsonParseError::NoError || !doc.isArray()) { m_readable = false; return; }
    const auto array = doc.array();
    if (array.size() > 200) { m_readable = false; return; }
    for (const auto &value : array) {
        if (!value.isObject()) { m_readable = false; return; }
        const auto item = value.toObject();
        if (!item.value("id").isString() || item.value("id").toString().isEmpty() ||
            !item.value("title").isString() || item.value("title").toString().trimmed().isEmpty() ||
            item.value("title").toString().size() > 500 || !item.value("done").isBool()) {
            m_readable = false; return;
        }
    }
    m_items = array.toVariantList();
}

bool TodoService::commit(const QVariantList &items) {
    if (!m_readable) return false;
    QSaveFile file(m_path);
    if (!file.open(QIODevice::WriteOnly)) return false;
    const auto data = QJsonDocument(QJsonArray::fromVariantList(items)).toJson(QJsonDocument::Compact);
    if (file.write(data) != data.size() || !file.commit()) return false;
    m_items = items;
    return true;
}

bool TodoService::add(const QString &title) {
    const auto clean = title.trimmed();
    if (clean.isEmpty() || clean.size() > 500 || m_items.size() >= 200) return false;
    auto next = m_items;
    next.append(QVariantMap{{"id", QUuid::createUuid().toString(QUuid::WithoutBraces)},
                            {"title", clean}, {"done", false}});
    return commit(next);
}

bool TodoService::setDone(const QString &id, bool done) {
    auto next = m_items;
    for (qsizetype i = 0; i < next.size(); ++i) {
        auto item = next[i].toMap();
        if (item.value("id").toString() != id) continue;
        item["done"] = done;
        next[i] = item;
        return commit(next);
    }
    return false;
}

bool TodoService::remove(const QString &id) {
    auto next = m_items;
    for (qsizetype i = 0; i < next.size(); ++i) {
        if (next[i].toMap().value("id").toString() != id) continue;
        next.removeAt(i);
        return commit(next);
    }
    return false;
}
