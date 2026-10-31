#include "cookie_importer.h"

#include <QCryptographicHash>
#include <QDBusConnection>
#include <QDBusArgument>
#include <QDBusInterface>
#include <QDBusMessage>
#include <QDBusObjectPath>
#include <QDBusReply>
#include <QDBusVariant>
#include <QDateTime>
#include <QDir>
#include <QFile>
#include <QFileInfo>
#include <QMap>
#include <QMessageAuthenticationCode>
#include <QNetworkCookie>
#include <QProcess>
#include <memory>
#include <openssl/evp.h>
#include <QSqlDatabase>
#include <QSqlError>
#include <QSqlQuery>
#include <QStandardPaths>
#include <QTemporaryDir>
#include <QTimeZone>
#include <QUrl>
#include <QtWebEngineQuick/qquickwebengineprofile.h>
#include <QtWebEngineCore/qwebenginecookiestore.h>

namespace {


QString findCookieDatabase(const QString &browserConfigDir) {
    const QStringList candidates = {
        browserConfigDir + QStringLiteral("/Default/Cookies"),
        browserConfigDir + QStringLiteral("/Default/Network/Cookies"),
        browserConfigDir + QStringLiteral("/Profile 1/Cookies"),
    };
    for (const QString &path : candidates) {
        if (QFileInfo::exists(path)) {
            return path;
        }
    }
    return QString();
}

// Chromium-family profiles live under the XDG config dir for distro packages,
// but Flatpak and Snap each keep their own prefix. Searching every plausible
// root lets one relative profile path ("BraveSoftware/Brave-Browser") work for
// all three packaging styles.
QStringList browserConfigRoots() {
    QStringList roots;
    const QString config = QStandardPaths::writableLocation(QStandardPaths::GenericConfigLocation);
    if (!config.isEmpty()) {
        roots << config;
    }

    const QString home = QDir::homePath();
    const QString flatpakApps = home + QStringLiteral("/.var/app");
    const QStringList appIds =
        QDir(flatpakApps).entryList(QDir::Dirs | QDir::NoDotAndDotDot, QDir::Name);
    for (const QString &appId : appIds) {
        roots << flatpakApps + QLatin1Char('/') + appId + QStringLiteral("/config");
    }

    // Snap roots are the parents of the relative profile paths.
    roots << home + QStringLiteral("/snap/chromium/common")
          << home + QStringLiteral("/snap/brave/common")
          << home + QStringLiteral("/snap/microsoft-edge/common");
    return roots;
}

// Resolves a relative profile path to an absolute directory, preferring the
// native location before Flatpak/Snap copies.
QString resolveBrowserConfigDir(const QString &relativeDir) {
    const QStringList roots = browserConfigRoots();
    for (const QString &root : roots) {
        const QString dir = root + QLatin1Char('/') + relativeDir;
        if (!findCookieDatabase(dir).isEmpty()) {
            return dir;
        }
    }
    return QString();
}

struct BrowserSource {
    QString configDir;
    QString keyringMatch;
    QString label;
};

// Lowercased alphanumerics only, so "Microsoft Edge", "microsoft-edge" and
// "com.microsoft.Edge" compare equal.
QString normalizedToken(const QString &value) {
    QString out;
    out.reserve(value.size());
    for (const QChar ch : value) {
        if (ch.isLetterOrNumber()) {
            out.append(ch.toLower());
        }
    }
    return out;
}

BrowserSource detectBrowserSource() {
    QProcess proc;
    proc.start(QStringLiteral("xdg-settings"), {QStringLiteral("get"), QStringLiteral("default-web-browser")});
    if (proc.waitForFinished(1000) && proc.exitStatus() == QProcess::NormalExit && proc.exitCode() == 0) {
        QString desktop = QString::fromUtf8(proc.readAllStandardOutput()).trimmed();
        if (desktop.endsWith(QLatin1String(".desktop"))) {
            desktop.chop(8);
        }
        // Flatpak and Snap ship reverse-DNS desktop IDs (com.brave.Browser,
        // org.chromium.Chromium, …), so prefix matching alone misses them.
        const QString lower = desktop.toLower();
        struct KnownBrowser {
            const char *match;
            const char *dir;
            const char *label;
        };
        const KnownBrowser known[] = {
            {"brave", "BraveSoftware/Brave-Browser", "Brave"},
            {"google-chrome", "google-chrome", "Chrome"},
            {"google.chrome", "google-chrome", "Chrome"},
            {"chromium", "chromium", "Chromium"},
            {"microsoft-edge", "microsoft-edge", "Microsoft Edge"},
            {"microsoft.edge", "microsoft-edge", "Microsoft Edge"},
        };
        for (const auto &browser : known) {
            if (!lower.contains(QLatin1String(browser.match))) {
                continue;
            }
            const QString dir = resolveBrowserConfigDir(QString::fromLatin1(browser.dir));
            if (!dir.isEmpty()) {
                return {dir, QString::fromLatin1(browser.label), QString::fromLatin1(browser.label)};
            }
        }
    }

    // No usable default browser: fall back to whichever Chromium-family
    // profile actually exists on disk, in preference order.
    struct FallbackBrowser {
        const char *dir;
        const char *label;
    };
    const FallbackBrowser candidates[] = {
        {"BraveSoftware/Brave-Browser", "Brave"},
        {"google-chrome", "Chrome"},
        {"chromium", "Chromium"},
        {"microsoft-edge", "Microsoft Edge"},
    };
    for (const auto &candidate : candidates) {
        const QString dir = resolveBrowserConfigDir(QString::fromLatin1(candidate.dir));
        if (!dir.isEmpty()) {
            return {dir, QString::fromLatin1(candidate.label), QString::fromLatin1(candidate.label)};
        }
    }

    return {};
}

// PBKDF2-HMAC-SHA1 with one iteration, matching Chromium's Linux key
// derivation ("saltysalt" as the salt, 16-byte key).
QByteArray deriveKey(const QByteArray &password) {
    const QByteArray salt = QByteArrayLiteral("saltysalt");
    QByteArray block = salt + QByteArray::fromHex("00000001");
    QMessageAuthenticationCode mac(QCryptographicHash::Sha1, password);
    mac.addData(block);
    return mac.result().left(16);
}

// Chromium stores cookies as v10/v11 = AES-128-CBC, IV of 16 spaces, PKCS#7
// padding. From schema version 24 onwards the plaintext starts with a 32-byte
// SHA-256 digest of the cookie's domain, so it must be stripped; older
// databases store the value with no prefix at all.
//
// ok is separate from value on purpose: a v24+ cookie with an empty value
// decrypts to exactly the 32-byte digest, which is a *successful* decrypt of
// an empty value, not a failure. Callers must not use isEmpty() to detect
// errors.
using DecryptedCookie = CookieImporter::DecryptionResult;

DecryptedCookie decryptChromiumCookieValue(const QByteArray &encrypted, const QByteArray &key,
                                           int metaVersion) {
    if (encrypted.size() < 4 || key.size() < 16) {
        return {};
    }
    const QByteArray prefix = encrypted.left(3);
    if (prefix != "v10" && prefix != "v11") {
        return {};
    }
    const QByteArray payload = encrypted.mid(3);
    if (payload.isEmpty() || payload.size() % 16 != 0) {
        return {};
    }

    std::unique_ptr<EVP_CIPHER_CTX, decltype(&EVP_CIPHER_CTX_free)> ctx(
        EVP_CIPHER_CTX_new(), &EVP_CIPHER_CTX_free);
    if (!ctx) {
        return {};
    }

    const unsigned char iv[16] = {
        0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20,
        0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20
    };

    if (EVP_DecryptInit_ex(ctx.get(), EVP_aes_128_cbc(), nullptr,
                           reinterpret_cast<const unsigned char *>(key.constData()), iv) != 1) {
        return {};
    }
    EVP_CIPHER_CTX_set_padding(ctx.get(), 0);

    QByteArray out(payload.size() + 16, Qt::Uninitialized);
    int outLen1 = 0;
    if (EVP_DecryptUpdate(ctx.get(),
                           reinterpret_cast<unsigned char *>(out.data()), &outLen1,
                           reinterpret_cast<const unsigned char *>(payload.constData()),
                           payload.size()) != 1) {
        return {};
    }

    int outLen2 = 0;
    if (EVP_DecryptFinal_ex(ctx.get(),
                            reinterpret_cast<unsigned char *>(out.data()) + outLen1, &outLen2) != 1) {
        return {};
    }
    out.resize(outLen1 + outLen2);

    if (out.isEmpty() || out.size() % 16 != 0) {
        return {};
    }
    const int pad = static_cast<unsigned char>(out.at(out.size() - 1));
    if (pad < 1 || pad > 16 || pad > out.size()) {
        return {};
    }
    out.chop(pad);
    if (metaVersion >= 24) {
        // Fewer than 32 bytes cannot contain the digest: this is a real
        // decrypt failure, not an empty value.
        if (out.size() < 32) {
            return {};
        }
        out = out.mid(32);
    }
    return {true, out};
}

// Chromium stores expiry as microseconds since 1601-01-01 UTC. A negative or
// zero value means "session cookie"; anything already in the past must not be
// re-imported as an active session cookie.
bool isCookieExpiredImpl(bool hasExpires, qint64 expiresUtc, const QDateTime &nowUtc) {
    if (!hasExpires) {
        return false;
    }
    if (expiresUtc <= 0) {
        return true;
    }
    constexpr qint64 kWindowsEpochOffsetMicros = 11644473600000000LL;
    const qint64 unixMicros = expiresUtc - kWindowsEpochOffsetMicros;
    const QDateTime expiration =
        QDateTime::fromSecsSinceEpoch(unixMicros / 1000000, QTimeZone::UTC);
    return expiration <= nowUtc;
}

// Reads the "Brave Safe Storage" secret from the freedesktop Secret Service.
//
// Notes from getting this working against gnome-keyring:
//   - SearchItems takes a{ss}, which Qt's QVariantMap marshals as a{sv} and the
//     service rejects; reading the collection's Items property avoids it.
//   - the Items reply arrives as a raw QDBusArgument array, not a QList.
//   - GetSecret returns (o session, ay parameters, ay value, s content_type),
//     and the byte array only demarshals via QDBusArgument extraction.
QByteArray fetchBrowserSecret(const QString &keyringMatch) {
    const QString kService = QStringLiteral("org.freedesktop.secrets");
    const QString kRoot = QStringLiteral("/org/freedesktop/secrets");
    const QString kSchema = QStringLiteral("chrome_libsecret_os_crypt_password_v2");
    QDBusConnection bus = QDBusConnection::sessionBus();
    if (!bus.isConnected()) {
        return {};
    }

    QDBusMessage openCall = QDBusMessage::createMethodCall(
        kService, kRoot, QStringLiteral("org.freedesktop.Secret.Service"),
        QStringLiteral("OpenSession"));
    openCall << QStringLiteral("plain") << QVariant::fromValue(QDBusVariant(QString()));
    const QDBusMessage openReply = bus.call(openCall);
    if (openReply.type() != QDBusMessage::ReplyMessage || openReply.arguments().size() < 2) {
        return {};
    }
    const QDBusObjectPath session = openReply.arguments().at(1).value<QDBusObjectPath>();

    // Every exit path must close the session: leaving it open leaks a
    // connection-side object and keeps the keyring prompt alive.
    struct SessionCloser {
        QDBusConnection bus;
        QDBusObjectPath path;
        ~SessionCloser() {
            if (path.path().isEmpty()) {
                return;
            }
            QDBusMessage closeCall = QDBusMessage::createMethodCall(
                QStringLiteral("org.freedesktop.secrets"), path.path(),
                QStringLiteral("org.freedesktop.Secret.Session"), QStringLiteral("Close"));
            bus.call(closeCall, QDBus::Block, 1000);
        }
    } sessionCloser{bus, session};

    // Enumerate the login collection's items and look for the browser key.
    QDBusMessage itemsCall = QDBusMessage::createMethodCall(
        kService, QStringLiteral("/org/freedesktop/secrets/collection/login"),
        QStringLiteral("org.freedesktop.DBus.Properties"), QStringLiteral("Get"));
    itemsCall << QStringLiteral("org.freedesktop.Secret.Collection") << QStringLiteral("Items");
    const QDBusMessage itemsReply = bus.call(itemsCall);
    if (itemsReply.type() != QDBusMessage::ReplyMessage || itemsReply.arguments().isEmpty()) {
        return {};
    }

    QList<QDBusObjectPath> items;
    const QDBusArgument arrayArg =
        itemsReply.arguments().at(0).value<QDBusVariant>().variant().value<QDBusArgument>();
    arrayArg.beginArray();
    while (!arrayArg.atEnd()) {
        QDBusObjectPath path;
        arrayArg >> path;
        items << path;
    }
    arrayArg.endArray();

    for (const QDBusObjectPath &itemPath : items) {
        // The schema attribute is authoritative: a label containing the
        // browser name can belong to an unrelated entry (e.g. an autofill
        // database key), and decrypting with the wrong secret fails opaquely.
        bool schemaMatches = false;
        bool applicationMatches = true;
        QDBusMessage attrsCall = QDBusMessage::createMethodCall(
            kService, itemPath.path(), QStringLiteral("org.freedesktop.DBus.Properties"),
            QStringLiteral("Get"));
        attrsCall << QStringLiteral("org.freedesktop.Secret.Item") << QStringLiteral("Attributes");
        const QDBusMessage attrsReply = bus.call(attrsCall);
        if (attrsReply.type() == QDBusMessage::ReplyMessage && !attrsReply.arguments().isEmpty()) {
            const QDBusArgument attrsArg =
                attrsReply.arguments().at(0).value<QDBusVariant>().variant().value<QDBusArgument>();
            QMap<QString, QString> attributes;
            if (attrsArg.currentType() == QDBusArgument::MapType) {
                attrsArg.beginMap();
                while (!attrsArg.atEnd()) {
                    QString key;
                    QString value;
                    attrsArg.beginMapEntry();
                    attrsArg >> key >> value;
                    attrsArg.endMapEntry();
                    attributes.insert(key, value);
                }
                attrsArg.endMap();
            }
            schemaMatches =
                attributes.value(QStringLiteral("xdg:schema")) == kSchema;
            if (attributes.contains(QStringLiteral("application"))) {
                // Keyring application ids vary by packaging ("brave" vs
                // "com.brave.Browser", "Microsoft Edge" vs "microsoft-edge"),
                // so compare on letters and digits only.
                applicationMatches =
                    normalizedToken(attributes.value(QStringLiteral("application")))
                        .contains(normalizedToken(keyringMatch));
            }
        }

        if (!schemaMatches) {
            // Fall back to the historical label heuristic, but still require
            // the "Safe Storage" wording Chromium-family browsers use.
            QDBusMessage labelCall = QDBusMessage::createMethodCall(
                kService, itemPath.path(), QStringLiteral("org.freedesktop.DBus.Properties"),
                QStringLiteral("Get"));
            labelCall << QStringLiteral("org.freedesktop.Secret.Item") << QStringLiteral("Label");
            const QDBusMessage labelReply = bus.call(labelCall);
            if (labelReply.type() != QDBusMessage::ReplyMessage
                || labelReply.arguments().isEmpty()) {
                continue;
            }
            const QString label =
                labelReply.arguments().at(0).value<QDBusVariant>().variant().toString();
            if (!label.contains(keyringMatch, Qt::CaseInsensitive)
                || !label.contains(QLatin1String("Safe Storage"), Qt::CaseInsensitive)) {
                continue;
            }
        } else if (!applicationMatches) {
            continue;
        }

        QDBusMessage secretCall = QDBusMessage::createMethodCall(
            kService, itemPath.path(), QStringLiteral("org.freedesktop.Secret.Item"),
            QStringLiteral("GetSecret"));
        secretCall << QVariant::fromValue(session);
        const QDBusMessage secretReply = bus.call(secretCall);
        if (secretReply.type() != QDBusMessage::ReplyMessage || secretReply.arguments().isEmpty()) {
            continue;
        }
        const QDBusArgument secretStruct = secretReply.arguments().at(0).value<QDBusArgument>();
        QDBusObjectPath unusedSession;
        QByteArray params;
        QByteArray value;
        QString contentType;
        secretStruct.beginStructure();
        secretStruct >> unusedSession;
        secretStruct >> params;
        secretStruct >> value;
        secretStruct >> contentType;
        secretStruct.endStructure();
        if (!value.isEmpty()) {
            return value;
        }
    }
    return {};
}

} // namespace

