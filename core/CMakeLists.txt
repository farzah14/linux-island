add_executable(linux-island-core app/main.cpp)
target_link_libraries(linux-island-core PRIVATE Qt6::Core Qt6::DBus)
