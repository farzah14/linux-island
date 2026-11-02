set(CMAKE_AUTOMOC ON)
set(CMAKE_AUTORCC ON)

qt_add_executable(linux-island-ui
    main.cpp
    island_client.h
    island_client.cpp
    system_metrics_provider.h
    system_metrics_provider.cpp
    quick_settings_provider.h
    quick_settings_provider.cpp
    ai_quota_provider.h
    ai_quota_provider.cpp
    search_provider.h
    search_provider.cpp
    companion_profile.h
    companion_profile.cpp
    cookie_importer.h
    cookie_importer.cpp
    notification_watcher.h
    notification_watcher.cpp
    display_surface_manager.h
    display_surface_manager.cpp
)
set_source_files_properties(
    ${CMAKE_SOURCE_DIR}/extension/icons/antigravity.png
    PROPERTIES QT_RESOURCE_ALIAS "icons/antigravity.png"
)
set_source_files_properties(
    ${CMAKE_SOURCE_DIR}/extension/icons/codex.png
    PROPERTIES QT_RESOURCE_ALIAS "icons/codex.png"
)
set_source_files_properties(
    ${CMAKE_SOURCE_DIR}/extension/icons/claude.png
    PROPERTIES QT_RESOURCE_ALIAS "icons/claude.png"
)
set_source_files_properties(
    ${CMAKE_SOURCE_DIR}/extension/icons/ui/media-symbolic.svg
    PROPERTIES QT_RESOURCE_ALIAS "icons/ui/media-symbolic.svg"
)
set_source_files_properties(
    ${CMAKE_SOURCE_DIR}/extension/icons/ui/system-symbolic.svg
    PROPERTIES QT_RESOURCE_ALIAS "icons/ui/system-symbolic.svg"
)
set_source_files_properties(
    ${CMAKE_SOURCE_DIR}/extension/icons/ui/ai-symbolic.svg
    PROPERTIES QT_RESOURCE_ALIAS "icons/ui/ai-symbolic.svg"
)
set_source_files_properties(
    ${CMAKE_SOURCE_DIR}/extension/icons/ui/search-symbolic.svg
    PROPERTIES QT_RESOURCE_ALIAS "icons/ui/search-symbolic.svg"
)
set_source_files_properties(
    ${CMAKE_SOURCE_DIR}/extension/icons/ui/prev-symbolic.svg
    PROPERTIES QT_RESOURCE_ALIAS "icons/ui/prev-symbolic.svg"
)
set_source_files_properties(
    ${CMAKE_SOURCE_DIR}/extension/icons/ui/next-symbolic.svg
    PROPERTIES QT_RESOURCE_ALIAS "icons/ui/next-symbolic.svg"
)
set_source_files_properties(
    ${CMAKE_SOURCE_DIR}/extension/icons/ui/play-symbolic.svg
    PROPERTIES QT_RESOURCE_ALIAS "icons/ui/play-symbolic.svg"
)
set_source_files_properties(
    ${CMAKE_SOURCE_DIR}/extension/icons/ui/pause-symbolic.svg
    PROPERTIES QT_RESOURCE_ALIAS "icons/ui/pause-symbolic.svg"
)
set_source_files_properties(
    ${CMAKE_SOURCE_DIR}/extension/icons/ui/volume-high-symbolic.svg
    PROPERTIES QT_RESOURCE_ALIAS "icons/ui/volume-high-symbolic.svg"
)
set_source_files_properties(
    ${CMAKE_SOURCE_DIR}/extension/icons/ui/volume-muted-symbolic.svg
    PROPERTIES QT_RESOURCE_ALIAS "icons/ui/volume-muted-symbolic.svg"
)
set_source_files_properties(
    ${CMAKE_SOURCE_DIR}/extension/icons/ui/theme-symbolic.svg
    PROPERTIES QT_RESOURCE_ALIAS "icons/ui/theme-symbolic.svg"
)
set_source_files_properties(
    ${CMAKE_SOURCE_DIR}/extension/icons/ui/night-light-symbolic.svg
    PROPERTIES QT_RESOURCE_ALIAS "icons/ui/night-light-symbolic.svg"
)
set_source_files_properties(
    ${CMAKE_SOURCE_DIR}/extension/icons/ui/dnd-symbolic.svg
    PROPERTIES QT_RESOURCE_ALIAS "icons/ui/dnd-symbolic.svg"
)

qt_add_qml_module(linux-island-ui
    URI linuxisland.ui
    VERSION 1.0
    QML_FILES
        qml/ThemeData.qml
        qml/NavIcon.qml
        qml/BeatBars.qml
        qml/MusicPage.qml
        qml/SystemPage.qml
        qml/AiQuotaPage.qml
        qml/SearchPage.qml
        qml/IslandWindow.qml
        qml/CompanionWindow.qml
    RESOURCES
        ${CMAKE_SOURCE_DIR}/extension/icons/antigravity.png
        ${CMAKE_SOURCE_DIR}/extension/icons/codex.png
        ${CMAKE_SOURCE_DIR}/extension/icons/claude.png
        ${CMAKE_SOURCE_DIR}/extension/icons/ui/media-symbolic.svg
        ${CMAKE_SOURCE_DIR}/extension/icons/ui/system-symbolic.svg
        ${CMAKE_SOURCE_DIR}/extension/icons/ui/ai-symbolic.svg
        ${CMAKE_SOURCE_DIR}/extension/icons/ui/search-symbolic.svg
        ${CMAKE_SOURCE_DIR}/extension/icons/ui/prev-symbolic.svg
        ${CMAKE_SOURCE_DIR}/extension/icons/ui/next-symbolic.svg
        ${CMAKE_SOURCE_DIR}/extension/icons/ui/play-symbolic.svg
        ${CMAKE_SOURCE_DIR}/extension/icons/ui/pause-symbolic.svg
        ${CMAKE_SOURCE_DIR}/extension/icons/ui/volume-high-symbolic.svg
        ${CMAKE_SOURCE_DIR}/extension/icons/ui/volume-muted-symbolic.svg
        ${CMAKE_SOURCE_DIR}/extension/icons/ui/theme-symbolic.svg
        ${CMAKE_SOURCE_DIR}/extension/icons/ui/night-light-symbolic.svg
        ${CMAKE_SOURCE_DIR}/extension/icons/ui/dnd-symbolic.svg
)

target_include_directories(linux-island-ui PRIVATE ${CMAKE_CURRENT_SOURCE_DIR})
target_link_libraries(linux-island-ui PRIVATE
    Qt6::Core
    Qt6::Gui
    Qt6::Qml
    Qt6::Quick
    Qt6::DBus
    Qt6::WebEngineQuick
    Qt6::WebEngineCore
    Qt6::Sql
    OpenSSL::Crypto
)
target_compile_definitions(linux-island-ui PRIVATE ISLAND_VERSION="${PROJECT_VERSION}")

install(TARGETS linux-island-ui RUNTIME DESTINATION ${CMAKE_INSTALL_LIBEXECDIR})
