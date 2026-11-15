#pragma once
#include <QDBusAbstractAdaptor>
#include "core_service.h"

class TodoAdaptor : public QDBusAbstractAdaptor {
    Q_OBJECT
    Q_CLASSINFO("D-Bus Interface", "io.github.linuxisland.Todo1")
public:
    explicit TodoAdaptor(CoreService *service) : QDBusAbstractAdaptor(service), m_service(service) {
        connect(service, &CoreService::todoChanged, this, &TodoAdaptor::Changed);
    }
public slots:
    QString GetTasks() const { return m_service->todoJson(); }
    bool AddTask(const QString &title) { return m_service->addTodo(title); }
    bool SetDone(const QString &id, bool done) { return m_service->setTodoDone(id, done); }
    bool RemoveTask(const QString &id) { return m_service->removeTodo(id); }
signals:
    void Changed(const QString &json);
private:
    CoreService *m_service;
};
