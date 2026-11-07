#include "time_format.h"

#include <QDate>
#include <QDateTime>
#include <QTime>

namespace {

const char *const kWeekdays[] = {"Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"};

QString pad2(int value) {
    return QStringLiteral("%1").arg(value, 2, 10, QLatin1Char('0'));
}

QDate localDate(qint64 ms) {
    return QDateTime::fromMSecsSinceEpoch(ms).date();
}

} // namespace

QString formatClock(int seconds) {
    const int total = qMax(0, seconds);
    const int h = total / 3600;
    const int m = (total % 3600) / 60;
    const int s = total % 60;
    if (h > 0) {
        return QStringLiteral("%1:%2:%3").arg(h).arg(pad2(m), pad2(s));
    }
    return QStringLiteral("%1:%2").arg(m).arg(pad2(s));
}

QString formatTimerCompact(const QString &state, const QString &mode, const QString &phase,
                           const QString &label, int remainingSec) {
    if (state == QLatin1String("finished")) {
        return QStringLiteral("Time's up");
    }

    const QString clock = formatClock(remainingSec);
    if (mode == QLatin1String("pomodoro")) {
        if (phase == QLatin1String("break")) return QStringLiteral("Break ") + clock;
        if (phase == QLatin1String("long-break")) return QStringLiteral("Long break ") + clock;
        return QStringLiteral("Focus ") + clock;
    }
    return label.isEmpty() ? clock : clock + QStringLiteral(" · ") + label;
}

QString formatEventTime(qint64 startMs, qint64 endMs, qint64 nowMs) {
    if (startMs <= 0) return QString();

    if (startMs <= nowMs && nowMs < endMs) return QStringLiteral("Now");

    const qint64 delta = startMs - nowMs;
    // Anything inside the next hour reads better as a countdown than a clock.
    if (delta < 3600000) {
        const qint64 minutes = qMax<qint64>(1, (delta + 59999) / 60000);
        return QStringLiteral("in %1m").arg(minutes);
    }

    const QDateTime start = QDateTime::fromMSecsSinceEpoch(startMs);
    const QString clock = pad2(start.time().hour()) + QLatin1Char(':') + pad2(start.time().minute());

    const QDate startDay = localDate(startMs);
    const QDate today = localDate(nowMs);
    const qint64 dayDiff = today.daysTo(startDay);
    if (dayDiff == 0) return clock;
    if (dayDiff == 1) return QStringLiteral("Tomorrow ") + clock;
    return QString::fromLatin1(kWeekdays[startDay.dayOfWeek() % 7]) + QLatin1Char(' ') + clock;
}
