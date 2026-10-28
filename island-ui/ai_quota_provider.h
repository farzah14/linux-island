#pragma once

#include <QObject>
#include <QVariantMap>
#include <QString>
#include <QProcess>

class AiQuotaProvider : public QObject {
    Q_OBJECT
    Q_PROPERTY(QVariantMap antigravity READ antigravity NOTIFY quotaChanged)
    Q_PROPERTY(QVariantMap codex READ codex NOTIFY quotaChanged)
    Q_PROPERTY(QVariantMap claude READ claude NOTIFY quotaChanged)
    Q_PROPERTY(bool refreshing READ refreshing NOTIFY refreshingChanged)

public:
    explicit AiQuotaProvider(QObject *parent = nullptr);
    ~AiQuotaProvider() override;

    QVariantMap antigravity() const { return m_antigravity; }
    QVariantMap codex() const { return m_codex; }
    QVariantMap claude() const { return m_claude; }
    bool refreshing() const { return m_refreshing; }

    static QVariantMap buildSnapshotFromRawJson(const QByteArray &rawJson, qint64 nowMs);
    static QString formatResetCountdown(qint64 resetsAtMs, qint64 nowMs);

    Q_INVOKABLE void refresh();

signals:
    void quotaChanged();
    void refreshingChanged();

private:
    void onProcessFinished(int exitCode, QProcess::ExitStatus exitStatus);

    QProcess *m_process = nullptr;
    bool m_refreshing = false;
    QVariantMap m_antigravity;
    QVariantMap m_codex;
    QVariantMap m_claude;
};
