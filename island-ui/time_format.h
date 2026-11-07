#pragma once

#include <QString>

// Locale-independent mirrors of extension/lib/timeFormat.js. The two
// renderers must produce byte-identical strings, so nothing here may use
// QLocale, toString(Qt::DefaultLocaleShortDate) or translated formats.
QString formatClock(int seconds);
QString formatTimerCompact(const QString &state, const QString &mode, const QString &phase,
                           const QString &label, int remainingSec);
QString formatEventTime(qint64 startMs, qint64 endMs, qint64 nowMs);
