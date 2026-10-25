# D-Bus integration targets are introduced in milestone M1.
add_test(NAME dbus-schema COMMAND ${Python3_EXECUTABLE} ${CMAKE_SOURCE_DIR}/tests/integration/test_schema.py)

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
    ${CMAKE_SOURCE_DIR}/core/events/revision_clock.h
    ${CMAKE_SOURCE_DIR}/core/events/revision_clock.cpp
    ${CMAKE_SOURCE_DIR}/core/settings/settings_schema.h
    ${CMAKE_SOURCE_DIR}/core/settings/settings_schema.cpp
    ${CMAKE_SOURCE_DIR}/core/settings/settings_store.h
    ${CMAKE_SOURCE_DIR}/core/settings/settings_store.cpp
)
target_include_directories(tst_core_dbus PRIVATE ${CMAKE_SOURCE_DIR}/core)
target_link_libraries(tst_core_dbus PRIVATE Qt6::Core Qt6::DBus Qt6::Test)

find_program(DBUS_RUN_SESSION dbus-run-session)
if(DBUS_RUN_SESSION)
    add_test(NAME core-dbus COMMAND ${DBUS_RUN_SESSION} $<TARGET_FILE:tst_core_dbus>)
else()
    add_test(NAME core-dbus COMMAND tst_core_dbus)
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
)
target_include_directories(tst_mpris_flow PRIVATE ${CMAKE_SOURCE_DIR}/core)
target_link_libraries(tst_mpris_flow PRIVATE Qt6::Core Qt6::DBus Qt6::Test)

if(DBUS_RUN_SESSION)
    add_test(NAME mpris-flow COMMAND ${DBUS_RUN_SESSION} $<TARGET_FILE:tst_mpris_flow>)
else()
    add_test(NAME mpris-flow COMMAND tst_mpris_flow)
endif()
