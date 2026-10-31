#pragma once

#include <QByteArray>
#include <QDateTime>
#include <QObject>
#include <QString>
#include <QStringList>

// Imports the user's existing browser session (Brave/Chrome) into the Island's
// own WebEngine profile.
//
// Why this exists: Google refuses OAuth sign-in from any embedded browser
// ("This browser or app may not be secure"), and no User-Agent or client-hint
// spoofing defeats it. The only way to be signed in *inside* the Island is to
// reuse a session the user already established in a real browser.
//
// Safety boundaries, deliberately narrow:
//   - read-only: the browser's cookie database is copied and never written to;
//   - scoped: only Google/YouTube cookies are imported, not the whole profile;
//   - one-way: cookies flow browser -> Island, never back;
//   - opt-out: setting ISLAND_NO_COOKIE_IMPORT=1 disables it entirely.
class CookieImporter : public QObject {
    Q_OBJECT

public:
    explicit CookieImporter(QObject *parent = nullptr);

    // Imports Google/YouTube cookies into the given WebEngineProfile. Returns
    // the number of cookies accepted (0 when the user is not signed in), or
    // -1 on failure (reason available via lastError()).
    Q_INVOKABLE int importInto(QObject *profile);

    Q_INVOKABLE QString lastError() const { return m_lastError; }
    Q_INVOKABLE bool available() const;
    Q_INVOKABLE QString sourceBrowserLabel() const;

    // True only when a valid, non-expired Google auth cookie was imported.
    // Importing unrelated cookies must not count as a signed-in session.
    Q_INVOKABLE bool googleSessionImported() const { return m_googleSessionImported; }

    // Result of a cookie decrypt. ok is false only when the ciphertext could
    // not be decrypted; value may legitimately be empty (a v24+ cookie with an
    // empty value decrypts to exactly the 32-byte digest).
    struct DecryptionResult {
        bool ok = false;
        QByteArray value;
    };

    // Exposed for unit tests. Strips the 32-byte SHA-256 domain digest that
    // Chromium prepends from schema version 24 onwards, and reports whether
    // decryption actually succeeded.
    static DecryptionResult decryptChromiumCookieChecked(const QByteArray &encrypted,
                                                         const QByteArray &key, int metaVersion);

    // Exposed for unit tests. Value-only convenience wrapper; "" is ambiguous
    // between an empty cookie and a failed decrypt.
    static QByteArray decryptChromiumCookie(const QByteArray &encrypted, const QByteArray &key,
                                            int metaVersion);

    // Exposed for unit tests. Chromium timestamps are microseconds since
    // 1601-01-01 UTC; hasExpires == 0 means a session cookie.
    static bool isCookieExpired(bool hasExpires, qint64 expiresUtc, const QDateTime &nowUtc);

private:
    QString m_lastError;
    bool m_googleSessionImported = false;
};
