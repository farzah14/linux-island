#pragma once

#include <QObject>
#include <QString>

class SearchProvider : public QObject {
    Q_OBJECT

public:
    explicit SearchProvider(QObject *parent = nullptr);

    static QString buildUrl(const QString &engine, const QString &query);
    Q_INVOKABLE bool open(const QString &engine, const QString &query);
    static bool isValidNavigationUrl(const QString &url);
    Q_INVOKABLE bool isValidUrl(const QString &url) const;
    Q_INVOKABLE bool openEmbedded(const QString &engine, const QString &query);
    // Hand the current page to the user's real browser, where existing
    // account sessions already live.
    Q_INVOKABLE bool openExternal(const QString &url);
    // True for hosts that refuse OAuth sign-in from an embedded browser
    // (Google's anti-phishing policy), so the companion can hand them off
    // to the user's real browser instead of showing a dead end.
    //
    // Interactive sign-in hosts always require a handoff. Passive account
    // pages only do when no imported Google session is available.
    Q_INVOKABLE bool requiresSystemBrowser(const QString &url,
                                           bool hasGoogleSession = false) const;

signals:
    void openEmbeddedRequested(const QString &url);
};
