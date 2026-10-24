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
target_link_libraries(tst_media_normalizer PRIVATE Qt6::Core Qt6::Test)
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
