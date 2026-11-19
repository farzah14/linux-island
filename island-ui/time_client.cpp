#include "time_client.h"

#include <QDBusArgument>
#include <QDBusMessage>
#include <QDBusPendingCall>
#include <QDBusPendingCallWatcher>
#include <QDBusPendingReply>
#include <QDateTime>
#include "time_format.h"

namespace {

const QString kService = QStringLiteral("io.github.linuxisland.Core");
const QString kPath = QStringLiteral("/io/github/linuxisland/Core");
const QString kInterface = QStringLiteral("io.github.linuxisland.Time1");

// GetTimer returns a nested a{sv}; toMap() silently turns QDBusArgument into an
// empty map, so demarshal explicitly.
QVariantMap variantToMap(const QVariant &value) {
    if (value.metaType().id() == qMetaTypeId<QDBusArgument>()) {
        return qdbus_cast<QVariantMap>(value.value<QDBusArgument>());
    }
    return value.toMap();
}

} // namespace

TimeClient::TimeClient(const QDBusConnection &bus, QObject *parent)
    : QObject(parent),
      m_bus(bus) {
    m_retryTimer.setSingleShot(true);
    m_retryTimer.setInterval(2000);
    connect(&m_retryTimer, &QTimer::timeout, this, &TimeClient::fetchTimer);
    if (m_bus.isConnected()) {
        m_bus.connect(QStringLiteral("org.freedesktop.DBus"),
                      QStringLiteral("/org/freedesktop/DBus"),
                      QStringLiteral("org.freedesktop.DBus"),
                      QStringLiteral("NameOwnerChanged"),
                      this,
                      SLOT(onNameOwnerChanged(QString,QString,QString)));

        m_bus.connect(kService, kPath, kInterface, QStringLiteral("TimerChanged"),
                      this, SLOT(onTimerChanged(quint64,QVariantMap)));
    }

    fetchTimer();
    fetchTimerStats();
}

bool TimeClient::timerActive() const {
    return m_timerState == QLatin1String("running") ||
           m_timerState == QLatin1String("paused") ||
           m_timerState == QLatin1String("finished");
}

QString TimeClient::compactText() const {
    if (timerActive()) {
        return formatTimerCompact(m_timerState, m_timerMode, m_timerPhase, m_timerLabel, m_timerRemainingSec);
    }
    return QString();
}

QString TimeClient::compactIcon() const {
    return timerActive() ? QStringLiteral("⏱") : QString();
}

void TimeClient::call(const QString &method, const QVariantList &args) {
    if (!m_bus.isConnected()) return;
    auto message = QDBusMessage::createMethodCall(kService, kPath, kInterface, method);
    message.setArguments(args);
    m_bus.asyncCall(message, 2000);
}

void TimeClient::setTimerServiceAvailable(bool available) {
    if (available) m_retryTimer.stop();
    if (m_timerServiceAvailable == available) return;
    m_timerServiceAvailable = available;
    emit availabilityChanged();
}

void TimeClient::fetchTimer() {
    if (!m_bus.isConnected() || m_fetchInFlight) return;
    m_fetchInFlight = true;
    const quint64 generation = m_ownerGeneration;
    const auto message = QDBusMessage::createMethodCall(kService, kPath, kInterface, QStringLiteral("GetTimer"));
    QDBusPendingCall call = m_bus.asyncCall(message, 2000);
    QDBusPendingCallWatcher *watcher = new QDBusPendingCallWatcher(call, this);
    connect(watcher, &QDBusPendingCallWatcher::finished, this, [this, generation](QDBusPendingCallWatcher *w) {
        w->deleteLater();
        if (generation != m_ownerGeneration) return;
        m_fetchInFlight = false;
        QDBusPendingReply<QVariantMap> reply = *w;
        if (reply.isError()) {
            if (!m_timerServiceAvailable && m_bus.isConnected()) m_retryTimer.start();
            return;
        }
        const bool wasAvailable = m_timerServiceAvailable;
        setTimerServiceAvailable(true);
        applyTimerMap(variantToMap(reply.value()));
        if (!wasAvailable) fetchTimerStats();
    });
}

void TimeClient::fetchTimerStats() {
    if (!m_bus.isConnected()) return;

    const quint64 generation = m_ownerGeneration;
    const quint64 requestId = ++m_statsRequestId;
    const auto message = QDBusMessage::createMethodCall(kService, kPath, kInterface, QStringLiteral("GetTimerStats"));
    QDBusPendingCall call = m_bus.asyncCall(message, 2000);
    QDBusPendingCallWatcher *watcher = new QDBusPendingCallWatcher(call, this);
    connect(watcher, &QDBusPendingCallWatcher::finished, this, [this, generation, requestId](QDBusPendingCallWatcher *w) {
        w->deleteLater();
        if (generation != m_ownerGeneration || requestId != m_statsRequestId) return;
        QDBusPendingReply<QVariantMap> reply = *w;
        if (reply.isError()) return;
        m_timerStats = variantToMap(reply.value());
        emit statsChanged();
    });
}

