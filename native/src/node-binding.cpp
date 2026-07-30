#include <napi.h>
#include "echo/mastering-engine.h"
#include <vector>
#include <cstring>

class MasteringEngineWrapper : public Napi::ObjectWrap<MasteringEngineWrapper> {
public:
  static Napi::Object Init(Napi::Env env, Napi::Object exports) {
    Napi::Function func = DefineClass(env, "MasteringEngine",
                                      {
                                          InstanceMethod("process", &MasteringEngineWrapper::Process),
                                          InstanceMethod("processStereo", &MasteringEngineWrapper::ProcessStereo),
                                          InstanceMethod("setLUFSTarget", &MasteringEngineWrapper::SetLUFSTarget),
                                          InstanceMethod("setSaturation", &MasteringEngineWrapper::SetSaturation),
                                          InstanceMethod("setLimiterThreshold", &MasteringEngineWrapper::SetLimiterThreshold),
                                          InstanceMethod("getMetrics", &MasteringEngineWrapper::GetMetrics),
                                          InstanceMethod("reset", &MasteringEngineWrapper::Reset),
                                      });

    Napi::FunctionReference* constructor = new Napi::FunctionReference();
    *constructor = Napi::Persistent(func);
    env.SetInstanceData(constructor);

    exports.Set("MasteringEngine", func);
    return exports;
  }

  MasteringEngineWrapper(const Napi::CallbackInfo& info) : Napi::ObjectWrap<MasteringEngineWrapper>(info) {
    Napi::Env env = info.Env();

    float sample_rate = 48000.0f;
    if (info.Length() > 0 && info[0].IsNumber()) {
      sample_rate = info[0].As<Napi::Number>().FloatValue();
    }

    engine_ = std::make_unique<EchoSoundLab::MasteringEngine>(sample_rate);
  }

private:
  std::unique_ptr<EchoSoundLab::MasteringEngine> engine_;

  Napi::Value Process(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (info.Length() < 1 || !info[0].IsTypedArray()) {
      Napi::TypeError::New(env, "Float32Array expected").ThrowAsJavaScriptException();
      return env.Null();
    }

    Napi::Float32Array input_array = info[0].As<Napi::Float32Array>();
    float* input_data = input_array.Data();
    size_t num_samples = input_array.ElementLength();

    int num_channels = 1;
    if (info.Length() > 1 && info[1].IsNumber()) {
      num_channels = info[1].As<Napi::Number>().Int32Value();
    }

    // Process
    std::vector<float> output = engine_->ProcessBlock(input_data, num_samples, num_channels);

    // Return as Float32Array
    Napi::Float32Array result = Napi::Float32Array::New(env, output.size());
    std::memcpy(result.Data(), output.data(), output.size() * sizeof(float));

    return result;
  }

  // processStereo(Float32Array left, Float32Array right) -> [left, right]
  Napi::Value ProcessStereo(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (info.Length() < 2 || !info[0].IsTypedArray() || !info[1].IsTypedArray()) {
      Napi::TypeError::New(env, "Two Float32Arrays expected (left, right)")
          .ThrowAsJavaScriptException();
      return env.Null();
    }

    Napi::Float32Array left = info[0].As<Napi::Float32Array>();
    Napi::Float32Array right = info[1].As<Napi::Float32Array>();

    if (left.ElementLength() != right.ElementLength()) {
      Napi::TypeError::New(env, "left and right must be the same length")
          .ThrowAsJavaScriptException();
      return env.Null();
    }

    const size_t num_samples = left.ElementLength();
    auto result = engine_->ProcessStereoBlock(left.Data(), right.Data(), num_samples);

    Napi::Float32Array out_l = Napi::Float32Array::New(env, result.first.size());
    Napi::Float32Array out_r = Napi::Float32Array::New(env, result.second.size());
    std::memcpy(out_l.Data(), result.first.data(), result.first.size() * sizeof(float));
    std::memcpy(out_r.Data(), result.second.data(), result.second.size() * sizeof(float));

    Napi::Array pair = Napi::Array::New(env, 2);
    pair.Set(uint32_t(0), out_l);
    pair.Set(uint32_t(1), out_r);
    return pair;
  }

  Napi::Value SetLUFSTarget(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (info.Length() < 1 || !info[0].IsNumber()) {
      Napi::TypeError::New(env, "Number expected").ThrowAsJavaScriptException();
      return env.Null();
    }

    float lufs = info[0].As<Napi::Number>().FloatValue();
    engine_->SetLUFSTarget(lufs);

    return env.Undefined();
  }

  Napi::Value SetSaturation(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (info.Length() < 2 || !info[0].IsNumber() || !info[1].IsNumber()) {
      Napi::TypeError::New(env, "Two Numbers expected").ThrowAsJavaScriptException();
      return env.Null();
    }

    float amount = info[0].As<Napi::Number>().FloatValue();
    float drive = info[1].As<Napi::Number>().FloatValue();
    engine_->SetSaturation(amount, drive);

    return env.Undefined();
  }

  Napi::Value SetLimiterThreshold(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (info.Length() < 1 || !info[0].IsNumber()) {
      Napi::TypeError::New(env, "Number expected").ThrowAsJavaScriptException();
      return env.Null();
    }

    engine_->SetLimiterThreshold(info[0].As<Napi::Number>().FloatValue());
    return env.Undefined();
  }

  Napi::Value GetMetrics(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    auto metrics = engine_->GetMetrics();

    Napi::Object result = Napi::Object::New(env);
    result.Set("momentary_lufs", Napi::Number::New(env, metrics.momentary_lufs));
    result.Set("short_term_lufs", Napi::Number::New(env, metrics.short_term_lufs));
    result.Set("integrated_lufs", Napi::Number::New(env, metrics.integrated_lufs));
    result.Set("loudness_range", Napi::Number::New(env, metrics.loudness_range));
    result.Set("true_peak", Napi::Number::New(env, metrics.true_peak));
    result.Set("true_peak_dbfs", Napi::Number::New(env, metrics.true_peak_dbfs));

    return result;
  }

  Napi::Value Reset(const Napi::CallbackInfo& info) {
    engine_->Reset();
    return info.Env().Undefined();
  }
};

// Defined in src/audio-io/recorder.cpp and src/vocal-binding.cpp
Napi::Object InitRecorder(Napi::Env env, Napi::Object exports);
Napi::Object InitVocalChain(Napi::Env env, Napi::Object exports);

Napi::Object Init(Napi::Env env, Napi::Object exports) {
  MasteringEngineWrapper::Init(env, exports);
  InitRecorder(env, exports);
  InitVocalChain(env, exports);
  return exports;
}

NODE_API_MODULE(echo_sound_lab, Init);
