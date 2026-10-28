#pragma once

#include <QObject>
#include <QString>
#include <QSet>
#include <QDBusConnection>

class NotificationWatcher : public QObject {
    Q_OBJECT
    Q_PROPERTY(bool whatsappActivity READ whatsappActivity NOTIFY whatsappActivityChanged)

public:
    explicit NotificationWatcher(const QDBusConnection &bus = QDBusConnection::sessionBus(), QObject *parent = nullptr);

    bool whatsappActivity() const { return m_whatsappActivity; }

    static bool isWhatsAppSource(const QString &appName, const QString &desktopEntry);

    void setNotificationPeekEnabled(bool enabled);
    void setWhatsappEnabled(bool enabled);
    void setDnd(bool dnd);

    Q_INVOKABLE void clearWhatsappActivity();
    Q_INVOKABLE void activateWhatsapp();

    // Testable entry point for simulated / observed notifications
    void handleNotificationObserved(const QString &appName, const QString &desktopEntry, uint id = 0);

signals:
    void peekRequested();
    void whatsappActivityChanged();

private slots:
    void onNotificationClosed(uint id, uint reason);

private:
    QDBusConnection m_bus;
    bool m_notificationPeekEnabled = false;
    bool m_whatsappEnabled = false;
    bool m_dnd = false;
    bool m_whatsappActivity = false;
    QSet<uint> m_activeWhatsappIds;
};
