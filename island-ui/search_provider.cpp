#include "search_provider.h"

#include <QDesktopServices>
#include <QMap>
#include <QStringList>
#include <QUrl>

namespace {
constexpr int kMaxQueryLength = 500;

const QMap<QString, QString> &searchPrefixes() {
    static const QMap<QString, QString> prefixes = {
        {QStringLiteral("google"), QStringLiteral("https://www.google.com/search?q=")},
        {QStringLiteral("duckduckgo"), QStringLiteral("https://duckduckgo.com/?q=")},
        {QStringLiteral("brave"), QStringLiteral("https://search.brave.com/search?q=")},
        {QStringLiteral("bing"), QStringLiteral("https://www.bing.com/search?q=")},
    };
    return prefixes;
}
} // namespace

SearchProvider::SearchProvider(QObject *parent) : QObject(parent) {}

QString SearchProvider::buildUrl(const QString &engine, const QString &query) {
    const QString trimmed = query.trimmed();
    if (trimmed.isEmpty() || trimmed.size() > kMaxQueryLength) {
        return QString();
    }

    const auto &prefixes = searchPrefixes();
    const QString prefix = prefixes.value(engine, prefixes.value(QStringLiteral("google")));
    return prefix + QString::fromLatin1(QUrl::toPercentEncoding(trimmed));
}

bool SearchProvider::open(const QString &engine, const QString &query) {
    const QString url = buildUrl(engine, query);
    if (url.isEmpty()) {
        return false;
    }
    return QDesktopServices::openUrl(QUrl::fromEncoded(url.toUtf8()));
}

bool SearchProvider::isValidNavigationUrl(const QString &url) {
    const QString trimmed = url.trimmed();
    if (trimmed.isEmpty()) {
        return false;
    }
    const QUrl parsed(trimmed);
    if (!parsed.isValid()) {
        return false;
    }
    const QString scheme = parsed.scheme().toLower();
    if (scheme != QLatin1String("http") && scheme != QLatin1String("https")) {
        return false;
    }
    if (parsed.host().isEmpty()) {
        return false;
    }
    return true;
}

bool SearchProvider::isValidUrl(const QString &url) const {
    return isValidNavigationUrl(url);
}

bool SearchProvider::openEmbedded(const QString &engine, const QString &query) {
    const QString url = buildUrl(engine, query);
    if (url.isEmpty() || !isValidNavigationUrl(url)) {
        return false;
    }
    emit openEmbeddedRequested(url);
    return true;
}

bool SearchProvider::openExternal(const QString &url) {
    const QString trimmed = url.trimmed();
    if (!isValidNavigationUrl(trimmed)) {
        return false;
    }
    return QDesktopServices::openUrl(QUrl(trimmed));
}

bool SearchProvider::requiresSystemBrowser(const QString &url, bool hasGoogleSession) const {
    const QUrl parsed(url.trimmed());
    if (!parsed.isValid()) {
        return false;
    }
    // QUrl lowercases the host already, but be explicit for safety.
    const QString host = parsed.host().toLower();
    if (host.isEmpty()) {
        return false;
    }
    // Google rejects interactive OAuth from embedded browsers unconditionally,
    // even when a session was imported: the login flow itself is blocked.
    static const QStringList interactiveHosts = {
        QStringLiteral("accounts.google.com"),
        QStringLiteral("accounts.youtube.com"),
    };
    if (interactiveHosts.contains(host)) {
        return true;
    }
    // Passive account pages render fine with an imported session, so only
    // hand them off when there is nothing to authenticate with.
    if (host == QLatin1String("myaccount.google.com")) {
        return !hasGoogleSession;
    }
    return false;
}
