#pragma once
#include <QString>
#include <QVariantList>

// Owns one local task list. Mutations commit to disk before becoming visible.
class TodoService {
public:
    explicit TodoService(const QString &storagePath);
    QVariantList items() const { return m_items; }
    bool add(const QString &title);
    bool setDone(const QString &id, bool done);
    bool remove(const QString &id);
private:
    bool commit(const QVariantList &items);
    QString m_path;
    QVariantList m_items;
    bool m_readable = true;
};
