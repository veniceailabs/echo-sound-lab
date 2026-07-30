// Real-time safe multi-channel audio capture.
//
// The audio callback is a hard real-time context: it must never allocate,
// lock, throw, or do I/O. Anything that blocks causes a dropout in the
// recording. So the callback does exactly one thing -- copy samples into a
// lock-free ring buffer -- and a separate writer thread drains that ring to
// disk at its leisure.
//
//   [PortAudio callback]  --push-->  [SPSC ring]  --drain-->  [writer thread]
//    real-time, no alloc                            normal priority, does I/O

#include <napi.h>
#include <portaudio.h>

#include <atomic>
#include <cstdio>
#include <cstring>
#include <string>
#include <thread>
#include <vector>

namespace {

// Single-producer / single-consumer lock-free ring buffer of floats.
class RingBuffer {
public:
  void Resize(size_t capacity) {
    buffer_.assign(capacity, 0.0f);
    write_.store(0, std::memory_order_relaxed);
    read_.store(0, std::memory_order_relaxed);
  }

  // Called from the audio thread. Returns false if the buffer is full, which
  // means the writer thread fell behind and samples were lost.
  bool Push(const float* data, size_t count) {
    const size_t cap = buffer_.size();
    if (cap == 0) return false;

    const size_t w = write_.load(std::memory_order_relaxed);
    const size_t r = read_.load(std::memory_order_acquire);
    const size_t used = (w - r + cap) % cap;
    if (used + count >= cap) return false;  // would overrun

    for (size_t i = 0; i < count; ++i) {
      buffer_[(w + i) % cap] = data[i];
    }
    write_.store((w + count) % cap, std::memory_order_release);
    return true;
  }

  // Called from the writer thread.
  size_t Pop(float* out, size_t max_count) {
    const size_t cap = buffer_.size();
    if (cap == 0) return 0;

    const size_t r = read_.load(std::memory_order_relaxed);
    const size_t w = write_.load(std::memory_order_acquire);
    const size_t available = (w - r + cap) % cap;
    const size_t count = available < max_count ? available : max_count;

    for (size_t i = 0; i < count; ++i) {
      out[i] = buffer_[(r + i) % cap];
    }
    read_.store((r + count) % cap, std::memory_order_release);
    return count;
  }

private:
  std::vector<float> buffer_;
  std::atomic<size_t> write_{0};
  std::atomic<size_t> read_{0};
};

// Streams 32-bit float WAV. Capture stays at float so nothing is quantised
// before mixing; dither belongs at final delivery, not at record time.
class WavStreamWriter {
public:
  bool Open(const std::string& path, int channels, double sample_rate) {
    file_ = std::fopen(path.c_str(), "wb");
    if (!file_) return false;
    channels_ = channels;
    sample_rate_ = sample_rate;
    frames_written_ = 0;
    WriteHeader(0);
    return true;
  }

  void Write(const float* data, size_t count) {
    if (!file_ || count == 0) return;
    std::fwrite(data, sizeof(float), count, file_);
    frames_written_ += count / (channels_ > 0 ? channels_ : 1);
  }

  void Close() {
    if (!file_) return;
    // Patch the RIFF/data sizes now that the length is known.
    std::fseek(file_, 0, SEEK_SET);
    WriteHeader(frames_written_);
    std::fclose(file_);
    file_ = nullptr;
  }

  uint64_t FramesWritten() const { return frames_written_; }

private:
  void WriteHeader(uint64_t frames) {
    const uint32_t data_bytes =
        static_cast<uint32_t>(frames * channels_ * sizeof(float));
    const uint32_t byte_rate =
        static_cast<uint32_t>(sample_rate_) * channels_ * sizeof(float);

    auto u32 = [&](uint32_t v) { std::fwrite(&v, 4, 1, file_); };
    auto u16 = [&](uint16_t v) { std::fwrite(&v, 2, 1, file_); };

    std::fwrite("RIFF", 1, 4, file_);
    u32(36 + data_bytes);
    std::fwrite("WAVE", 1, 4, file_);
    std::fwrite("fmt ", 1, 4, file_);
    u32(16);
    u16(3);  // IEEE float
    u16(static_cast<uint16_t>(channels_));
    u32(static_cast<uint32_t>(sample_rate_));
    u32(byte_rate);
    u16(static_cast<uint16_t>(channels_ * sizeof(float)));
    u16(32);
    std::fwrite("data", 1, 4, file_);
    u32(data_bytes);
  }

