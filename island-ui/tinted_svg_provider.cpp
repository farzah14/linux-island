#include "tinted_svg_provider.h"

#include <QBuffer>
#include <QFile>
#include <QImageReader>
#include <QRegularExpression>
#include <QUrlQuery>

namespace {
bool isValidIconName(const QString &name) {
    static const QRegularExpression rx(QStringLiteral("^[A-Za-z0-9._-]+\\.svg$"));
    return !name.contains(QLatin1String("..")) && rx.match(name).hasMatch();
}

QString sanitizeHexColor(const QString &raw) {
    static const QRegularExpression rx6(QStringLiteral("^#[0-9A-Fa-f]{6}$"));
    static const QRegularExpression rx8(QStringLiteral("^#[0-9A-Fa-f]{8}$"));
    const QString trimmed = raw.trimmed();
    if (rx6.match(trimmed).hasMatch()) return trimmed;
    if (rx8.match(trimmed).hasMatch()) return QLatin1Char('#') + trimmed.mid(3);
    return QStringLiteral("#F4F6F5");
}
} // namespace

TintedSvgProvider::TintedSvgProvider()
    : QQuickImageProvider(QQuickImageProvider::Image) {}

QImage TintedSvgProvider::requestImage(const QString &id, QSize *size, const QSize &requestedSize) {
    const int qIdx = id.indexOf(QLatin1Char('?'));
    const QString iconName = (qIdx >= 0) ? id.left(qIdx) : id;
    if (!isValidIconName(iconName)) {
        return {};
    }

    QString color = QStringLiteral("#F4F6F5");
    if (qIdx >= 0) {
        const QUrlQuery query(id.mid(qIdx + 1));
        if (query.hasQueryItem(QStringLiteral("color"))) {
            color = sanitizeHexColor(query.queryItemValue(QStringLiteral("color"), QUrl::FullyDecoded));
        }
    }

    QString resourcePath = QStringLiteral(":/qt/qml/linuxisland/ui/icons/ui/") + iconName;
    if (!QFile::exists(resourcePath)) {
        resourcePath = QStringLiteral(":/linuxisland/ui/icons/ui/") + iconName;
    }
    QFile file(resourcePath);
    if (!file.open(QIODevice::ReadOnly)) {
        return {};
    }

    QByteArray svgBytes = file.readAll();
    svgBytes.replace("currentColor", color.toUtf8());

    QBuffer buffer(&svgBytes);
    buffer.open(QIODevice::ReadOnly);
    QImageReader reader(&buffer, "svg");

    const QSize targetSize(
        requestedSize.width() > 0 ? requestedSize.width() : 16,
        requestedSize.height() > 0 ? requestedSize.height() : 16);
    reader.setScaledSize(targetSize);

    QImage image = reader.read();
    if (size) {
        *size = image.size();
    }
    return image;
}
