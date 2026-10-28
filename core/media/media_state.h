#pragma once

#include <QString>
#include <QtGlobal>

struct MediaState {
    QString playerId;
    QString trackId;
    QString title;
    QString artist;
    QString albumArtUri;
    QString playbackStatus = QStringLiteral("Stopped");
    qint64 positionUs = 0;
    qint64 positionSampleUs = 0;
    qint64 durationUs = 0;
    bool canPlay = false;
    bool canPause = false;
    bool canNext = false;
    bool canPrevious = false;
    bool canSeek = false;
    double rate = 1.0;
    double volume = 1.0;
    quint64 revision = 0;
};
