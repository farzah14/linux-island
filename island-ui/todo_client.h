#pragma once
#include <QObject>
#include <QVariantList>
#include <QDBusServiceWatcher>

class TodoClient : public QObject {
    Q_OBJECT
    Q_PROPERTY(QVariantList items READ items NOTIFY changed)
    Q_PROPERTY(QString status READ status NOTIFY changed)
public:
    explicit TodoClient(QObject *parent = nullptr);
    QVariantList items() const { return m_items; }
    QString status() const { return m_status; }
    Q_INVOKABLE void refresh();
    Q_INVOKABLE void add(const QString &title);
    Q_INVOKABLE void setDone(const QString &id, bool done);
    Q_INVOKABLE void remove(const QString &id);
signals:
    void changed();
    void added(const QString &title);
private slots:
    void onChanged(const QString &json);
private:
    void call(const QString &method, const QVariantList &args);
    QVariantList m_items;
    QString m_status = QStringLiteral("Connecting…");
    quint64 m_generation = 0;
    QDBusServiceWatcher m_watcher;
};
