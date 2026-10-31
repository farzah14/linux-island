#pragma once

#include <QString>

// Persistent web-session settings for the embedded search companion.
//
// The companion is a real browser surface, so it keeps its own cookie jar,
// localStorage and cache on disk. Logging in once (Brave, Google, GitHub,
// whatever the user opens) therefore survives closing the Island, and the
// next search starts from the same signed-in session instead of a blank
// incognito profile that search engines treat as a bot.
namespace CompanionProfile {

// Chrome-compatible User-Agent. Qt's default advertises "QtWebEngine", which
// several engines (Brave, Google) score as an unsupported/automated client.
QString userAgent(const QString &chromiumVersion = QString());

// ~/.local/share/linux-island/webengine
QString dataPath();

// ~/.cache/linux-island/webengine
QString cachePath();

} // namespace CompanionProfile
