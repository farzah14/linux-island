#include <QtTest>
#include "search_provider.h"

class TestSearchProvider : public QObject {
    Q_OBJECT

private slots:
    void testEnginePrefixes();
    void testReservedCharactersEncoded();
    void testQueryTrimmed();
    void testEmptyQueryRejected();
    void testQueryLengthBoundary();
    void testUnknownEngineFallsBackToGoogle();
    void testValidNavigationScheme();
    void testOpenEmbedded();
    void testOpenExternal();
    void testRequiresSystemBrowser();
};

void TestSearchProvider::testEnginePrefixes() {
    const QVector<QPair<QString, QString>> engines = {
        {QStringLiteral("google"), QStringLiteral("https://www.google.com/search?q=")},
        {QStringLiteral("duckduckgo"), QStringLiteral("https://duckduckgo.com/?q=")},
        {QStringLiteral("brave"), QStringLiteral("https://search.brave.com/search?q=")},
        {QStringLiteral("bing"), QStringLiteral("https://www.bing.com/search?q=")},
    };
    for (const auto &engine : engines) {
        QCOMPARE(SearchProvider::buildUrl(engine.first, QStringLiteral("linux island")),
                 engine.second + QStringLiteral("linux%20island"));
    }
}

void TestSearchProvider::testReservedCharactersEncoded() {
    QCOMPARE(SearchProvider::buildUrl(QStringLiteral("google"), QStringLiteral("a&b#c?d")),
             QStringLiteral("https://www.google.com/search?q=a%26b%23c%3Fd"));
}

void TestSearchProvider::testQueryTrimmed() {
    QCOMPARE(SearchProvider::buildUrl(QStringLiteral("google"), QStringLiteral("  cats  ")),
             QStringLiteral("https://www.google.com/search?q=cats"));
}

void TestSearchProvider::testEmptyQueryRejected() {
    QCOMPARE(SearchProvider::buildUrl(QStringLiteral("google"), QStringLiteral("   ")), QString());
    QCOMPARE(SearchProvider::buildUrl(QStringLiteral("google"), QString()), QString());
}

void TestSearchProvider::testQueryLengthBoundary() {
    const QString maxQuery(500, QLatin1Char('a'));
    QVERIFY(!SearchProvider::buildUrl(QStringLiteral("google"), maxQuery).isEmpty());

    const QString tooLongQuery(501, QLatin1Char('a'));
    QCOMPARE(SearchProvider::buildUrl(QStringLiteral("google"), tooLongQuery), QString());
}

void TestSearchProvider::testUnknownEngineFallsBackToGoogle() {
    QCOMPARE(SearchProvider::buildUrl(QStringLiteral("yandex"), QStringLiteral("linux island")),
             QStringLiteral("https://www.google.com/search?q=linux%20island"));
}

void TestSearchProvider::testValidNavigationScheme() {
    QVERIFY(SearchProvider::isValidNavigationUrl(QStringLiteral("https://www.google.com")));
    QVERIFY(SearchProvider::isValidNavigationUrl(QStringLiteral("http://example.org/path?q=1")));
    QVERIFY(SearchProvider::isValidNavigationUrl(QStringLiteral("HTTPS://SEARCH.BRAVE.COM/")));

    // Disallowed schemes
    QVERIFY(!SearchProvider::isValidNavigationUrl(QStringLiteral("javascript:alert(1)")));
    QVERIFY(!SearchProvider::isValidNavigationUrl(QStringLiteral("file:///etc/passwd")));
    QVERIFY(!SearchProvider::isValidNavigationUrl(QStringLiteral("data:text/html,<h1>hi</h1>")));
    QVERIFY(!SearchProvider::isValidNavigationUrl(QStringLiteral("ftp://ftp.example.com")));
    QVERIFY(!SearchProvider::isValidNavigationUrl(QStringLiteral("about:blank")));
    QVERIFY(!SearchProvider::isValidNavigationUrl(QStringLiteral("chrome://settings")));
    QVERIFY(!SearchProvider::isValidNavigationUrl(QStringLiteral("")));
    QVERIFY(!SearchProvider::isValidNavigationUrl(QStringLiteral("   ")));
    QVERIFY(!SearchProvider::isValidNavigationUrl(QStringLiteral("not a valid url")));
}