CookieImporter::DecryptionResult CookieImporter::decryptChromiumCookieChecked(
    const QByteArray &encrypted, const QByteArray &key, int metaVersion) {
    return decryptChromiumCookieValue(encrypted, key, metaVersion);
}

QByteArray CookieImporter::decryptChromiumCookie(const QByteArray &encrypted,
                                                 const QByteArray &key, int metaVersion) {
    return decryptChromiumCookieChecked(encrypted, key, metaVersion).value;
}

bool CookieImporter::isCookieExpired(bool hasExpires, qint64 expiresUtc,
                                     const QDateTime &nowUtc) {
    return isCookieExpiredImpl(hasExpires, expiresUtc, nowUtc);
}

CookieImporter::CookieImporter(QObject *parent) : QObject(parent) {}

bool CookieImporter::available() const {
    if (qEnvironmentVariableIsSet("ISLAND_NO_COOKIE_IMPORT")) {
        return false;
    }
    return !detectBrowserSource().configDir.isEmpty();
}

QString CookieImporter::sourceBrowserLabel() const {
    const BrowserSource source = detectBrowserSource();
    return source.label;
}

int CookieImporter::importInto(QObject *profileObject) {
    m_lastError.clear();
    m_googleSessionImported = false;
    if (qEnvironmentVariableIsSet("ISLAND_NO_COOKIE_IMPORT")) {
        m_lastError = QStringLiteral("Cookie import disabled by ISLAND_NO_COOKIE_IMPORT");
        return -1;
    }
    auto *profile = qobject_cast<QQuickWebEngineProfile *>(profileObject);
    if (!profile) {
        m_lastError = QStringLiteral("Not a WebEngineProfile");
        return -1;
    }

    const BrowserSource source = detectBrowserSource();
    if (source.configDir.isEmpty()) {
        m_lastError = QStringLiteral("No supported browser profile found");
        return -1;
    }

    const QString dbPath = findCookieDatabase(source.configDir);
    if (dbPath.isEmpty()) {
        m_lastError = QStringLiteral("No supported browser profile found");
        return -1;
    }

    // Copy first: the live database is never opened, and never written to.
    QTemporaryDir tmp;
    if (!tmp.isValid()) {
        m_lastError = QStringLiteral("Could not create a temporary directory");
        return -1;
    }
    const QString copyPath = tmp.filePath(QStringLiteral("Cookies"));
    if (!QFile::copy(dbPath, copyPath)) {
        m_lastError = QStringLiteral("Could not read the %1 cookie database").arg(source.label);
        return -1;
    }

    const QByteArray secret = fetchBrowserSecret(source.keyringMatch);
    if (secret.isEmpty()) {
        m_lastError = QStringLiteral(
            "Could not read the %1 Safe Storage key from the keyring. "
            "Unlock the keyring and try again.").arg(source.keyringMatch);
        return -1;
    }
    const QByteArray key = deriveKey(secret);

    const QString connectionName = QStringLiteral("island_cookie_import");
    {
        QSqlDatabase db = QSqlDatabase::addDatabase(QStringLiteral("QSQLITE"), connectionName);
        db.setDatabaseName(copyPath);
        db.setConnectOptions(QStringLiteral("QSQLITE_OPEN_READONLY"));
        if (!db.open()) {
            m_lastError = db.lastError().text();
            db = QSqlDatabase();
            QSqlDatabase::removeDatabase(connectionName);
            return -1;
        }

        QWebEngineCookieStore *store = profile->cookieStore();
        if (!store) {
            m_lastError = QStringLiteral("Profile has no cookie store");
            db.close();
            db = QSqlDatabase();
            QSqlDatabase::removeDatabase(connectionName);
            return -1;
        }

        // Scoped import: only Google/YouTube cookies are read at all, so the
        // decryption loop never touches unrelated credentials and the whole
        // browser DB is not decrypted on the UI thread. The host filter also
        // runs in SQL so expired/foreign rows are never materialised.
        //
        // The query lives in its own scope: Qt requires every QSqlQuery to be
        // destroyed before its connection is removed, otherwise the driver
        // logs "connection is still in use" and leaks.
        int imported = 0;
        QString schemaError;
        {
            QSqlQuery query(db);
            if (!query.exec(QStringLiteral(
                    "SELECT host_key, name, encrypted_value, path, expires_utc, is_secure, is_httponly, "
                    "samesite, source_scheme, has_expires FROM cookies "
                    "WHERE host_key = 'google.com' OR host_key LIKE '%.google.com' "
                    "OR host_key = 'youtube.com' OR host_key LIKE '%.youtube.com' "
                    "OR host_key = 'accounts.google.com' OR host_key = 'accounts.youtube.com'"))) {
                schemaError = QStringLiteral("Unsupported cookie database schema");
            } else {
                // Chromium schema >= 24 prepends a 32-byte domain digest to
                // every decrypted value. Older databases have no prefix, so
                // the version decides whether stripping is correct.
                int metaVersion = 0;
                {
                    QSqlQuery metaQuery(db);
                    if (metaQuery.exec(
                            QStringLiteral("SELECT value FROM meta WHERE key = 'version'"))
                        && metaQuery.next()) {
                        metaVersion = metaQuery.value(0).toInt();
                    }
                }

                const QDateTime nowUtc = QDateTime::currentDateTimeUtc();
                while (query.next()) {
                    const QString host = query.value(0).toString();
                    const QString name = query.value(1).toString();
                    const DecryptedCookie decrypted =
                        decryptChromiumCookieValue(query.value(2).toByteArray(), key, metaVersion);
                    if (!decrypted.ok) {
                        continue;
                    }
                    const QByteArray &value = decrypted.value;

                    // Chromium's expiry column is microseconds since 1601-01-01
                    // UTC. Expired cookies must be dropped outright: importing
                    // them as session cookies resurrects credentials the
                    // browser already discarded.
                    const int hasExpires = query.value(9).toInt();
                    const qint64 expiresUtc = query.value(4).toLongLong();
                    if (isCookieExpiredImpl(hasExpires == 1, expiresUtc, nowUtc)) {
                        continue;
                    }

                    // Chromium stores domain cookies with a leading dot; the
                    // origin URL used to set them must NOT have one, or QUrl is
                    // invalid and the cookie is silently dropped.
                    const QString bareHost =
                        host.startsWith(QLatin1Char('.')) ? host.mid(1) : host;

                    QNetworkCookie cookie(name.toUtf8(), value);
                    if (name.startsWith(QLatin1String("__Host-"))) {
                        cookie.setDomain(QString());
                        cookie.setSecure(true);
                    } else {
                        cookie.setDomain(host);
                        cookie.setSecure(query.value(5).toBool());
                    }

                    QString path = query.value(3).toString();
                    if (path.isEmpty()) {
                        path = QStringLiteral("/");
                    }
                    cookie.setPath(path);
                    cookie.setHttpOnly(query.value(6).toBool());

                    const int sameSiteVal = query.value(7).toInt();
                    if (sameSiteVal == 0) {
                        cookie.setSameSitePolicy(QNetworkCookie::SameSite::None);
                    } else if (sameSiteVal == 1) {
                        cookie.setSameSitePolicy(QNetworkCookie::SameSite::Lax);
                    } else if (sameSiteVal == 2) {
                        cookie.setSameSitePolicy(QNetworkCookie::SameSite::Strict);
                    }

                    if (hasExpires == 1) {
                        const qint64 unixMicros = expiresUtc - 11644473600000000LL;
                        cookie.setExpirationDate(
                            QDateTime::fromSecsSinceEpoch(unixMicros / 1000000, QTimeZone::UTC));
                    }

                    const int sourceSchemeVal = query.value(8).toInt();
                    const QString scheme = (sourceSchemeVal == 1) ? QStringLiteral("http://")
                                                                 : QStringLiteral("https://");
                    store->setCookie(cookie, QUrl(scheme + bareHost));
                    ++imported;

                    // Only Google's own auth cookies prove a usable signed-in
                    // session. Unrelated cookies must not suppress the handoff.
                    if (host.endsWith(QLatin1String(".google.com"), Qt::CaseInsensitive)
                        || host.compare(QLatin1String("google.com"), Qt::CaseInsensitive) == 0) {
                        static const QStringList authCookies = {
                            QStringLiteral("SID"),
                            QStringLiteral("HSID"),
                            QStringLiteral("SSID"),
                            QStringLiteral("__Secure-1PSID"),
                            QStringLiteral("__Secure-3PSID"),
                        };
                        if (authCookies.contains(name)) {
                            m_googleSessionImported = true;
                        }
                    }
                }
            }
        }

        db.close();
        db = QSqlDatabase();
        QSqlDatabase::removeDatabase(connectionName);

        if (!schemaError.isEmpty()) {
            m_lastError = schemaError;
            return -1;
        }

        // Zero is a valid result: the user may simply not be signed in to
        // Google. Only a genuine read failure is an error.
        return imported;
    }
}
