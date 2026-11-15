set(CMAKE_AUTOMOC ON)

add_executable(linux-island-core
    app/main.cpp
    dbus/core_service.h
    dbus/core_adaptor.h
    dbus/variant_codec.h
    dbus/variant_codec.cpp
    dbus/time_adaptor.h
    dbus/shelf_adaptor.h
    dbus/todo_adaptor.h
    todo/todo_service.h
    todo/todo_service.cpp
    media/media_state.h
    media/audio_meter.h
    media/audio_meter.cpp
    media/sink_volume.h
    media/sink_volume.cpp
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
    time/time_types.h
    time/timer_service.h
    time/timer_service.cpp
    shelf/shelf_types.h
    shelf/shelf_service.h
    shelf/shelf_service.cpp
)

target_include_directories(linux-island-core PRIVATE ${CMAKE_CURRENT_SOURCE_DIR})
target_link_libraries(linux-island-core PRIVATE Qt6::Core Qt6::DBus Qt6::Network)
target_compile_definitions(linux-island-core PRIVATE ISLAND_VERSION="${PROJECT_VERSION}")

install(TARGETS linux-island-core RUNTIME DESTINATION ${CMAKE_INSTALL_LIBEXECDIR})