void TestSearchProvider::testOpenEmbedded() {
    SearchProvider provider;
    QSignalSpy spy(&provider, &SearchProvider::openEmbeddedRequested);

    QVERIFY(provider.openEmbedded(QStringLiteral("google"), QStringLiteral("linux island")));
    QCOMPARE(spy.count(), 1);
    QCOMPARE(spy.at(0).at(0).toString(), QStringLiteral("https://www.google.com/search?q=linux%20island"));

    // Empty/invalid query returns false and does not emit
    QVERIFY(!provider.openEmbedded(QStringLiteral("google"), QStringLiteral("   ")));
    QCOMPARE(spy.count(), 1);
}

void TestSearchProvider::testOpenExternal() {
    SearchProvider provider;

    // Only real web pages are handed to the desktop browser.
    QVERIFY(!provider.openExternal(QString()));
    QVERIFY(!provider.openExternal(QStringLiteral("file:///etc/passwd")));
    QVERIFY(!provider.openExternal(QStringLiteral("javascript:alert(1)")));
    QVERIFY(!provider.openExternal(QStringLiteral("not a url")));
}

void TestSearchProvider::testRequiresSystemBrowser() {
    SearchProvider provider;

    // Google blocks OAuth from embedded browsers, so these are handed off.
    QVERIFY(provider.requiresSystemBrowser(
        QStringLiteral("https://accounts.google.com/v3/signin/identifier?flowName=GlifWebSignIn")));
    QVERIFY(provider.requiresSystemBrowser(QStringLiteral("https://accounts.google.com/")));
    QVERIFY(provider.requiresSystemBrowser(QStringLiteral("https://ACCOUNTS.GOOGLE.COM/signin")));
    QVERIFY(provider.requiresSystemBrowser(QStringLiteral("https://myaccount.google.com/")));
    QVERIFY(provider.requiresSystemBrowser(QStringLiteral("https://accounts.youtube.com/")));

    // Interactive sign-in is blocked even with an imported Google session:
    // the OAuth flow itself is what Google refuses to serve to embedded
    // browsers, not just the absence of cookies.
    QVERIFY(provider.requiresSystemBrowser(QStringLiteral("https://accounts.google.com/ServiceLogin"), true));
    QVERIFY(provider.requiresSystemBrowser(QStringLiteral("https://accounts.youtube.com/"), true));

    // Passive account pages stay in-app once a Google session is imported.
    QVERIFY(provider.requiresSystemBrowser(QStringLiteral("https://myaccount.google.com/"), false));
    QVERIFY(!provider.requiresSystemBrowser(QStringLiteral("https://myaccount.google.com/"), true));
    QVERIFY(!provider.requiresSystemBrowser(QStringLiteral("https://myaccount.google.com/personal-info"), true));

    // Ordinary pages stay inside the companion.
    QVERIFY(!provider.requiresSystemBrowser(QStringLiteral("https://www.google.com/search?q=yt")));
    QVERIFY(!provider.requiresSystemBrowser(QStringLiteral("https://www.google.com/search?q=yt"), true));
    QVERIFY(!provider.requiresSystemBrowser(QStringLiteral("https://youtube.com/")));
    QVERIFY(!provider.requiresSystemBrowser(QStringLiteral("https://github.com/login")));
    QVERIFY(!provider.requiresSystemBrowser(QStringLiteral("https://search.brave.com/search?q=x")));

    // Lookalike hosts must not be treated as Google sign-in.
    QVERIFY(!provider.requiresSystemBrowser(QStringLiteral("https://accounts.google.com.evil.test/")));
    QVERIFY(!provider.requiresSystemBrowser(QStringLiteral("https://evil.test/accounts.google.com")));

    // Malformed input is simply not a handoff.
    QVERIFY(!provider.requiresSystemBrowser(QString()));
    QVERIFY(!provider.requiresSystemBrowser(QStringLiteral("not a url")));
    QVERIFY(!provider.requiresSystemBrowser(QString(), true));

    // Subframe navigations never hand off, even to a sign-in host. Google's
    // result pages embed accounts.google.com iframes (RotateCookiesPage, GSI);
    // handing those off opened the system browser on every single search.
    QVERIFY(!provider.requiresSystemBrowser(
        QStringLiteral("https://accounts.google.com/RotateCookiesPage?og_pid=1&rot=3"), false, false));
    QVERIFY(!provider.requiresSystemBrowser(
        QStringLiteral("https://accounts.google.com/gsi/iframe/select"), true, false));
    QVERIFY(!provider.requiresSystemBrowser(QStringLiteral("https://accounts.youtube.com/"), true, false));

    // The same URL as a top-level navigation still hands off.
    QVERIFY(provider.requiresSystemBrowser(
        QStringLiteral("https://accounts.google.com/RotateCookiesPage?og_pid=1&rot=3"), false, true));
}

QTEST_MAIN(TestSearchProvider)
#include "tst_search_provider.moc"
