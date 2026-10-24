#include <QCoreApplication>

int main(int argc, char** argv) {
    QCoreApplication app(argc, argv);
    app.setApplicationName(QStringLiteral("Linux Island Core"));
    return app.exec();
}
