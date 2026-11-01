#pragma once

#include <QObject>
#include <QQuickWindow>
#include <QRegion>
#include <QTimer>
#include "island_client.h"

class DisplaySurfaceManager : public QObject {
    Q_OBJECT
    Q_PROPERTY(int windowWidth READ windowWidth NOTIFY windowGeometryChanged)
    Q_PROPERTY(int windowHeight READ windowHeight NOTIFY windowGeometryChanged)

public:
    explicit DisplaySurfaceManager(QQuickWindow *window, IslandClient *client, QObject *parent = nullptr);
    void attachWindow(QQuickWindow *window);

    int windowWidth() const { return 440; }
    int windowHeight() const { return 360; }

    Q_INVOKABLE void updateInputMask(int x, int y, int width, int height, int radius = 0);
    Q_INVOKABLE void updateWindowPosition();

signals:
    void windowGeometryChanged();
    void fullscreenDetected(bool isFullscreen);

private slots:
    void checkFullscreen();
    void onSettingsChanged();

private:
    QQuickWindow *m_window = nullptr;
    IslandClient *m_client = nullptr;
    QTimer m_fullscreenTimer;
    bool m_isFullscreen = false;
    QRect m_currentMaskRect;
    int m_currentMaskRadius = 0;
};
