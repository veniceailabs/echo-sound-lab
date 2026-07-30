cmake_minimum_required(VERSION 3.15)
project(echo-sound-lab-core VERSION 1.0.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Platform detection
if(EMSCRIPTEN)
  set(WASM ON)
  message(STATUS "Building for WASM (Emscripten)")
elseif(WIN32)
  set(PLATFORM "windows")
elseif(APPLE)
  set(PLATFORM "macos")
elseif(UNIX)
  set(PLATFORM "linux")
endif()

# Source files
set(SOURCES
  src/mastering-engine.cpp
  src/dsp/eq.cpp
  src/dsp/compressor.cpp
  src/dsp/limiter.cpp
  src/dsp/saturation.cpp
  src/dsp/metering.cpp
  src/utils/simd-math.cpp
  src/ai/reference-analyzer.cpp
  src/ai/learning-profile.cpp
)

# Header files
set(HEADERS
  include/echo/mastering-engine.h
  include/echo/dsp/eq.h
  include/echo/dsp/compressor.h
  include/echo/dsp/limiter.h
  include/echo/dsp/saturation.h
  include/echo/dsp/metering.h
  include/echo/ai/reference-analyzer.h
  include/echo/ai/learning-profile.h
  include/echo/utils/circular-buffer.h
  include/echo/utils/simd-math.h
)

# Create static library
add_library(echo-sound-lab-static STATIC ${SOURCES})
target_include_directories(echo-sound-lab-static PUBLIC include)

# SIMD optimization flags
if(NOT WASM)
  if(MSVC)
    target_compile_options(echo-sound-lab-static PRIVATE /arch:AVX2)
  else()
    target_compile_options(echo-sound-lab-static PRIVATE -march=native)
  endif()
endif()

# Test executable
if(NOT WASM)
  enable_testing()
  add_executable(echo-tests
    tests/test-metering.cpp
    tests/test-eq.cpp
    tests/test-compressor.cpp
  )
  target_include_directories(echo-tests PRIVATE include)
  target_link_libraries(echo-tests echo-sound-lab-static)
  add_test(NAME CoreTests COMMAND echo-tests)
endif()

# Node.js native addon (via node-gyp, not CMake directly)
# This is handled by binding.gyp

# WASM target (via Emscripten)
if(WASM)
  set_target_properties(echo-sound-lab-static PROPERTIES
    SUFFIX ".bc"
  )
endif()

# Export library
install(TARGETS echo-sound-lab-static DESTINATION lib)
install(DIRECTORY include/echo DESTINATION include)
