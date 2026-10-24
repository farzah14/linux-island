set(CMAKE_AUTOMOC ON)
set(CMAKE_AUTORCC ON)

qt_add_executable(linux-island-settings
    main.cpp
    settings_proxy.h
    settings_proxy.cpp
)

qt_add_qml_module(linux-island-settings
    URI linuxisland.settings
    VERSION 1.0
    QML_FILES
        qml/Main.qml
        qml/Theme.qml
)

target_include_directories(linux-island-settings PRIVATE ${CMAKE_CURRENT_SOURCE_DIR})
target_link_libraries(linux-island-settings PRIVATE
    Qt6::Core
    Qt6::Gui
    Qt6::Qml
    Qt6::Quick
    Qt6::DBus
)
