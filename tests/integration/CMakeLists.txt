# D-Bus integration targets are introduced in milestone M1.
add_test(NAME dbus-schema COMMAND ${Python3_EXECUTABLE} ${CMAKE_SOURCE_DIR}/tests/integration/test_schema.py)
add_test(NAME time-schema COMMAND ${Python3_EXECUTABLE} ${CMAKE_SOURCE_DIR}/tests/integration/test_time_schema.py)
add_test(NAME time-page-layout COMMAND ${Python3_EXECUTABLE} ${CMAKE_SOURCE_DIR}/tests/integration/test_time_page_layout.py)
add_test(NAME double-render-guard COMMAND ${Python3_EXECUTABLE} ${CMAKE_SOURCE_DIR}/tests/integration/test_double_render_guard.py)
add_test(NAME session-service COMMAND ${Python3_EXECUTABLE} ${CMAKE_SOURCE_DIR}/tests/integration/test_session_service.py)
add_test(NAME m0-scaffold COMMAND ${Python3_EXECUTABLE} ${CMAKE_SOURCE_DIR}/tests/integration/test_m0_scaffold.py)

# Developer workflow tooling (no live shell required).
add_test(NAME dev-session
    COMMAND ${Python3_EXECUTABLE} ${CMAKE_SOURCE_DIR}/tests/integration/test_dev_session.py)
add_test(NAME dev-cli
    COMMAND ${Python3_EXECUTABLE} ${CMAKE_SOURCE_DIR}/tests/integration/test_dev_cli.py)
add_test(NAME stage-metadata
    COMMAND ${Python3_EXECUTABLE} ${CMAKE_SOURCE_DIR}/tests/integration/test_stage_metadata.py)


set(CMAKE_AUTOMOC ON)
add_executable(tst_core_dbus
    tst_core_dbus.cpp
    ${CMAKE_SOURCE_DIR}/core/dbus/core_service.h
    ${CMAKE_SOURCE_DIR}/core/dbus/core_adaptor.h
    ${CMAKE_SOURCE_DIR}/core/dbus/variant_codec.h
    ${CMAKE_SOURCE_DIR}/core/dbus/variant_codec.cpp
    ${CMAKE_SOURCE_DIR}/core/media/media_state.h
    ${CMAKE_SOURCE_DIR}/core/media/media_normalizer.h
    ${CMAKE_SOURCE_DIR}/core/media/media_normalizer.cpp
    ${CMAKE_SOURCE_DIR}/core/media/player_registry.h
    ${CMAKE_SOURCE_DIR}/core/media/player_registry.cpp
    ${CMAKE_SOURCE_DIR}/core/media/mpris_controller.h
    ${CMAKE_SOURCE_DIR}/core/media/mpris_controller.cpp
    ${CMAKE_SOURCE_DIR}/core/media/sink_volume.h
    ${CMAKE_SOURCE_DIR}/core/media/sink_volume.cpp
    ${CMAKE_SOURCE_DIR}/core/media/artwork_cache.h
    ${CMAKE_SOURCE_DIR}/core/media/artwork_cache.cpp
    ${CMAKE_SOURCE_DIR}/core/events/revision_clock.h
    ${CMAKE_SOURCE_DIR}/core/events/revision_clock.cpp
    ${CMAKE_SOURCE_DIR}/core/settings/settings_schema.h
    ${CMAKE_SOURCE_DIR}/core/settings/settings_schema.cpp
    ${CMAKE_SOURCE_DIR}/core/settings/settings_store.h
    ${CMAKE_SOURCE_DIR}/core/settings/settings_store.cpp
    ${CMAKE_SOURCE_DIR}/core/time/time_types.h
    ${CMAKE_SOURCE_DIR}/core/time/timer_service.h
    ${CMAKE_SOURCE_DIR}/core/time/timer_service.cpp
    ${CMAKE_SOURCE_DIR}/core/todo/todo_service.cpp
    ${CMAKE_SOURCE_DIR}/core/dbus/time_adaptor.h
)
target_include_directories(tst_core_dbus PRIVATE ${CMAKE_SOURCE_DIR}/core)
target_link_libraries(tst_core_dbus PRIVATE Qt6::Core Qt6::DBus Qt6::Network Qt6::Test)

find_program(DBUS_RUN_SESSION dbus-run-session)
if(DBUS_RUN_SESSION)
    add_test(NAME core-dbus COMMAND ${DBUS_RUN_SESSION} $<TARGET_FILE:tst_core_dbus>)
else()
    add_test(NAME core-dbus COMMAND tst_core_dbus)
endif()

