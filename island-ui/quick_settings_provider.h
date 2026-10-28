#pragma once

#include <QObject>
#include <QString>

class QuickSettingsProvider : public QObject {
    Q_OBJECT
    Q_PROPERTY(bool darkMode READ darkMode NOTIFY stateChanged)
    Q_PROPERTY(bool nightLight READ nightLight NOTIFY stateChanged)
    Q_PROPERTY(bool dnd READ dnd NOTIFY stateChanged)

public:
    explicit QuickSettingsProvider(QObject *parent = nullptr);

    bool darkMode() const { return m_darkMode; }
    bool nightLight() const { return m_nightLight; }
    bool dnd() const { return m_dnd; }

    Q_INVOKABLE void toggleDarkMode();
    Q_INVOKABLE void toggleNightLight();
    Q_INVOKABLE void toggleDnd();
    Q_INVOKABLE void openSettingsApp();

signals:
    void stateChanged();
    void themeOverrideRequested(const QString &theme);

private:
    void detectInitialTheme();

    bool m_darkMode = true;
    bool m_nightLight = false;
    bool m_dnd = false;
};
