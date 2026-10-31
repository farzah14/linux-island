#include <QtTest>
#include <QDateTime>
#include <QTimeZone>
#include <memory>
#include <openssl/evp.h>
#include "cookie_importer.h"

namespace {

// Mirrors Chromium's Linux encryption: AES-128-CBC with a 16-space IV and
// PKCS#7 padding, prefixed with "v10". The key is fixed so the expectations
// below are deterministic.
const QByteArray kKey = QByteArrayLiteral("0123456789abcdef");

QByteArray encryptCookie(const QByteArray &plain) {
    std::unique_ptr<EVP_CIPHER_CTX, decltype(&EVP_CIPHER_CTX_free)> ctx(
        EVP_CIPHER_CTX_new(), &EVP_CIPHER_CTX_free);
    if (!ctx) {
        return {};
    }
    const unsigned char iv[16] = {
        0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20,
        0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20
    };
    if (EVP_EncryptInit_ex(ctx.get(), EVP_aes_128_cbc(), nullptr,
                           reinterpret_cast<const unsigned char *>(kKey.constData()), iv) != 1) {
        return {};
    }
    QByteArray out(plain.size() + 32, Qt::Uninitialized);
    int outLen1 = 0;
    if (EVP_EncryptUpdate(ctx.get(), reinterpret_cast<unsigned char *>(out.data()), &outLen1,
                          reinterpret_cast<const unsigned char *>(plain.constData()),
                          plain.size()) != 1) {
        return {};
    }
    int outLen2 = 0;
    if (EVP_EncryptFinal_ex(ctx.get(), reinterpret_cast<unsigned char *>(out.data()) + outLen1,
                            &outLen2) != 1) {
        return {};
    }
    out.resize(outLen1 + outLen2);
    return QByteArrayLiteral("v10") + out;
}

// Chromium's expiry epoch is 1601-01-01 UTC, in microseconds.
qint64 toChromiumMicros(const QDateTime &utc) {
    constexpr qint64 kWindowsEpochOffsetMicros = 11644473600000000LL;
    return utc.toSecsSinceEpoch() * 1000000LL + kWindowsEpochOffsetMicros;
}

QByteArray digestPrefix() {
    return QByteArray(32, '\x7f');
}

} // namespace

class TestCookieImporter : public QObject {
    Q_OBJECT

private slots:
    void testV24EmptyValueStripsDigest();
    void testV24TenByteValueStripsDigest();
    void testPreV24KeepsFullValue();
    void testV24ShortPlaintextRejected();
    void testMalformedCiphertextRejected();
    void testEmptyValueIsNotEmptyFailure();
    void testExpiredCookieRejected();
    void testFutureCookieAccepted();
    void testSessionCookieAccepted();
    void testZeroExpiryRejected();
};

void TestCookieImporter::testV24EmptyValueStripsDigest() {
    const QByteArray encrypted = encryptCookie(digestPrefix());
    QVERIFY(!encrypted.isEmpty());
    // A cookie with an empty value stores only the digest: the result must be
    // empty, not 32 bytes of raw hash rendered as the cookie value.
    QCOMPARE(CookieImporter::decryptChromiumCookie(encrypted, kKey, 24), QByteArray(""));
}

void TestCookieImporter::testV24TenByteValueStripsDigest() {
    const QByteArray plain = digestPrefix() + QByteArrayLiteral("0123456789");
    const QByteArray encrypted = encryptCookie(plain);
    QVERIFY(!encrypted.isEmpty());
    QCOMPARE(CookieImporter::decryptChromiumCookie(encrypted, kKey, 24),
             QByteArrayLiteral("0123456789"));
}

void TestCookieImporter::testPreV24KeepsFullValue() {
    // Schema 20 has no digest prefix, so all 40 bytes are the cookie value.
    // Stripping 32 bytes here would silently truncate real session tokens.
    const QByteArray plain(40, 'a');
    const QByteArray encrypted = encryptCookie(plain);
    QVERIFY(!encrypted.isEmpty());
    QCOMPARE(CookieImporter::decryptChromiumCookie(encrypted, kKey, 20), plain);
}

void TestCookieImporter::testV24ShortPlaintextRejected() {
    // Fewer than 32 bytes cannot contain the digest: treat as undecryptable
    // rather than returning garbage.
    const QByteArray encrypted = encryptCookie(QByteArrayLiteral("short"));
    QVERIFY(!encrypted.isEmpty());
    QVERIFY(CookieImporter::decryptChromiumCookie(encrypted, kKey, 24).isEmpty());
}

void TestCookieImporter::testMalformedCiphertextRejected() {
    QVERIFY(CookieImporter::decryptChromiumCookie(QByteArray(), kKey, 24).isEmpty());
    QVERIFY(CookieImporter::decryptChromiumCookie(QByteArrayLiteral("v10"), kKey, 24).isEmpty());
    QVERIFY(CookieImporter::decryptChromiumCookie(QByteArrayLiteral("v10short"), kKey, 24).isEmpty());
    // Unknown prefix (macOS/Linux OSCrypt variants are not v10/v11).
    QVERIFY(CookieImporter::decryptChromiumCookie(
                QByteArrayLiteral("v12") + QByteArray(16, 'x'), kKey, 24).isEmpty());
}

void TestCookieImporter::testEmptyValueIsNotEmptyFailure() {
    // The two cases both produce an empty value, so importInto must branch on
    // ok: an empty cookie is real and must reach the cookie store, while a
    // failed decrypt must be skipped.
    const QByteArray emptyCookie = encryptCookie(digestPrefix());
    QVERIFY(!emptyCookie.isEmpty());

    const auto ok = CookieImporter::decryptChromiumCookieChecked(emptyCookie, kKey, 24);
    QVERIFY2(ok.ok, "a v24 cookie with an empty value is a successful decrypt");
    QCOMPARE(ok.value, QByteArray(""));

    const auto failed = CookieImporter::decryptChromiumCookieChecked(
        QByteArrayLiteral("v12") + QByteArray(16, 'x'), kKey, 24);
    QVERIFY2(!failed.ok, "an undecryptable payload must not be treated as an empty cookie");
}

void TestCookieImporter::testExpiredCookieRejected() {
    const QDateTime now = QDateTime::currentDateTimeUtc();
    const qint64 past = toChromiumMicros(now.addDays(-1));
    QVERIFY(CookieImporter::isCookieExpired(true, past, now));
}

void TestCookieImporter::testFutureCookieAccepted() {
    const QDateTime now = QDateTime::currentDateTimeUtc();
    const qint64 future = toChromiumMicros(now.addDays(30));
    QVERIFY(!CookieImporter::isCookieExpired(true, future, now));
}

void TestCookieImporter::testSessionCookieAccepted() {
    // has_expires == 0 means a session cookie: it never expires on its own.
    QVERIFY(!CookieImporter::isCookieExpired(false, 0, QDateTime::currentDateTimeUtc()));
    QVERIFY(!CookieImporter::isCookieExpired(false, 13300000000000000LL,
                                             QDateTime::currentDateTimeUtc()));
}

void TestCookieImporter::testZeroExpiryRejected() {
    // A cookie flagged as persistent but with no usable timestamp is bogus;
    // importing it would resurrect a session the browser already dropped.
    const QDateTime now = QDateTime::currentDateTimeUtc();
    QVERIFY(CookieImporter::isCookieExpired(true, 0, now));
    QVERIFY(CookieImporter::isCookieExpired(true, -1, now));
}

QTEST_GUILESS_MAIN(TestCookieImporter)
#include "tst_cookie_importer.moc"
