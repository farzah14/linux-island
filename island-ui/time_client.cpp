#include "time_client.h"

#include <QDBusArgument>
#include <QDBusInterface>
#include <QDBusMessage>
#include <QDBusPendingCall>
#include <QDBusPendingCallWatcher>
#include <QDBusReply>
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
    QDBusInterface iface(kService, kPath, kInterface, m_bus);
    if (!iface.isValid()) return;
    iface.asyncCallWithArgumentList(method, args);
}

void TimeClient::setTimerServiceAvailable(bool available) {
    if (m_timerServiceAvailable == available) return;
    m_timerServiceAvailable = available;
    emit availabilityChanged();
}

void TimeClient::fetchTimer() {
    if (!m_bus.isConnected()) return;

    QDBusInterface iface(kService, kPath, kInterface, m_bus);
    if (!iface.isValid()) return;

    QDBusPendingCall call = iface.asyncCall(QStringLiteral("GetTimer"));
    QDBusPendingCallWatcher *watcher = new QDBusPendingCallWatcher(call, this);
    connect(watcher, &QDBusPendingCallWatcher::finished, this, [this](QDBusPendingCallWatcher *w) {
        w->deleteLater();
        QDBusReply<QVariantMap> reply = *w;
        if (!reply.isValid()) return;
        setTimerServiceAvailable(true);
        applyTimerMap(variantToMap(reply.value()));
    });
}

void TimeClient::fetchTimerStats() {
    if (!m_bus.isConnected()) return;

    QDBusInterface iface(kService, kPath, kInterface, m_bus);
    if (!iface.isValid()) return;

    QDBusPendingCall call = iface.asyncCall(QStringLiteral("GetTimerStats"));
    QDBusPendingCallWatcher *watcher = new QDBusPendingCallWatcher(call, this);
    connect(watcher, &QDBusPendingCallWatcher::finished, this, [this](QDBusPendingCallWatcher *w) {
        w->deleteLater();
        QDBusReply<QVariantMap> reply = *w;
        if (!reply.isValid()) return;
        m_timerStats = variantToMap(reply.value());
        emit statsChanged();
    });
}

void TimeClient::applyTimerMap(const QVariantMap &timer) {
    const quint64 revision = timer.value(QStringLiteral("revision")).toULongLong();
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
    QVariantMap payload = timer;
    if (!payload.contains(QStringLiteral("revision"))) {
        payload[QStringLiteral("revision")] = QVariant::fromValue<quint64>(revision);
    }
    applyTimerMap(payload);
}

void TimeClient::onNameOwnerChanged(const QString &service, const QString &oldOwner,
                                    const QString &newOwner) {
    Q_UNUSED(oldOwner);
    if (service != kService) return;

    if (newOwner.isEmpty()) {
        m_timerRevision = 0;
        m_timerStats.clear();
        setTimerServiceAvailable(false);
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
