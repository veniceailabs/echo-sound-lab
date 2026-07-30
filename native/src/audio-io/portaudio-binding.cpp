#include <portaudio.h>
#include <iostream>
#include <vector>
#include <atomic>
#include "echo/mastering-engine.h"

/**
 * PortAudio Real-Time Audio I/O Binding
 * Provides low-latency hardware audio I/O for Echo Sound Lab
 * Latency target: <2ms
 */

class AudioIOManager {
private:
  PaStream* stream_;
  EchoSoundLab::MasteringEngine* engine_;
  std::atomic<bool> is_running_{false};
  float latency_ms_{0.0f};

  static constexpr int SAMPLE_RATE = 48000;
  static constexpr int BUFFER_SIZE = 128;  // ~2.67ms latency

public:
  AudioIOManager() : stream_(nullptr), engine_(nullptr) {
    // Initialize PortAudio
    PaError err = Pa_Initialize();
    if (err != paNoError) {
      std::cerr << "PortAudio init error: " << Pa_GetErrorText(err) << std::endl;
      return;
    }

    // Create mastering engine
    engine_ = new EchoSoundLab::MasteringEngine(SAMPLE_RATE);
  }

  ~AudioIOManager() {
    if (is_running_) {
      Stop();
    }

    if (stream_) {
      Pa_CloseStream(stream_);
    }

    if (engine_) {
      delete engine_;
    }

    Pa_Terminate();
  }

  /**
   * List available audio devices
   */
  std::vector<std::string> GetAvailableDevices() const {
    std::vector<std::string> devices;

    int count = Pa_GetDeviceCount();
    for (int i = 0; i < count; i++) {
      const PaDeviceInfo* info = Pa_GetDeviceInfo(i);
      if (info->maxInputChannels > 0 || info->maxOutputChannels > 0) {
        std::string name = info->name;
        name += " (";
        if (info->maxInputChannels > 0) {
          name += std::to_string(info->maxInputChannels) + "in";
        }
        if (info->maxOutputChannels > 0) {
          if (info->maxInputChannels > 0) name += ", ";
          name += std::to_string(info->maxOutputChannels) + "out";
        }
        name += ")";
        devices.push_back(name);
      }
    }

    return devices;
  }

  /**
   * Get default input/output devices
   */
  void GetDefaultDevices(int& input_device, int& output_device) const {
    input_device = Pa_GetDefaultInputDevice();
    output_device = Pa_GetDefaultOutputDevice();
  }

  /**
   * Start audio stream
   */
  bool Start(int input_device = -1, int output_device = -1) {
    try {
      if (input_device == -1) {
        input_device = Pa_GetDefaultInputDevice();
      }
      if (output_device == -1) {
        output_device = Pa_GetDefaultOutputDevice();
      }

      // Setup input parameters
      PaStreamParameters input_params{};
      input_params.device = input_device;
      input_params.channelCount = 2;
      input_params.sampleFormat = paFloat32;
      input_params.suggestedLatency = Pa_GetDeviceInfo(input_device)->defaultLowInputLatency;

      // Setup output parameters
      PaStreamParameters output_params{};
      output_params.device = output_device;
      output_params.channelCount = 2;
      output_params.sampleFormat = paFloat32;
      output_params.suggestedLatency = Pa_GetDeviceInfo(output_device)->defaultLowOutputLatency;

      // Create stream
      PaError err = Pa_OpenStream(
          &stream_,
          &input_params,
          &output_params,
          SAMPLE_RATE,
          BUFFER_SIZE,
          paClipOff,
          AudioIOManager::AudioCallback,
          this);

      if (err != paNoError) {
        std::cerr << "Failed to open stream: " << Pa_GetErrorText(err) << std::endl;
        return false;
      }

      // Start stream
      err = Pa_StartStream(stream_);
      if (err != paNoError) {
        std::cerr << "Failed to start stream: " << Pa_GetErrorText(err) << std::endl;
        return false;
      }

      is_running_ = true;

      // Calculate latency
      latency_ms_ = (Pa_GetStreamInfo(stream_)->inputLatency +
                     Pa_GetStreamInfo(stream_)->outputLatency) *
                    1000.0f;

      std::cout << "✅ Audio I/O started: " << latency_ms_ << " ms latency" << std::endl;
      return true;
    } catch (const std::exception& e) {
      std::cerr << "Exception starting audio: " << e.what() << std::endl;
      return false;
    }
  }

  /**
   * Stop audio stream
   */
  bool Stop() {
    if (!stream_) {
      return false;
    }

    is_running_ = false;

    PaError err = Pa_StopStream(stream_);
    if (err != paNoError) {
      std::cerr << "Failed to stop stream: " << Pa_GetErrorText(err) << std::endl;
      return false;
    }

    std::cout << "✅ Audio I/O stopped" << std::endl;
    return true;
  }

  /**
   * Get current latency in milliseconds
   */
  float GetLatency() const { return latency_ms_; }

  /**
   * Check if stream is active
   */
  bool IsRunning() const { return is_running_; }

  /**
   * Configure mastering engine
   */
  void Configure(float target_lufs, float saturation_amount, float saturation_drive) {
    if (engine_) {
      engine_->SetLUFSTarget(target_lufs);
      engine_->SetSaturation(saturation_amount, saturation_drive);
    }
  }

  /**
   * Get metrics from engine
   */
  void GetMetrics(float& lufs, float& true_peak, float& loudness_range) {
    if (engine_) {
      auto metrics = engine_->GetMetrics();
      lufs = metrics.integrated_lufs;
      true_peak = metrics.true_peak_dbfs;
      loudness_range = metrics.loudness_range;
    }
  }

private:
  /**
   * PortAudio callback (static)
   */
  static int AudioCallback(
      const void* input,
      void* output,
      unsigned long frameCount,
      const PaStreamCallbackTimeInfo* timeInfo,
      PaStreamCallbackFlags statusFlags,
      void* userData) {
    AudioIOManager* self = static_cast<AudioIOManager*>(userData);
    return self->ProcessAudio(input, output, frameCount);
  }

  /**
   * Process audio in real-time
   */
  int ProcessAudio(const void* input, void* output, unsigned long frameCount) {
    try {
      if (!engine_) {
        return paContinue;
      }

      const float* in = static_cast<const float*>(input);
      float* out = static_cast<float*>(output);

      // Process through mastering engine
      auto processed = engine_->ProcessBlock(in, frameCount, 2);

      // Copy to output
      std::copy(processed.begin(), processed.end(), out);

      return paContinue;
    } catch (const std::exception& e) {
      std::cerr << "Audio callback error: " << e.what() << std::endl;
      return paAbort;
    }
  }
};
