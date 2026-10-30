cmake_minimum_required(VERSION 3.13)
project(GestureHandlerCodegen)

set(CMAKE_VERBOSE_MAKEFILE on)
set(CMAKE_CXX_STANDARD 20)

get_filename_component(TRANSMUTE_PROJECT_ROOT "${CMAKE_CURRENT_LIST_DIR}/../../.." ABSOLUTE)
set(GESTURE_HANDLER_ROOT "${TRANSMUTE_PROJECT_ROOT}/node_modules/react-native-gesture-handler")
set(GESTURE_HANDLER_UPSTREAM_SHARED_DIR "${GESTURE_HANDLER_ROOT}/shared/shadowNodes")
set(GESTURE_HANDLER_SHARED_DIR "${TRANSMUTE_PROJECT_ROOT}/g/sh/shadowNodes")
set(GESTURE_HANDLER_CODEGEN_DIR "${TRANSMUTE_PROJECT_ROOT}/g/generated/source/codegen/jni")

# Compile a tracked copy so CMake's object directory does not repeat the long node_modules path.
file(GLOB_RECURSE GESTURE_HANDLER_SHARED_FILES CONFIGURE_DEPENDS LIST_DIRECTORIES false "${GESTURE_HANDLER_UPSTREAM_SHARED_DIR}/*")
foreach(GESTURE_HANDLER_SHARED_FILE IN LISTS GESTURE_HANDLER_SHARED_FILES)
  file(RELATIVE_PATH GESTURE_HANDLER_RELATIVE_FILE "${GESTURE_HANDLER_UPSTREAM_SHARED_DIR}" "${GESTURE_HANDLER_SHARED_FILE}")
  get_filename_component(GESTURE_HANDLER_SHORT_DIRECTORY "${GESTURE_HANDLER_SHARED_DIR}/${GESTURE_HANDLER_RELATIVE_FILE}" DIRECTORY)
  file(MAKE_DIRECTORY "${GESTURE_HANDLER_SHORT_DIRECTORY}")
  configure_file("${GESTURE_HANDLER_SHARED_FILE}" "${GESTURE_HANDLER_SHARED_DIR}/${GESTURE_HANDLER_RELATIVE_FILE}" COPYONLY)
endforeach()

file(GLOB_RECURSE GESTURE_HANDLER_SRCS CONFIGURE_DEPENDS "${GESTURE_HANDLER_SHARED_DIR}/*.cpp")
file(GLOB_RECURSE GESTURE_HANDLER_CODEGEN_SRCS CONFIGURE_DEPENDS "${GESTURE_HANDLER_CODEGEN_DIR}/*.cpp")

add_library(
  react_codegen_rngesturehandler_codegen
  SHARED
  ${GESTURE_HANDLER_SRCS}
  ${GESTURE_HANDLER_CODEGEN_SRCS}
)

if (ReactAndroid_VERSION_MINOR GREATER_EQUAL 80)
  target_compile_reactnative_options(react_codegen_rngesturehandler_codegen PRIVATE)
endif()

target_include_directories(
  react_codegen_rngesturehandler_codegen
  PUBLIC
  "${GESTURE_HANDLER_SHARED_DIR}"
  "${GESTURE_HANDLER_CODEGEN_DIR}"
)

target_link_libraries(react_codegen_rngesturehandler_codegen fbjni jsi reactnative)
