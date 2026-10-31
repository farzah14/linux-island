#include "companion_profile.h"

#include <QStandardPaths>
#include <QtWebEngineCore/qtwebenginecoreglobal.h>

namespace CompanionProfile {

QString userAgent(const QString &chromiumVersion) {
    const QString version = chromiumVersion.isEmpty()
        ? QString::fromLatin1(qWebEngineChromiumVersion())
        : chromiumVersion;
    return QStringLiteral(
               "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) "
               "Chrome/%1 Safari/537.36")
        .arg(version);
}

QString dataPath() {
    return QStandardPaths::writableLocation(QStandardPaths::GenericDataLocation)
        + QStringLiteral("/linux-island/webengine");
}

QString cachePath() {
    return QStandardPaths::writableLocation(QStandardPaths::GenericCacheLocation)
        + QStringLiteral("/linux-island/webengine");
}

} // namespace CompanionProfile
