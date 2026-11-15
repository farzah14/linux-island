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

add_executable(tst_timer_service
    tst_timer_service.cpp
    ${CMAKE_SOURCE_DIR}/core/time/timer_service.cpp
)
target_include_directories(tst_timer_service PRIVATE ${CMAKE_SOURCE_DIR}/core)
target_link_libraries(tst_timer_service PRIVATE Qt6::Core Qt6::Test)
add_test(NAME timer-service COMMAND tst_timer_service)

add_executable(tst_time_format
    tst_time_format.cpp
    ${CMAKE_SOURCE_DIR}/island-ui/time_format.cpp
)
target_include_directories(tst_time_format PRIVATE ${CMAKE_SOURCE_DIR}/island-ui)
target_link_libraries(tst_time_format PRIVATE Qt6::Core Qt6::Test)
add_test(NAME time-format COMMAND tst_time_format)

add_executable(tst_sink_volume tst_sink_volume.cpp ${CMAKE_SOURCE_DIR}/core/media/sink_volume.cpp)
target_include_directories(tst_sink_volume PRIVATE ${CMAKE_SOURCE_DIR}/core)
target_link_libraries(tst_sink_volume PRIVATE Qt6::Core Qt6::Test)
add_test(NAME sink-volume COMMAND tst_sink_volume)

add_executable(tst_shelf_service
    tst_shelf_service.cpp
    ${CMAKE_SOURCE_DIR}/core/shelf/shelf_service.cpp
)
target_include_directories(tst_shelf_service PRIVATE ${CMAKE_SOURCE_DIR}/core)
target_link_libraries(tst_shelf_service PRIVATE Qt6::Core Qt6::Test)
add_test(NAME shelf-service COMMAND tst_shelf_service)

add_executable(tst_todo_service tst_todo_service.cpp ${CMAKE_SOURCE_DIR}/core/todo/todo_service.cpp)
target_include_directories(tst_todo_service PRIVATE ${CMAKE_SOURCE_DIR}/core)
target_link_libraries(tst_todo_service PRIVATE Qt6::Core Qt6::Test)
add_test(NAME todo-service COMMAND tst_todo_service)
