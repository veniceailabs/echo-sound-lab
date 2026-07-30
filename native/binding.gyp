{
  "targets": [
    {
      "target_name": "echo-sound-lab",
      "sources": [
        "src/mastering-engine.cpp",
        "src/dsp/eq.cpp",
        "src/dsp/compressor.cpp",
        "src/dsp/limiter.cpp",
        "src/dsp/saturation.cpp",
        "src/dsp/metering.cpp",
        "src/dsp/vocal-chain.cpp",
        "src/utils/simd-math.cpp",
        "src/ai/reference-analyzer.cpp",
        "src/ai/learning-profile.cpp",
        "src/node-binding.cpp",
        "src/vocal-binding.cpp",
        "src/audio-io/recorder.cpp"
      ],
      "include_dirs": [
        "include",
        "<!(node -p \"require('node-addon-api').include_dir\")",
        "<!(node -p \"require('./scripts/portaudio-paths').include\")"
      ],
      "defines": ["NAPI_CPP_EXCEPTIONS"],
      "conditions": [
        [
          "OS == 'mac'",
          {
            "libraries": [
              "<!(node -p \"require('./scripts/portaudio-paths').library\")"
            ],
            "xcode_settings": {
              "GCC_ENABLE_CPP_EXCEPTIONS": "YES",
              "CLANG_CXX_LIBRARY": "libc++",
              "MACOSX_DEPLOYMENT_TARGET": "11.0",
              "OTHER_CPLUSPLUSFLAGS": ["-std=c++17", "-O3"],
              "OTHER_LDFLAGS": [
                "-framework CoreAudio",
                "-framework AudioToolbox",
                "-framework AudioUnit",
                "-framework CoreServices",
                "-framework CoreFoundation"
              ]
            }
          }
        ],
        [
          "OS == 'win'",
          {
            "libraries": [
              "<!(node -p \"require('./scripts/portaudio-paths').library\")",
              "winmm.lib",
              "ole32.lib",
              "uuid.lib",
              "setupapi.lib",
              "advapi32.lib"
            ],
            "defines": ["NOMINMAX", "_USE_MATH_DEFINES"],
            "msvs_settings": {
              "VCCLCompilerTool": {
                "ExceptionHandling": 1,
                "AdditionalOptions": ["/std:c++17", "/O2", "/EHsc"]
              }
            }
          }
        ],
        [
          "OS == 'linux'",
          {
            "libraries": ["-lportaudio", "-lasound", "-lpthread"],
            "cflags_cc": ["-std=c++17", "-O3", "-fexceptions"]
          }
        ]
      ]
    }
  ]
}