  std::FILE* file_ = nullptr;
  int channels_ = 0;
  double sample_rate_ = 48000.0;
  uint64_t frames_written_ = 0;
};

}  // namespace

class Recorder : public Napi::ObjectWrap<Recorder> {
public:
  static Napi::Object Init(Napi::Env env, Napi::Object exports) {
    Napi::Function func = DefineClass(env, "Recorder",
        {
            StaticMethod("listDevices", &Recorder::ListDevices),
            InstanceMethod("start", &Recorder::Start),
            InstanceMethod("stop", &Recorder::Stop),
            InstanceMethod("getStatus", &Recorder::GetStatus),
        });

    exports.Set("Recorder", func);
    return exports;
  }

  Recorder(const Napi::CallbackInfo& info) : Napi::ObjectWrap<Recorder>(info) {
    EnsureInitialised();
  }

  ~Recorder() { StopInternal(); }

  // listDevices() -> [{ index, name, maxInputChannels, defaultSampleRate, isDefaultInput }]
  static Napi::Value ListDevices(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    EnsureInitialised();

    const int count = Pa_GetDeviceCount();
    if (count < 0) {
      Napi::Error::New(env, Pa_GetErrorText(count)).ThrowAsJavaScriptException();
      return env.Null();
    }

    const int default_input = Pa_GetDefaultInputDevice();
    Napi::Array out = Napi::Array::New(env);
    uint32_t n = 0;

    for (int i = 0; i < count; ++i) {
      const PaDeviceInfo* dev = Pa_GetDeviceInfo(i);
      if (!dev || dev->maxInputChannels <= 0) continue;  // capture devices only

      Napi::Object entry = Napi::Object::New(env);
      entry.Set("index", Napi::Number::New(env, i));
      entry.Set("name", Napi::String::New(env, dev->name ? dev->name : "unknown"));
      entry.Set("maxInputChannels", Napi::Number::New(env, dev->maxInputChannels));
      entry.Set("defaultSampleRate", Napi::Number::New(env, dev->defaultSampleRate));
      entry.Set("lowInputLatencyMs",
                Napi::Number::New(env, dev->defaultLowInputLatency * 1000.0));
      entry.Set("isDefaultInput", Napi::Boolean::New(env, i == default_input));

      const PaHostApiInfo* host = Pa_GetHostApiInfo(dev->hostApi);
      entry.Set("hostApi", Napi::String::New(env, host && host->name ? host->name : ""));

      out.Set(n++, entry);
    }
    return out;
  }

