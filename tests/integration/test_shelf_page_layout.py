"""Verify File Shelf parity across QML, GNOME Shell UI, and C++ smoke test."""

from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[2]


def main() -> int:
    shelf_qml = (ROOT / 'island-ui/qml/ShelfPage.qml').read_text()
    window_qml = (ROOT / 'island-ui/qml/IslandWindow.qml').read_text()
    shelf_view = (ROOT / 'extension/ui/shelfView.js').read_text()
    main_cpp = (ROOT / 'island-ui/main.cpp').read_text()

    if 'objectName: "shelfPage"' not in shelf_qml:
        print('FAIL: ShelfPage.qml missing objectName: "shelfPage"', file=sys.stderr)
        return 1
    if 'readonly property int contentHeight: 116' not in shelf_qml:
        print('FAIL: ShelfPage.qml contentHeight must be 116', file=sys.stderr)
        return 1
    if 'ShelfPage { id: shelfPage }' not in window_qml:
        print('FAIL: IslandWindow.qml missing ShelfPage in SwipeView', file=sys.stderr)
        return 1
    if 'carouselView.currentIndex === 4' not in window_qml:
        print('FAIL: IslandWindow.qml missing Page 4 height/tab handling', file=sys.stderr)
        return 1
    if 'DropArea {' not in window_qml:
        print('FAIL: IslandWindow.qml missing DropArea', file=sys.stderr)
        return 1
    if 'class ShelfSection' not in shelf_view:
        print('FAIL: extension/ui/shelfView.js missing ShelfSection', file=sys.stderr)
        return 1
    if 'findChild<QObject *>(QStringLiteral("shelfPage"))' not in main_cpp:
        print('FAIL: island-ui/main.cpp smoke test missing shelfPage check', file=sys.stderr)
        return 1

    print('PASS: shelf page parity layout contract verified')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
