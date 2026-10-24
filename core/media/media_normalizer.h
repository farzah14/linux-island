#pragma once

#include <QString>
#include <QVariantMap>
#include "media_state.h"

MediaState normalizeMpris(const QString &service, const QVariantMap &metadata, const QVariantMap &properties);
