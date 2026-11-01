cmake_minimum_required(VERSION 3.22)
project(LinuxIsland VERSION 0.1.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

include(GNUInstallDirs)
include(CTest)

find_package(Qt6 6.4 REQUIRED COMPONENTS
    Core DBus Network Quick Qml Sql WebEngineQuick WebEngineCore)
find_package(OpenSSL REQUIRED)
find_package(Python3 REQUIRED COMPONENTS Interpreter)

if(BUILD_TESTING)
    find_package(Qt6 REQUIRED COMPONENTS Test)
    add_subdirectory(tests/unit)
    add_subdirectory(tests/integration)
endif()

add_subdirectory(core)
add_subdirectory(settings-app)
add_subdirectory(island-ui)

# --- Runtime files ---------------------------------------------------------

install(PROGRAMS packaging/bin/linux-island-launch
        DESTINATION ${CMAKE_INSTALL_BINDIR})

install(FILES
            packaging/desktop/linux-island.desktop
            packaging/desktop/linux-island-settings.desktop
        DESTINATION ${CMAKE_INSTALL_DATADIR}/applications)

install(FILES packaging/metainfo/io.github.linuxisland.metainfo.xml
        DESTINATION ${CMAKE_INSTALL_DATADIR}/metainfo)

install(FILES packaging/icons/io.github.linuxisland.svg
        DESTINATION ${CMAKE_INSTALL_DATADIR}/icons/hicolor/scalable/apps)

install(FILES schemas/io.github.linuxisland.Core1.xml
        DESTINATION ${CMAKE_INSTALL_DATADIR}/dbus-1/interfaces)

install(FILES LICENSE
        DESTINATION ${CMAKE_INSTALL_DATADIR}/licenses/linux-island)

install(FILES packaging/autostart/linux-island.desktop
        DESTINATION ${CMAKE_INSTALL_DATADIR}/linux-island
        RENAME linux-island-autostart.desktop)

install(DIRECTORY packaging/window-rules/
        DESTINATION ${CMAKE_INSTALL_DATADIR}/linux-island/window-rules)

install(DIRECTORY extension/
        DESTINATION ${CMAKE_INSTALL_DATADIR}/gnome-shell/extensions/linux-island@local)

# The systemd unit needs the install prefix at install time, not configure time:
# `cmake --install --prefix` and DESTDIR staging must both produce a unit whose
# ExecStart points at the real runtime path. Escaped ${CMAKE_INSTALL_PREFIX} is
# evaluated by the install script, and file(INSTALL) applies DESTDIR itself.
install(CODE "
    set(ISLAND_LIBEXECDIR \"\${CMAKE_INSTALL_PREFIX}/${CMAKE_INSTALL_LIBEXECDIR}\")
    configure_file(
        \"${CMAKE_SOURCE_DIR}/packaging/systemd-user/linux-island-core.service.in\"
        \"${CMAKE_BINARY_DIR}/linux-island-core.service\"
        @ONLY)
    # file(INSTALL) applies DESTDIR itself; do not add it to the destinations.
    file(INSTALL
        DESTINATION \"\${CMAKE_INSTALL_PREFIX}/lib/systemd/user\"
        TYPE FILE
        FILES \"${CMAKE_BINARY_DIR}/linux-island-core.service\")
    file(INSTALL
        DESTINATION \"\${CMAKE_INSTALL_PREFIX}/${CMAKE_INSTALL_DATADIR}/linux-island\"
        TYPE FILE
        FILES \"${CMAKE_BINARY_DIR}/linux-island-core.service\")
")

# --- CPack -----------------------------------------------------------------

set(CPACK_PACKAGE_NAME "linux-island")
set(CPACK_PACKAGE_VENDOR "Linux Island contributors")
set(CPACK_PACKAGE_CONTACT "farzahwalker46@gmail.com")
set(CPACK_PACKAGE_DESCRIPTION_SUMMARY "Dynamic Island-style status capsule for Linux desktops")
set(CPACK_RESOURCE_FILE_LICENSE "${CMAKE_SOURCE_DIR}/LICENSE")
set(CPACK_GENERATOR "TGZ;DEB;RPM")
set(CPACK_PACKAGING_INSTALL_PREFIX "/usr")
set(CPACK_PACKAGE_FILE_NAME "linux-island-${PROJECT_VERSION}-${CMAKE_SYSTEM_PROCESSOR}")
set(CPACK_DEBIAN_FILE_NAME DEB-DEFAULT)
set(CPACK_DEBIAN_PACKAGE_MAINTAINER "farzahwalker46@gmail.com")
set(CPACK_DEBIAN_PACKAGE_SECTION utils)
set(CPACK_DEBIAN_PACKAGE_SHLIBDEPS ON)
set(CPACK_DEBIAN_PACKAGE_DEPENDS "qml6-module-qtquick, qml6-module-qtquick-window, qml6-module-qtquick-layouts, qml6-module-qtquick-controls, qml6-module-qtquick-templates, qml6-module-qtqml-workerscript, qml6-module-qtwebengine, qml6-module-qtwebchannel, qml6-module-qtwebengine-controlsdelegates, libqt6sql6-sqlite")
set(CPACK_DEBIAN_PACKAGE_RECOMMENDS "gnome-shell (>= 45), pipewire, wireplumber, libxcb-cursor0, x11-utils")
set(CPACK_RPM_PACKAGE_LICENSE MIT)
set(CPACK_RPM_PACKAGE_REQUIRES "qt6-qtbase, qt6-qtbase-gui, qt6-qtdeclarative, qt6-qtwebengine, qt6-qtwebchannel, qt6-qtpositioning, openssl-libs, xorg-x11-utils")

include(CPack)
