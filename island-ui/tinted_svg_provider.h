#pragma once

#include <QQuickImageProvider>

// Renders bundled monochrome symbolic SVGs tinted to a requested hex color.
// Keeps Qt 6.4+ compatibility by avoiding QtQuick.Effects (introduced in 6.5).
class TintedSvgProvider : public QQuickImageProvider {
public:
    TintedSvgProvider();
    QImage requestImage(const QString &id, QSize *size, const QSize &requestedSize) override;
};