  // start({ path, device?, channels?, sampleRate?, framesPerBuffer? })
  Napi::Value Start(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (running_.load()) {
      Napi::Error::New(env, "already recording").ThrowAsJavaScriptException();
      return env.Null();
    }
    if (info.Length() < 1 || !info[0].IsObject()) {
      Napi::TypeError::New(env, "options object expected").ThrowAsJavaScriptException();
      return env.Null();
    }

    Napi::Object opts = info[0].As<Napi::Object>();
    if (!opts.Has("path")) {
      Napi::TypeError::New(env, "options.path is required").ThrowAsJavaScriptException();
      return env.Null();
    }

    const std::string path = opts.Get("path").As<Napi::String>().Utf8Value();
    int device = opts.Has("device") ? opts.Get("device").As<Napi::Number>().Int32Value() : -1;
    if (device < 0) device = Pa_GetDefaultInputDevice();

    const PaDeviceInfo* dev = Pa_GetDeviceInfo(device);
    if (!dev) {
      Napi::Error::New(env, "invalid input device").ThrowAsJavaScriptException();
      return env.Null();
    }

    channels_ = opts.Has("channels") ? opts.Get("channels").As<Napi::Number>().Int32Value()
                                     : (dev->maxInputChannels >= 2 ? 2 : 1);
    if (channels_ < 1 || channels_ > dev->maxInputChannels) {
      Napi::Error::New(env, "device does not have that many input channels")
          .ThrowAsJavaScriptException();
      return env.Null();
    }

    sample_rate_ = opts.Has("sampleRate")
                       ? opts.Get("sampleRate").As<Napi::Number>().DoubleValue()
                       : dev->defaultSampleRate;
    const unsigned long frames_per_buffer =
        opts.Has("framesPerBuffer")
            ? opts.Get("framesPerBuffer").As<Napi::Number>().Uint32Value()
            : 256;

    if (!writer_.Open(path, channels_, sample_rate_)) {
      Napi::Error::New(env, "could not open output file: " + path)
          .ThrowAsJavaScriptException();
      return env.Null();
    }

    // Size the ring for ~4 seconds so a slow disk can stall without dropping.
    ring_.Resize(static_cast<size_t>(sample_rate_) * channels_ * 4);
    overruns_.store(0);
    frames_captured_.store(0);
    for (auto& p : peaks_) p.store(0.0f);

    PaStreamParameters params{};
    params.device = device;
    params.channelCount = channels_;
    params.sampleFormat = paFloat32;  // interleaved float, no conversion
    params.suggestedLatency = dev->defaultLowInputLatency;
    params.hostApiSpecificStreamInfo = nullptr;

    PaError err = Pa_OpenStream(&stream_, &params, nullptr, sample_rate_,
                                frames_per_buffer, paNoFlag, &Recorder::Callback, this);
    if (err != paNoError) {
      writer_.Close();
      Napi::Error::New(env, std::string("Pa_OpenStream: ") + Pa_GetErrorText(err))
          .ThrowAsJavaScriptException();
      return env.Null();
    }

    running_.store(true);
    writer_thread_ = std::thread(&Recorder::WriterLoop, this);

    err = Pa_StartStream(stream_);
    if (err != paNoError) {
      running_.store(false);
      if (writer_thread_.joinable()) writer_thread_.join();
      Pa_CloseStream(stream_);
      stream_ = nullptr;
      writer_.Close();
      Napi::Error::New(env, std::string("Pa_StartStream: ") + Pa_GetErrorText(err))
          .ThrowAsJavaScriptException();
      return env.Null();
    }

    const PaStreamInfo* si = Pa_GetStreamInfo(stream_);
    Napi::Object result = Napi::Object::New(env);
    result.Set("device", Napi::String::New(env, dev->name ? dev->name : ""));
    result.Set("channels", Napi::Number::New(env, channels_));
    result.Set("sampleRate", Napi::Number::New(env, sample_rate_));
    result.Set("inputLatencyMs",
               Napi::Number::New(env, si ? si->inputLatency * 1000.0 : 0.0));
    result.Set("path", Napi::String::New(env, path));
    return result;
  }

  Napi::Value Stop(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    const uint64_t frames = StopInternal();

    Napi::Object result = Napi::Object::New(env);
    result.Set("frames", Napi::Number::New(env, static_cast<double>(frames)));
    result.Set("seconds", Napi::Number::New(env, static_cast<double>(frames) / sample_rate_));
    result.Set("overruns", Napi::Number::New(env, overruns_.load()));
    return result;
  }

