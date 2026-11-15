#pragma once

#include <QDBusAbstractAdaptor>
#include <QStringList>
#include <QVariantMap>
#include "core_service.h"

class ShelfAdaptor : public QDBusAbstractAdaptor {
    Q_OBJECT
    Q_CLASSINFO("D-Bus Interface", "io.github.linuxisland.Shelf1")
public:
    explicit ShelfAdaptor(CoreService *parent)
        : QDBusAbstractAdaptor(parent),
          m_service(parent) {
        connect(m_service, &CoreService::shelfChanged, this, &ShelfAdaptor::ShelfChanged);
    }

public slots:
    QVariantMap GetShelf() {
        return m_service->shelfSnapshot();
    }

    bool AddFiles(const QStringList &uris) {
        return m_service->addShelfFiles(uris);
    }

    bool RemoveFile(const QString &id) {
        return m_service->removeShelfFile(id);
    }

    bool ClearShelf() {
        return m_service->clearShelf();
    }

signals:
    void ShelfChanged(quint64 revision, const QVariantMap &shelf);

private:
    CoreService *m_service;
};
