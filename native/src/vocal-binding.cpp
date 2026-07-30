#include <napi.h>

#include <cstring>
#include <memory>

#include "echo/dsp/vocal-chain.h"

class VocalChainWrapper : public Napi::ObjectWrap<VocalChainWrapper> {
public:
  static Napi::Object Init(Napi::Env env, Napi::Object exports) {
    Napi::Function func = DefineClass(env, "VocalChain",
        {
            InstanceMethod("process", &VocalChainWrapper::Process),
            InstanceMethod("setSettings", &VocalChainWrapper::SetSettings),
            InstanceMethod("getReduction", &VocalChainWrapper::GetReduction),
            InstanceMethod("reset", &VocalChainWrapper::Reset),
        });

    exports.Set("VocalChain", func);
    return exports;
  }

  VocalChainWrapper(const Napi::CallbackInfo& info)
      : Napi::ObjectWrap<VocalChainWrapper>(info) {
    float sample_rate = 48000.0f;
    if (info.Length() > 0 && info[0].IsNumber()) {
      sample_rate = info[0].As<Napi::Number>().FloatValue();
    }
    chain_ = std::make_unique<EchoSoundLab::DSP::VocalChain>(sample_rate);
  }

private:
  std::unique_ptr<EchoSoundLab::DSP::VocalChain> chain_;

  Napi::Value Process(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (info.Length() < 1 || !info[0].IsTypedArray()) {
      Napi::TypeError::New(env, "Float32Array expected").ThrowAsJavaScriptException();
      return env.Null();
    }

    Napi::Float32Array in = info[0].As<Napi::Float32Array>();
    const size_t n = in.ElementLength();

    Napi::Float32Array out = Napi::Float32Array::New(env, n);
    std::memcpy(out.Data(), in.Data(), n * sizeof(float));
    chain_->ProcessBlock(out.Data(), n);
    return out;
  }

  Napi::Value SetSettings(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (info.Length() < 1 || !info[0].IsObject()) {
      Napi::TypeError::New(env, "settings object expected").ThrowAsJavaScriptException();
      return env.Null();
    }

    Napi::Object o = info[0].As<Napi::Object>();
    EchoSoundLab::DSP::VocalChain::Settings s = chain_->GetSettings();

    auto num = [&](const char* key, float& dest) {
      if (o.Has(key)) dest = o.Get(key).As<Napi::Number>().FloatValue();
    };
    auto boolean = [&](const char* key, bool& dest) {
      if (o.Has(key)) dest = o.Get(key).As<Napi::Boolean>().Value();
    };

    num("highpassHz", s.highpass_hz);
    boolean("deesserEnabled", s.deesser_enabled);
    num("deessFreqHz", s.deess_freq_hz);
    num("deessThresholdDb", s.deess_threshold_db);
    num("deessRatio", s.deess_ratio);
    num("deessRangeDb", s.deess_range_db);
    boolean("comp1Enabled", s.comp1_enabled);
    num("comp1ThresholdDb", s.comp1_threshold_db);
    num("comp1Ratio", s.comp1_ratio);
    num("comp1AttackMs", s.comp1_attack_ms);
    num("comp1ReleaseMs", s.comp1_release_ms);
    boolean("comp2Enabled", s.comp2_enabled);
    num("comp2ThresholdDb", s.comp2_threshold_db);
    num("comp2Ratio", s.comp2_ratio);
    num("comp2AttackMs", s.comp2_attack_ms);
    num("comp2ReleaseMs", s.comp2_release_ms);
    num("saturationAmount", s.saturation_amount);
    num("saturationDrive", s.saturation_drive);
    num("presenceGainDb", s.presence_gain_db);
    num("presenceHz", s.presence_hz);
    num("airGainDb", s.air_gain_db);
    num("airHz", s.air_hz);
    num("parallelBlend", s.parallel_blend);
    num("parallelThresholdDb", s.parallel_threshold_db);
    num("parallelRatio", s.parallel_ratio);
    num("outputGainDb", s.output_gain_db);

    chain_->SetSettings(s);
    return env.Undefined();
  }

  Napi::Value GetReduction(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    Napi::Object result = Napi::Object::New(env);
    result.Set("deesser", Napi::Number::New(env, chain_->GetDeEsserReduction()));
    result.Set("comp1", Napi::Number::New(env, chain_->GetCompressor1Reduction()));
    result.Set("comp2", Napi::Number::New(env, chain_->GetCompressor2Reduction()));
    return result;
  }

  Napi::Value Reset(const Napi::CallbackInfo& info) {
    chain_->Reset();
    return info.Env().Undefined();
  }
};

Napi::Object InitVocalChain(Napi::Env env, Napi::Object exports) {
  return VocalChainWrapper::Init(env, exports);
}
