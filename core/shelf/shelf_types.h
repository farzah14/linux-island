#pragma once

#include <QString>
#include <QList>
#include <QtGlobal>

struct ShelfItem {
    QString id;
    QString uri;
    QString path;
    QString name;
    qint64 sizeBytes = 0;
    QString sizeText;
    QString mimeType;
    QString iconName;
    bool isDir = false;
    qint64 addedAtMs = 0;
};

struct ShelfSnapshot {
    int maxItems = 12;
    QList<ShelfItem> items;
};