add_executable(tst_time_dbus
    tst_time_dbus.cpp
    ${CMAKE_SOURCE_DIR}/core/dbus/core_service.h
    ${CMAKE_SOURCE_DIR}/core/dbus/time_adaptor.h
    ${CMAKE_SOURCE_DIR}/core/dbus/variant_codec.h
    ${CMAKE_SOURCE_DIR}/core/dbus/variant_codec.cpp
    ${CMAKE_SOURCE_DIR}/core/media/media_state.h
    ${CMAKE_SOURCE_DIR}/core/media/media_normalizer.h
    ${CMAKE_SOURCE_DIR}/core/media/media_normalizer.cpp
    ${CMAKE_SOURCE_DIR}/core/media/player_registry.h
    ${CMAKE_SOURCE_DIR}/core/media/player_registry.cpp
    ${CMAKE_SOURCE_DIR}/core/media/mpris_controller.h
    ${CMAKE_SOURCE_DIR}/core/media/mpris_controller.cpp
    ${CMAKE_SOURCE_DIR}/core/media/sink_volume.h
    ${CMAKE_SOURCE_DIR}/core/media/sink_volume.cpp
    ${CMAKE_SOURCE_DIR}/core/media/artwork_cache.h
    ${CMAKE_SOURCE_DIR}/core/media/artwork_cache.cpp
    ${CMAKE_SOURCE_DIR}/core/events/revision_clock.h
    ${CMAKE_SOURCE_DIR}/core/events/revision_clock.cpp
    ${CMAKE_SOURCE_DIR}/core/settings/settings_schema.h
    ${CMAKE_SOURCE_DIR}/core/settings/settings_schema.cpp
    ${CMAKE_SOURCE_DIR}/core/settings/settings_store.h
    ${CMAKE_SOURCE_DIR}/core/settings/settings_store.cpp
    ${CMAKE_SOURCE_DIR}/core/time/time_types.h
    ${CMAKE_SOURCE_DIR}/core/time/timer_service.h
    ${CMAKE_SOURCE_DIR}/core/time/timer_service.cpp
    ${CMAKE_SOURCE_DIR}/core/todo/todo_service.cpp
)
target_include_directories(tst_time_dbus PRIVATE ${CMAKE_SOURCE_DIR}/core)
target_link_libraries(tst_time_dbus PRIVATE Qt6::Core Qt6::DBus Qt6::Network Qt6::Test)

if(DBUS_RUN_SESSION)
    add_test(NAME time-dbus COMMAND ${DBUS_RUN_SESSION} $<TARGET_FILE:tst_time_dbus>)
else()
    add_test(NAME time-dbus COMMAND tst_time_dbus)
endif()

add_executable(tst_mpris_flow
    tst_mpris_flow.cpp
    fake_mpris_player.h
    fake_mpris_player.cpp
    ${CMAKE_SOURCE_DIR}/core/media/player_registry.h
    ${CMAKE_SOURCE_DIR}/core/media/player_registry.cpp
    ${CMAKE_SOURCE_DIR}/core/media/media_state.h
    ${CMAKE_SOURCE_DIR}/core/media/media_normalizer.h
    ${CMAKE_SOURCE_DIR}/core/media/media_normalizer.cpp
    ${CMAKE_SOURCE_DIR}/core/media/mpris_controller.h
    ${CMAKE_SOURCE_DIR}/core/media/mpris_controller.cpp
    ${CMAKE_SOURCE_DIR}/core/media/sink_volume.h
    ${CMAKE_SOURCE_DIR}/core/media/sink_volume.cpp
)
target_include_directories(tst_mpris_flow PRIVATE ${CMAKE_SOURCE_DIR}/core)
target_link_libraries(tst_mpris_flow PRIVATE Qt6::Core Qt6::DBus Qt6::Test)

if(DBUS_RUN_SESSION)
    add_test(NAME mpris-flow COMMAND ${DBUS_RUN_SESSION} $<TARGET_FILE:tst_mpris_flow>)
else()
    add_test(NAME mpris-flow COMMAND tst_mpris_flow)
endif()

# Installability: the same CMake install rules back every package, so a staged
# install plus a CPack run is the closest offline proof that a package works.
add_test(NAME packaging-install
    COMMAND ${Python3_EXECUTABLE} ${CMAKE_SOURCE_DIR}/tests/integration/test_packaging.py
            --build-dir ${CMAKE_BINARY_DIR})
add_test(NAME launcher-routing
    COMMAND ${Python3_EXECUTABLE} ${CMAKE_SOURCE_DIR}/tests/integration/test_launcher.py)
add_test(NAME local-install
    COMMAND ${Python3_EXECUTABLE} ${CMAKE_SOURCE_DIR}/tests/integration/test_local_install.py)

find_program(NODE_EXECUTABLE node)
if(NODE_EXECUTABLE)
    add_test(NAME extension-notification-adapter
        COMMAND ${NODE_EXECUTABLE} ${CMAKE_SOURCE_DIR}/tests/extension/notification-adapter.test.js)
    add_test(NAME extension-display-mode
        COMMAND ${NODE_EXECUTABLE} ${CMAKE_SOURCE_DIR}/tests/extension/display-mode.test.js)
endif()
