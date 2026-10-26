#include "media_normalizer.h"
#include <QStringList>
#include <cmath>

static QString truncateUtf8(const QString &str, int maxBytes = 2048) {
    QByteArray utf8 = str.toUtf8();
    if (utf8.size() <= maxBytes) {
        return str;
    }
    utf8.truncate(maxBytes);
    return QString::fromUtf8(utf8.constData(), utf8.size());
}

static QString extractArtist(const QVariant &var) {
    if (var.typeId() == QMetaType::QStringList) {
        return var.toStringList().join(QStringLiteral(", "));
    }
    if (var.canConvert<QVariantList>()) {
        QStringList list;
        const auto vlist = var.toList();
        for (const auto &item : vlist) {
            if (item.typeId() == QMetaType::QString) {
                list.append(item.toString());
            }
        }
        return list.join(QStringLiteral(", "));
    }
    if (var.typeId() == QMetaType::QString) {
        return var.toString();
    }
    return QString();
}

static QString sanitizeArtUrl(const QVariant &var) {
    if (var.typeId() != QMetaType::QString) {
        return QString();
    }
    QString uri = var.toString().trimmed();
    if (uri.startsWith(QStringLiteral("file://"))) {
        return uri;
    }
    if (uri.startsWith(QLatin1Char('/'))) {
        return QStringLiteral("file://") + uri;
    }
    return QString();
}

static QString sanitizePlaybackStatus(const QVariant &var) {
    if (var.typeId() != QMetaType::QString) {
        return QStringLiteral("Stopped");
    }
    QString status = var.toString();
    if (status == QLatin1String("Playing") ||
        status == QLatin1String("Paused") ||
        status == QLatin1String("Stopped")) {
        return status;
    }
    return QStringLiteral("Stopped");
}

static double sanitizeRate(const QVariant &var) {
    if (!var.isValid() || !var.canConvert<double>()) {
        return 1.0;
    }
    bool ok = false;
    double r = var.toDouble(&ok);
    if (!ok || !std::isfinite(r) || r <= 0.0) {
        return 1.0;
    }
    return r;
}

static qint64 sanitizeMicroseconds(const QVariant &var) {
    if (!var.isValid()) {
        return 0;
    }
    if (var.typeId() != QMetaType::LongLong &&
        var.typeId() != QMetaType::ULongLong &&
        var.typeId() != QMetaType::Int &&
        var.typeId() != QMetaType::UInt) {
        return 0;
    }
    bool ok = false;
    qint64 val = var.toLongLong(&ok);
    if (!ok || val < 0) {
        return 0;
    }
    return val;
}

MediaState normalizeMpris(const QString &service, const QVariantMap &metadata, const QVariantMap &properties) {
    MediaState state;
    if (service.isEmpty()) {
        return state;
    }
    state.playerId = service;

    // Metadata mapping
    QVariant titleVar = metadata.value(QStringLiteral("xesam:title"));
    if (titleVar.typeId() == QMetaType::QString) {
        state.title = truncateUtf8(titleVar.toString());
    }

    QVariant artistVar = metadata.value(QStringLiteral("xesam:artist"));
    state.artist = truncateUtf8(extractArtist(artistVar));

    state.durationUs = sanitizeMicroseconds(metadata.value(QStringLiteral("mpris:length")));
    state.albumArtUri = sanitizeArtUrl(metadata.value(QStringLiteral("mpris:artUrl")));

    // Properties mapping
    state.playbackStatus = sanitizePlaybackStatus(properties.value(QStringLiteral("PlaybackStatus")));
    state.positionUs = sanitizeMicroseconds(properties.value(QStringLiteral("Position")));
    state.rate = sanitizeRate(properties.value(QStringLiteral("Rate")));
    if (properties.contains(QStringLiteral("Volume"))) {
        bool ok = false;
        double vol = properties.value(QStringLiteral("Volume")).toDouble(&ok);
        if (ok && !std::isnan(vol)) {
            state.volume = std::max(0.0, std::min(1.0, vol));
        }
    }
    if (properties.contains(QStringLiteral("CanPlay")) && properties.value(QStringLiteral("CanPlay")).typeId() == QMetaType::Bool) {
        state.canPlay = properties.value(QStringLiteral("CanPlay")).toBool();
    }
    if (properties.contains(QStringLiteral("CanPause")) && properties.value(QStringLiteral("CanPause")).typeId() == QMetaType::Bool) {
        state.canPause = properties.value(QStringLiteral("CanPause")).toBool();
    }
    if (properties.contains(QStringLiteral("CanGoNext")) && properties.value(QStringLiteral("CanGoNext")).typeId() == QMetaType::Bool) {
        state.canNext = properties.value(QStringLiteral("CanGoNext")).toBool();
    }
    if (properties.contains(QStringLiteral("CanGoPrevious")) && properties.value(QStringLiteral("CanGoPrevious")).typeId() == QMetaType::Bool) {
        state.canPrevious = properties.value(QStringLiteral("CanGoPrevious")).toBool();
    }
    if (properties.contains(QStringLiteral("CanSeek")) && properties.value(QStringLiteral("CanSeek")).typeId() == QMetaType::Bool) {
        state.canSeek = properties.value(QStringLiteral("CanSeek")).toBool();
    }

    return state;
}