  // Live meter + dropout counter, safe to poll from JS while recording.
  Napi::Value GetStatus(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    Napi::Object result = Napi::Object::New(env);

    result.Set("recording", Napi::Boolean::New(env, running_.load()));
    result.Set("frames", Napi::Number::New(env, static_cast<double>(frames_captured_.load())));
    result.Set("seconds",
               Napi::Number::New(env, static_cast<double>(frames_captured_.load()) / sample_rate_));
    result.Set("overruns", Napi::Number::New(env, overruns_.load()));

    Napi::Array levels = Napi::Array::New(env, channels_);
    for (int c = 0; c < channels_ && c < kMaxChannels; ++c) {
      // Read and clear, so each poll reports peak since the last poll.
      const float peak = peaks_[c].exchange(0.0f);
      const float dbfs = peak > 0.0f ? 20.0f * std::log10(peak) : -120.0f;
      levels.Set(uint32_t(c), Napi::Number::New(env, dbfs));
    }
    result.Set("peakDbfs", levels);
    return result;
  }

private:
  static constexpr int kMaxChannels = 32;

  static void EnsureInitialised() {
    static bool initialised = false;
    if (!initialised) {
      Pa_Initialize();
      initialised = true;
      std::atexit([] { Pa_Terminate(); });
    }
  }

  // --- audio thread: no allocation, no locks, no I/O, no exceptions ---
  static int Callback(const void* input, void* /*output*/, unsigned long frame_count,
                      const PaStreamCallbackTimeInfo* /*time*/,
                      PaStreamCallbackFlags /*flags*/, void* user_data) {
    Recorder* self = static_cast<Recorder*>(user_data);
    if (!input) return paContinue;  // nothing captured this cycle

    const float* in = static_cast<const float*>(input);
    const size_t total = static_cast<size_t>(frame_count) * self->channels_;

    // Peak meter per channel (atomic max, no locking).
    for (unsigned long f = 0; f < frame_count; ++f) {
      for (int c = 0; c < self->channels_ && c < kMaxChannels; ++c) {
        const float mag = std::fabs(in[f * self->channels_ + c]);
        float prev = self->peaks_[c].load(std::memory_order_relaxed);
        while (mag > prev &&
               !self->peaks_[c].compare_exchange_weak(prev, mag, std::memory_order_relaxed)) {
        }
      }
    }

    if (!self->ring_.Push(in, total)) {
      // Writer fell behind. Count it rather than blocking the audio thread.
      self->overruns_.fetch_add(1, std::memory_order_relaxed);
    } else {
      self->frames_captured_.fetch_add(frame_count, std::memory_order_relaxed);
    }

    return paContinue;
  }

  // --- writer thread: normal priority, does the file I/O ---
  void WriterLoop() {
    std::vector<float> chunk(16384);
    while (running_.load(std::memory_order_acquire)) {
      const size_t got = ring_.Pop(chunk.data(), chunk.size());
      if (got > 0) {
        writer_.Write(chunk.data(), got);
      } else {
        std::this_thread::sleep_for(std::chrono::milliseconds(5));
      }
    }
    // Final drain after the stream stops.
    size_t got;
    while ((got = ring_.Pop(chunk.data(), chunk.size())) > 0) {
      writer_.Write(chunk.data(), got);
    }
  }

  uint64_t StopInternal() {
    if (!running_.load()) return writer_.FramesWritten();

    if (stream_) {
      Pa_StopStream(stream_);
      Pa_CloseStream(stream_);
      stream_ = nullptr;
    }

    running_.store(false, std::memory_order_release);
    if (writer_thread_.joinable()) writer_thread_.join();

    const uint64_t frames = writer_.FramesWritten();
    writer_.Close();
    return frames;
  }

  PaStream* stream_ = nullptr;
  RingBuffer ring_;
  WavStreamWriter writer_;
  std::thread writer_thread_;

  std::atomic<bool> running_{false};
  std::atomic<uint64_t> frames_captured_{0};
  std::atomic<int> overruns_{0};
  std::array<std::atomic<float>, kMaxChannels> peaks_{};

  int channels_ = 2;
  double sample_rate_ = 48000.0;
};

Napi::Object InitRecorder(Napi::Env env, Napi::Object exports) {
  return Recorder::Init(env, exports);
}