void TimeClient::applyTimerMap(const QVariantMap &timer) {
    const quint64 revision = timer.value(QStringLiteral("revision")).toULongLong();
    if (revision == 0 && m_timerRevision != 0) return;
    if (revision != 0 && revision <= m_timerRevision) return;
    if (revision != 0) m_timerRevision = revision;

    const QString previousState = m_timerState;
    m_timerState = timer.value(QStringLiteral("state"), QStringLiteral("idle")).toString();
    m_timerMode = timer.value(QStringLiteral("mode"), QStringLiteral("countdown")).toString();
    m_timerPhase = timer.value(QStringLiteral("phase")).toString();
    m_timerLabel = timer.value(QStringLiteral("label")).toString();
    m_timerDurationSec = timer.value(QStringLiteral("durationSec")).toInt();
    m_timerRemainingSec = timer.value(QStringLiteral("remainingSec")).toInt();
    m_timerCycle = timer.value(QStringLiteral("cycle")).toInt();
    m_timerTotalCycles = timer.value(QStringLiteral("totalCycles"), 4).toInt();
    m_timerCompletedFocus = timer.value(QStringLiteral("completedFocus")).toInt();
    m_timerElapsedSec = timer.value(QStringLiteral("elapsedSec")).toInt();
    m_timerAutoAdvance = timer.value(QStringLiteral("autoAdvance"), true).toBool();

    emit timerChanged();
    emit compactChanged();

    if (previousState != QLatin1String("finished") && m_timerState == QLatin1String("finished")) {
        emit timerFinished();
    }
}

void TimeClient::onTimerChanged(quint64 revision, const QVariantMap &timer) {
    const bool wasAvailable = m_timerServiceAvailable;
    const QString oldState = m_timerState;
    const QString oldMode = m_timerMode;
    const QString oldPhase = m_timerPhase;
    const int oldCompletedFocus = m_timerCompletedFocus;
    setTimerServiceAvailable(true);
    QVariantMap payload = timer;
    if (!payload.contains(QStringLiteral("revision"))) {
        payload[QStringLiteral("revision")] = QVariant::fromValue<quint64>(revision);
    }
    applyTimerMap(payload);
    if (!wasAvailable || oldState != m_timerState || oldMode != m_timerMode ||
        oldPhase != m_timerPhase || oldCompletedFocus != m_timerCompletedFocus) fetchTimerStats();
}

void TimeClient::onNameOwnerChanged(const QString &service, const QString &oldOwner,
                                    const QString &newOwner) {
    Q_UNUSED(oldOwner);
    if (service != kService) return;
    ++m_ownerGeneration;
    m_fetchInFlight = false;
    m_retryTimer.stop();
    m_timerRevision = 0;
    m_timerStats.clear();
    setTimerServiceAvailable(false);

    if (newOwner.isEmpty()) {
        applyTimerMap({{QStringLiteral("state"), QStringLiteral("idle")},
                       {QStringLiteral("mode"), QStringLiteral("countdown")},
                       {QStringLiteral("phase"), QString()},
                       {QStringLiteral("label"), QString()},
                       {QStringLiteral("durationSec"), 0},
                       {QStringLiteral("remainingSec"), 0},
                       {QStringLiteral("cycle"), 0}});
        emit statsChanged();
        return;
    }

    fetchTimer();
    fetchTimerStats();
}

void TimeClient::startTimer(int minutes) {
    call(QStringLiteral("StartTimer"),
         {QVariantMap{{QStringLiteral("mode"), QStringLiteral("countdown")},
                      {QStringLiteral("durationMin"), minutes}}});
}

void TimeClient::startPomodoro() {
    call(QStringLiteral("StartTimer"), {QVariantMap{{QStringLiteral("mode"), QStringLiteral("pomodoro")}}});
}

void TimeClient::pauseTimer() {
    call(QStringLiteral("ControlTimer"), {QStringLiteral("pause")});
}

void TimeClient::resumeTimer() {
    call(QStringLiteral("ControlTimer"), {QStringLiteral("resume")});
}

void TimeClient::stopTimer() {
    call(QStringLiteral("ControlTimer"), {QStringLiteral("stop")});
}

void TimeClient::skipPhase() {
    call(QStringLiteral("ControlTimer"), {QStringLiteral("skip")});
}

void TimeClient::nextPhase() {
    call(QStringLiteral("ControlTimer"), {QStringLiteral("next")});
}

void TimeClient::fetchStats() {
    fetchTimerStats();
}

QString TimeClient::formatEventTime(qlonglong startMs, qlonglong endMs, qlonglong nowMs) const {
    return ::formatEventTime(startMs, endMs, nowMs);
}

QString TimeClient::formatClock(int seconds) const {
    return ::formatClock(seconds);
}

qlonglong TimeClient::nowMs() const {
    return QDateTime::currentMSecsSinceEpoch();
}
