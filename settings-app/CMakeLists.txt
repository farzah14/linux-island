set(CMAKE_AUTOMOC ON)
set(CMAKE_AUTORCC ON)

qt_add_executable(linux-island-settings
    main.cpp
    settings_proxy.h
    settings_proxy.cpp
    ${CMAKE_SOURCE_DIR}/core/events/portal_color_scheme.h
    ${CMAKE_SOURCE_DIR}/core/events/portal_color_scheme.cpp
)

if(COMMAND qt_policy)
    qt_policy(SET QTP0001 NEW)
endif()
set_source_files_properties(qml/Theme.qml PROPERTIES QT_QML_SINGLETON_TYPE TRUE)

qt_add_qml_module(linux-island-settings
    URI linuxisland.settings
    VERSION 1.0
    QML_FILES
        qml/Main.qml
        qml/Theme.qml
)

target_include_directories(linux-island-settings PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}
    ${CMAKE_SOURCE_DIR}/core
)
target_link_libraries(linux-island-settings PRIVATE
    Qt6::Core
    Qt6::Gui
    Qt6::Qml
    Qt6::Quick
    Qt6::DBus
)
target_compile_definitions(linux-island-settings PRIVATE ISLAND_VERSION="${PROJECT_VERSION}")

install(TARGETS linux-island-settings RUNTIME DESTINATION ${CMAKE_INSTALL_BINDIR})
