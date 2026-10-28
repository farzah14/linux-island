#include "variant_codec.h"

QVariantMap toMediaVariantMap(const MediaState &state) {
    QVariantMap map;
    map[QStringLiteral("playerId")] = state.playerId;
    map[QStringLiteral("trackId")] = state.trackId;
    map[QStringLiteral("title")] = state.title;
    map[QStringLiteral("artist")] = state.artist;
    map[QStringLiteral("albumArtUri")] = state.albumArtUri;
    map[QStringLiteral("playbackStatus")] = state.playbackStatus;
    map[QStringLiteral("positionUs")] = QVariant::fromValue<qint64>(state.positionUs);
    map[QStringLiteral("positionSampleUs")] = QVariant::fromValue<qint64>(state.positionSampleUs);
    map[QStringLiteral("durationUs")] = QVariant::fromValue<qint64>(state.durationUs);
    map[QStringLiteral("canPlay")] = state.canPlay;
    map[QStringLiteral("canPause")] = state.canPause;
    map[QStringLiteral("canNext")] = state.canNext;
    map[QStringLiteral("canPrevious")] = state.canPrevious;
    map[QStringLiteral("canSeek")] = state.canSeek;
    map[QStringLiteral("rate")] = state.rate;
    map[QStringLiteral("volume")] = state.volume;
    map[QStringLiteral("revision")] = QVariant::fromValue<quint64>(state.revision);
    return map;
}
