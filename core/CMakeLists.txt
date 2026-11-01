set(CMAKE_AUTOMOC ON)

add_executable(linux-island-core
    app/main.cpp
    dbus/core_service.h
    dbus/core_adaptor.h
    dbus/variant_codec.h
    dbus/variant_codec.cpp
    media/media_state.h
    media/audio_meter.h
    media/audio_meter.cpp
    media/media_normalizer.h
    media/media_normalizer.cpp
    media/player_registry.h
    media/player_registry.cpp
    media/mpris_controller.h
    media/mpris_controller.cpp
    media/artwork_cache.h
    media/artwork_cache.cpp
    events/revision_clock.h
    events/revision_clock.cpp
    settings/settings_schema.h
    settings/settings_schema.cpp
    settings/settings_store.h
    settings/settings_store.cpp
)

target_include_directories(linux-island-core PRIVATE ${CMAKE_CURRENT_SOURCE_DIR})
target_link_libraries(linux-island-core PRIVATE Qt6::Core Qt6::DBus Qt6::Network)
target_compile_definitions(linux-island-core PRIVATE ISLAND_VERSION="${PROJECT_VERSION}")

install(TARGETS linux-island-core RUNTIME DESTINATION ${CMAKE_INSTALL_LIBEXECDIR})
