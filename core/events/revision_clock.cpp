#include "revision_clock.h"
#include <QUuid>
#include <limits>

RevisionClock::RevisionClock()
    : m_instanceId(QUuid::createUuid().toString(QUuid::WithoutBraces)),
      m_media(0),
      m_settings(0) {}

QString RevisionClock::instanceId() const {
    return m_instanceId;
}

quint64 RevisionClock::mediaRevision() const {
    return m_media;
}

quint64 RevisionClock::settingsRevision() const {
    return m_settings;
}

quint64 RevisionClock::mediaChanged() {
    if (m_media < std::numeric_limits<quint64>::max()) {
        ++m_media;
    }
    return m_media;
}

quint64 RevisionClock::settingsChanged() {
    if (m_settings < std::numeric_limits<quint64>::max()) {
        ++m_settings;
    }
    return m_settings;
}
