# Qt Test targets are introduced in milestone M1.
set(CMAKE_AUTOMOC ON)
add_executable(tst_revision_clock
    tst_revision_clock.cpp
    ${CMAKE_SOURCE_DIR}/core/events/revision_clock.cpp
)
target_include_directories(tst_revision_clock PRIVATE ${CMAKE_SOURCE_DIR}/core)
target_link_libraries(tst_revision_clock PRIVATE Qt6::Core Qt6::Test)
add_test(NAME revision-clock COMMAND tst_revision_clock)

add_executable(tst_settings_schema
    tst_settings_schema.cpp
    ${CMAKE_SOURCE_DIR}/core/settings/settings_schema.cpp
)
target_include_directories(tst_settings_schema PRIVATE ${CMAKE_SOURCE_DIR}/core)
target_link_libraries(tst_settings_schema PRIVATE Qt6::Core Qt6::Test)
add_test(NAME settings-schema COMMAND tst_settings_schema)

add_executable(tst_media_normalizer
    tst_media_normalizer.cpp
    ${CMAKE_SOURCE_DIR}/core/media/media_normalizer.cpp
)
target_include_directories(tst_media_normalizer PRIVATE ${CMAKE_SOURCE_DIR}/core)
target_link_libraries(tst_media_normalizer PRIVATE Qt6::Core Qt6::DBus Qt6::Test)
add_test(NAME media-normalizer COMMAND tst_media_normalizer)

add_executable(tst_player_selection
    tst_player_selection.cpp
    ${CMAKE_SOURCE_DIR}/core/media/player_registry.cpp
    ${CMAKE_SOURCE_DIR}/core/media/media_normalizer.cpp
)
target_include_directories(tst_player_selection PRIVATE ${CMAKE_SOURCE_DIR}/core)
target_link_libraries(tst_player_selection PRIVATE Qt6::Core Qt6::DBus Qt6::Test)
add_test(NAME player-selection COMMAND tst_player_selection)

add_executable(tst_audio_meter tst_audio_meter.cpp ${CMAKE_SOURCE_DIR}/core/media/audio_meter.h ${CMAKE_SOURCE_DIR}/core/media/audio_meter.cpp)
target_include_directories(tst_audio_meter PRIVATE ${CMAKE_SOURCE_DIR}/core)
target_link_libraries(tst_audio_meter PRIVATE Qt6::Core Qt6::Test)
add_test(NAME audio-meter COMMAND tst_audio_meter)

add_executable(tst_artwork_cache
    tst_artwork_cache.cpp
    ${CMAKE_SOURCE_DIR}/core/media/artwork_cache.cpp
)
target_include_directories(tst_artwork_cache PRIVATE ${CMAKE_SOURCE_DIR}/core)
target_link_libraries(tst_artwork_cache PRIVATE Qt6::Core Qt6::Network Qt6::Test)
add_test(NAME artwork-cache COMMAND tst_artwork_cache)

add_executable(tst_system_metrics
    tst_system_metrics.cpp
    ${CMAKE_SOURCE_DIR}/island-ui/system_metrics_provider.cpp
)
target_include_directories(tst_system_metrics PRIVATE ${CMAKE_SOURCE_DIR}/island-ui)
target_link_libraries(tst_system_metrics PRIVATE Qt6::Core Qt6::Test)
add_test(NAME system-metrics COMMAND tst_system_metrics)

add_executable(tst_ai_quota
    tst_ai_quota.cpp
    ${CMAKE_SOURCE_DIR}/island-ui/ai_quota_provider.cpp
)
target_include_directories(tst_ai_quota PRIVATE ${CMAKE_SOURCE_DIR}/island-ui)
target_link_libraries(tst_ai_quota PRIVATE Qt6::Core Qt6::Test)
add_test(NAME ai-quota COMMAND tst_ai_quota)

add_executable(tst_search_provider
    tst_search_provider.cpp
    ${CMAKE_SOURCE_DIR}/island-ui/search_provider.cpp
)
target_include_directories(tst_search_provider PRIVATE ${CMAKE_SOURCE_DIR}/island-ui)
target_link_libraries(tst_search_provider PRIVATE Qt6::Core Qt6::Gui Qt6::Test)
add_test(NAME search-provider COMMAND tst_search_provider)

add_executable(tst_cookie_importer
    tst_cookie_importer.cpp
    ${CMAKE_SOURCE_DIR}/island-ui/cookie_importer.cpp
)
target_include_directories(tst_cookie_importer PRIVATE ${CMAKE_SOURCE_DIR}/island-ui)
target_link_libraries(tst_cookie_importer PRIVATE
    Qt6::Core
    Qt6::DBus
    Qt6::Sql
    Qt6::WebEngineQuick
    Qt6::WebEngineCore
    Qt6::Test
    OpenSSL::Crypto
)
add_test(NAME cookie-importer COMMAND tst_cookie_importer)

add_executable(tst_island_client_fsm
    tst_island_client_fsm.cpp
    ${CMAKE_SOURCE_DIR}/island-ui/island_client.cpp
    ${CMAKE_SOURCE_DIR}/island-ui/notification_watcher.cpp
    ${CMAKE_SOURCE_DIR}/island-ui/display_surface_manager.cpp
)
target_include_directories(tst_island_client_fsm PRIVATE ${CMAKE_SOURCE_DIR}/island-ui)
target_link_libraries(tst_island_client_fsm PRIVATE
    Qt6::Core
    Qt6::DBus
    Qt6::Gui
    Qt6::Quick
    Qt6::Test
)
add_test(NAME island-client-fsm COMMAND tst_island_client_fsm)
