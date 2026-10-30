cmake_minimum_required(VERSION 3.13)
set(CMAKE_VERBOSE_MAKEFILE ON)

set(LIB_LITERAL safeareacontext)
set(LIB_TARGET_NAME react_codegen_${LIB_LITERAL})

get_filename_component(TRANSMUTE_PROJECT_ROOT "${CMAKE_CURRENT_LIST_DIR}/../../.." ABSOLUTE)
set(SAFE_AREA_PACKAGE_ROOT "${TRANSMUTE_PROJECT_ROOT}/node_modules/react-native-safe-area-context")
set(LIB_COMMON_DIR "${SAFE_AREA_PACKAGE_ROOT}/common/cpp")
set(LIB_ANDROID_JNI_DIR "${SAFE_AREA_PACKAGE_ROOT}/android/src/main/jni")
set(LIB_ANDROID_GENERATED_JNI_DIR "${TRANSMUTE_PROJECT_ROOT}/s/generated/source/codegen/jni")
set(LIB_ANDROID_GENERATED_COMPONENTS_DIR "${LIB_ANDROID_GENERATED_JNI_DIR}/react/renderer/components/${LIB_LITERAL}")
set(LIB_SHORT_COMMON_COMPONENTS_DIR "${TRANSMUTE_PROJECT_ROOT}/s/common/cpp/react/renderer/components/${LIB_LITERAL}")

if (NOT EXISTS "${LIB_ANDROID_GENERATED_COMPONENTS_DIR}/ComponentDescriptors.cpp")
  message(FATAL_ERROR "Safe-area codegen sources are missing under ${LIB_ANDROID_GENERATED_JNI_DIR}")
endif()

file(GLOB LIB_COMMON_SOURCE_FILES CONFIGURE_DEPENDS "${LIB_COMMON_DIR}/react/renderer/components/${LIB_LITERAL}/*")
file(MAKE_DIRECTORY "${LIB_SHORT_COMMON_COMPONENTS_DIR}")
foreach(LIB_COMMON_SOURCE_FILE IN LISTS LIB_COMMON_SOURCE_FILES)
  get_filename_component(LIB_COMMON_FILE_NAME "${LIB_COMMON_SOURCE_FILE}" NAME)
  configure_file("${LIB_COMMON_SOURCE_FILE}" "${LIB_SHORT_COMMON_COMPONENTS_DIR}/${LIB_COMMON_FILE_NAME}" COPYONLY)
endforeach()

file(GLOB LIB_CUSTOM_SRCS CONFIGURE_DEPENDS "${LIB_ANDROID_JNI_DIR}/*.cpp" "${LIB_SHORT_COMMON_COMPONENTS_DIR}/*.cpp")
file(GLOB LIB_CODEGEN_SRCS CONFIGURE_DEPENDS "${LIB_ANDROID_GENERATED_JNI_DIR}/*.cpp" "${LIB_ANDROID_GENERATED_COMPONENTS_DIR}/*.cpp")

add_library(
  ${LIB_TARGET_NAME}
  SHARED
  ${LIB_CUSTOM_SRCS}
  ${LIB_CODEGEN_SRCS}
)

target_include_directories(
  ${LIB_TARGET_NAME}
  PUBLIC
  "${LIB_ANDROID_JNI_DIR}"
  "${LIB_COMMON_DIR}"
  "${LIB_SHORT_COMMON_COMPONENTS_DIR}"
  "${LIB_ANDROID_GENERATED_JNI_DIR}"
  "${LIB_ANDROID_GENERATED_COMPONENTS_DIR}"
)

target_link_libraries(${LIB_TARGET_NAME} fbjni jsi reactnative)
target_include_directories(${CMAKE_PROJECT_NAME} PUBLIC "${CMAKE_CURRENT_SOURCE_DIR}")
if (ReactAndroid_VERSION_MINOR GREATER_EQUAL 80)
  target_compile_reactnative_options(${LIB_TARGET_NAME} PUBLIC)
else()
  target_compile_options(${LIB_TARGET_NAME} PRIVATE -fexceptions -frtti -std=c++20 -Wall)
endif()
target_compile_options(
  ${LIB_TARGET_NAME}
  PRIVATE
  -Wpedantic
  -Wno-gnu-zero-variadic-macro-arguments
  -Wno-dollar-in-identifier-extension
)
