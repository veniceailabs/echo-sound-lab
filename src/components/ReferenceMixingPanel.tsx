import React, { useState, useCallback } from 'react';
import { referenceAnalyzerV2, AdvancedReferenceAnalysis } from '../services/referenceAnalyzerV2';
import { stemMixerService, Stem, StemRole } from '../services/stemMixer';
import { fxMatchingEngine, FXMatchResult } from '../services/fxMatchingEngine';
import { audioEngine } from '../services/audioEngine';

interface ReferenceMixingPanelProps {
  onProcessingComplete?: (buffer: AudioBuffer) => void;
}

const STEM_ROLE_LABELS: Record<StemRole, string> = {
  lead_vocal: 'Lead Vocal',
  background_vocal: 'Background Vocals',
  adlibs: 'Adlibs',
  beat: 'Beat/Instrumental',
  bass: 'Bass',
  drums: 'Drums',
  melody: 'Melody/Synths',
  fx: 'FX/Atmosphere',
  other: 'Other'
};

export const ReferenceMixingPanel: React.FC<ReferenceMixingPanelProps> = ({ onProcessingComplete }) => {
  const [referenceFile, setReferenceFile] = useState<File | null>(null);
  const [referenceAnalysis, setReferenceAnalysis] = useState<AdvancedReferenceAnalysis | null>(null);
  const [fxMatch, setFxMatch] = useState<FXMatchResult | null>(null);
  const [stems, setStems] = useState<Stem[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isMixing, setIsMixing] = useState(false);
  const [activeTab, setActiveTab] = useState<'reference' | 'stems' | 'mix'>('reference');
  const [mixResult, setMixResult] = useState<{ peakDb: string; rmsDb: string; clipped: boolean } | null>(null);

  // Handle reference file upload
  const handleReferenceUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setReferenceFile(file);
    setIsAnalyzing(true);
    setReferenceAnalysis(null);
    setFxMatch(null);

    try {
      const arrayBuffer = await file.arrayBuffer();
      const audioContext = new AudioContext();
      const buffer = await audioContext.decodeAudioData(arrayBuffer);

      // Run advanced analysis
      const analysis = await referenceAnalyzerV2.analyzeReference(buffer);
      setReferenceAnalysis(analysis);

      // Generate FX match
      const match = await fxMatchingEngine.matchReference(buffer);
      setFxMatch(match);

    } catch (error) {
      console.error('Failed to analyze reference:', error);
    } finally {
      setIsAnalyzing(false);
    }
  }, []);

  // Handle stem upload
  const handleStemUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    const fileArray = Array.from(files) as File[];
    for (const file of fileArray) {
      try {
        const arrayBuffer = await file.arrayBuffer();
        const audioContext = new AudioContext();
        const buffer = await audioContext.decodeAudioData(arrayBuffer);

        // Auto-detect role (async)
        const detectedRole = await stemMixerService.detectStemRole(buffer);
        stemMixerService.addStem(file.name, buffer, detectedRole);
        setStems(stemMixerService.getStems());
      } catch (error) {
        console.error(`Failed to load stem ${(file as File).name}:`, error);
      }
    }
  }, []);

  // Update stem settings
  const updateStemSetting = useCallback((stemId: string, field: keyof Stem, value: any) => {
    stemMixerService.updateStem(stemId, { [field]: value });
    setStems(stemMixerService.getStems());
  }, []);

  // Remove stem
  const removeStem = useCallback((stemId: string) => {
    stemMixerService.removeStem(stemId);
    setStems(stemMixerService.getStems());
  }, []);

  // Apply reference mix levels
  const applyReferenceLevels = useCallback(async () => {
    if (!referenceAnalysis) return;

    const suggestions = stemMixerService.suggestMixLevels(referenceAnalysis);
    for (const stem of stems) {
      const suggestion = suggestions.get(stem.role);
      if (suggestion) {
        stemMixerService.updateStem(stem.id, suggestion);
      }
    }
    setStems(stemMixerService.getStems());
  }, [referenceAnalysis, stems]);

  // Render mixdown
  const renderMixdown = useCallback(async () => {
    if (stems.length === 0) return;

    setIsMixing(true);
    try {
      const result = await stemMixerService.renderMixdown({
        reverbDecay: referenceAnalysis?.reverb.decayTime ?? 1.5,
        reverbMix: referenceAnalysis?.reverb.wetDryRatio ?? 0.2,
        delayTimeMs: referenceAnalysis?.delay.delayTimeMs ?? 250,
        delayFeedback: referenceAnalysis?.delay.feedback ?? 0.3
      });

      const peakDb = 20 * Math.log10(result.peakLevel);
      const rmsDb = 20 * Math.log10(result.rmsLevel);

      setMixResult({
        peakDb: peakDb.toFixed(1),
        rmsDb: rmsDb.toFixed(1),
        clipped: result.clipped
      });

      // Set buffer for playback/export
      audioEngine.setBuffer(result.buffer);
      onProcessingComplete?.(result.buffer);

    } catch (error) {
      console.error('Mixdown failed:', error);
    } finally {
      setIsMixing(false);
    }
  }, [stems, referenceAnalysis, onProcessingComplete]);

  return (
    <div className="bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden">
      {/* Tab Navigation */}
      <div className="flex border-b border-slate-800">
        {(['reference', 'stems', 'mix'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 px-4 py-3 text-sm font-bold uppercase tracking-wider transition-all ${
              activeTab === tab
                ? 'bg-slate-800 text-white border-b-2 border-orange-500'
                : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            {tab === 'reference' && 'Reference Track'}
            {tab === 'stems' && `Stems (${stems.length})`}
            {tab === 'mix' && 'Mix & Export'}
          </button>
        ))}
      </div>

      <div className="p-6">
        {/* Reference Tab */}
        {activeTab === 'reference' && (
          <div className="space-y-6">
            <div className="text-center">
              <h3 className="text-lg font-bold text-white mb-2">Upload Reference Track</h3>
              <p className="text-sm text-slate-400 mb-4">
                Upload the track you want to match. We'll analyze its reverb, delay, vocal treatment, and dynamics.
              </p>

              <label className="inline-block px-6 py-3 bg-slate-900 text-orange-400 font-bold rounded-xl shadow-[4px_4px_12px_rgba(0,0,0,0.5),_1px_1px_3px_rgba(255,255,255,0.03)] hover:shadow-[6px_6px_16px_rgba(0,0,0,0.6),_2px_2px_4px_rgba(255,255,255,0.04)] hover:text-orange-300 active:shadow-[inset_2px_2px_6px_rgba(0,0,0,0.8),inset_-1px_-1px_3px_rgba(255,255,255,0.02)] active:translate-y-[1px] cursor-pointer transition-all uppercase tracking-wider text-xs">
                {referenceFile ? referenceFile.name : 'Choose Reference Track'}
                <input
                  type="file"
                  accept="audio/*"
                  onChange={handleReferenceUpload}
                  className="hidden"
                />
              </label>
            </div>

            {isAnalyzing && (
              <div className="text-center py-8">
                <div className="animate-spin w-8 h-8 border-4 border-slate-700 border-t-orange-500 rounded-full mx-auto mb-4" />
                <p className="text-slate-400">Analyzing reference track...</p>
              </div>
            )}

            {referenceAnalysis && (
              <div className="space-y-4">
                {/* BPM & Character */}
                <div className="grid grid-cols-3 gap-4">
                  <div className="bg-slate-800/50 p-4 rounded-xl text-center">
                    <div className="text-2xl font-bold text-white">{referenceAnalysis.estimatedBPM}</div>
                    <div className="text-xs text-slate-500 uppercase">BPM</div>
                  </div>
                  <div className="bg-slate-800/50 p-4 rounded-xl text-center">
                    <div className="text-lg font-bold text-orange-400 capitalize">{referenceAnalysis.overallCharacter.space}</div>
                    <div className="text-xs text-slate-500 uppercase">Space</div>
                  </div>
                  <div className="bg-slate-800/50 p-4 rounded-xl text-center">
                    <div className="text-lg font-bold text-blue-400 capitalize">{referenceAnalysis.overallCharacter.energy}</div>
                    <div className="text-xs text-slate-500 uppercase">Energy</div>
                  </div>
                </div>

                {/* Reverb Analysis */}
                <div className="bg-slate-800/30 p-4 rounded-xl">
                  <h4 className="text-sm font-bold text-slate-300 uppercase mb-3">Reverb</h4>
                  {referenceAnalysis.reverb.detected ? (
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <span className="text-slate-500">Type:</span>
                        <span className="ml-2 text-white capitalize">{referenceAnalysis.reverb.character}</span>
                      </div>
                      <div>
                        <span className="text-slate-500">Decay:</span>
                        <span className="ml-2 text-white">{referenceAnalysis.reverb.decayTime.toFixed(1)}s</span>
                      </div>
                      <div>
                        <span className="text-slate-500">Pre-delay:</span>
                        <span className="ml-2 text-white">{Math.round(referenceAnalysis.reverb.preDelay)}ms</span>
                      </div>
                      <div>
                        <span className="text-slate-500">Wet/Dry:</span>
                        <span className="ml-2 text-white">{Math.round(referenceAnalysis.reverb.wetDryRatio * 100)}%</span>
                      </div>
                    </div>
                  ) : (
                    <p className="text-slate-500">No significant reverb detected - dry mix</p>
                  )}
                </div>

                {/* Delay Analysis */}
                <div className="bg-slate-800/30 p-4 rounded-xl">
                  <h4 className="text-sm font-bold text-slate-300 uppercase mb-3">Delay</h4>
                  {referenceAnalysis.delay.detected ? (
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <span className="text-slate-500">Type:</span>
                        <span className="ml-2 text-white capitalize">{referenceAnalysis.delay.type}</span>
                      </div>
                      <div>
                        <span className="text-slate-500">Time:</span>
                        <span className="ml-2 text-white">{referenceAnalysis.delay.delayTimeMs}ms</span>
                        {referenceAnalysis.delay.delayTimeBPM && (
                          <span className="ml-1 text-orange-400">(synced)</span>
                        )}
                      </div>
                      <div>
                        <span className="text-slate-500">Feedback:</span>
                        <span className="ml-2 text-white">{Math.round(referenceAnalysis.delay.feedback * 100)}%</span>
                      </div>
                      <div>
                        <span className="text-slate-500">Stereo:</span>
                        <span className="ml-2 text-white">{referenceAnalysis.delay.stereoSpread > 0.4 ? 'Yes' : 'No'}</span>
                      </div>
                    </div>
                  ) : (
                    <p className="text-slate-500">No significant delay detected</p>
                  )}
                </div>

                {/* Sidechain Analysis */}
                {referenceAnalysis.sidechain.detected && (
                  <div className="bg-orange-500/10 border border-orange-500/30 p-4 rounded-xl">
                    <h4 className="text-sm font-bold text-orange-400 uppercase mb-2">Sidechain Detected</h4>
                    <p className="text-sm text-slate-300">
                      {referenceAnalysis.sidechain.amount.toFixed(1)}dB ducking with {referenceAnalysis.sidechain.releaseMs}ms release
                    </p>
                  </div>
                )}

                {/* FX Match Summary */}
                {fxMatch && (
                  <div className="bg-green-500/10 border border-green-500/30 p-4 rounded-xl">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-sm font-bold text-green-400 uppercase">FX Match Ready</h4>
                      <span className="text-xs bg-green-500/20 text-green-400 px-2 py-1 rounded">
                        {fxMatch.matchConfidence}% confidence
                      </span>
                    </div>
                    <p className="text-sm text-slate-300">
                      {fxMatch.explanations.slice(0, 3).join(' ')}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Stems Tab */}
        {activeTab === 'stems' && (
          <div className="space-y-6">
            <div className="text-center">
              <label className="inline-block px-6 py-3 bg-slate-800 text-white font-bold rounded-xl cursor-pointer hover:bg-slate-700 transition-all border border-slate-700">
                Add Stems
                <input
                  type="file"
                  accept="audio/*"
                  multiple
                  onChange={handleStemUpload}
                  className="hidden"
                />
              </label>
              <p className="text-xs text-slate-500 mt-2">Upload vocals, beat, bass, etc.</p>
            </div>

            {stems.length > 0 && (
              <div className="space-y-3">
                {stems.map((stem) => (
                  <div key={stem.id} className="bg-slate-800/50 p-4 rounded-xl">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <span className="font-bold text-white truncate max-w-[200px]">{stem.name}</span>
                        <select
                          value={stem.role}
                          onChange={(e) => updateStemSetting(stem.id, 'role', e.target.value)}
                          className="bg-slate-700 text-sm text-white px-2 py-1 rounded"
                        >
                          {Object.entries(STEM_ROLE_LABELS).map(([value, label]) => (
                            <option key={value} value={value}>{label}</option>
                          ))}
                        </select>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => updateStemSetting(stem.id, 'muted', !stem.muted)}
                          className={`px-2 py-1 text-xs rounded ${stem.muted ? 'bg-red-500 text-white' : 'bg-slate-700 text-slate-400'}`}
                        >
                          M
                        </button>
                        <button
                          onClick={() => updateStemSetting(stem.id, 'solo', !stem.solo)}
                          className={`px-2 py-1 text-xs rounded ${stem.solo ? 'bg-yellow-500 text-black' : 'bg-slate-700 text-slate-400'}`}
                        >
                          S
                        </button>
                        <button
                          onClick={() => removeStem(stem.id)}
                          className="px-2 py-1 text-xs bg-slate-700 text-red-400 rounded hover:bg-red-500 hover:text-white"
                        >
                          X
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-4 gap-4">
                      <div>
                        <label className="text-xs text-slate-500">Volume</label>
                        <input
                          type="range"
                          min="-24"
                          max="12"
                          step="0.5"
                          value={stem.volume}
                          onChange={(e) => updateStemSetting(stem.id, 'volume', parseFloat(e.target.value))}
                          className="w-full"
                        />
                        <div className="text-xs text-center text-slate-400">{stem.volume > 0 ? '+' : ''}{stem.volume}dB</div>
                      </div>
                      <div>
                        <label className="text-xs text-slate-500">Pan</label>
                        <input
                          type="range"
                          min="-1"
                          max="1"
                          step="0.1"
                          value={stem.pan}
                          onChange={(e) => updateStemSetting(stem.id, 'pan', parseFloat(e.target.value))}
                          className="w-full"
                        />
                        <div className="text-xs text-center text-slate-400">
                          {stem.pan < -0.1 ? 'L' : stem.pan > 0.1 ? 'R' : 'C'}
                        </div>
                      </div>
                      <div>
                        <label className="text-xs text-slate-500">Reverb Send</label>
                        <input
                          type="range"
                          min="0"
                          max="1"
                          step="0.05"
                          value={stem.reverbSend}
                          onChange={(e) => updateStemSetting(stem.id, 'reverbSend', parseFloat(e.target.value))}
                          className="w-full"
                        />
                        <div className="text-xs text-center text-slate-400">{Math.round(stem.reverbSend * 100)}%</div>
                      </div>
                      <div>
                        <label className="text-xs text-slate-500">Delay Send</label>
                        <input
                          type="range"
                          min="0"
                          max="1"
                          step="0.05"
                          value={stem.delaySend}
                          onChange={(e) => updateStemSetting(stem.id, 'delaySend', parseFloat(e.target.value))}
                          className="w-full"
                        />
                        <div className="text-xs text-center text-slate-400">{Math.round(stem.delaySend * 100)}%</div>
                      </div>
                    </div>
                  </div>
                ))}

                {referenceAnalysis && (
                  <button
                    onClick={applyReferenceLevels}
                    className="w-full py-3 bg-orange-500 hover:bg-orange-600 text-white font-bold rounded-xl transition-all"
                  >
                    Apply Reference Mix Levels
                  </button>
                )}
              </div>
            )}

            {stems.length === 0 && (
              <div className="text-center py-8 text-slate-500">
                No stems loaded. Upload your vocal, beat, and other stems.
              </div>
            )}
          </div>
        )}

        {/* Mix Tab */}
        {activeTab === 'mix' && (
          <div className="space-y-6">
            {stems.length === 0 ? (
              <div className="text-center py-8 text-slate-500">
                Add stems first to create a mixdown.
              </div>
            ) : (
              <>
                <div className="bg-slate-800/50 p-4 rounded-xl">
                  <h4 className="text-sm font-bold text-slate-300 uppercase mb-3">Mix Summary</h4>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-slate-500">Active Stems:</span>
                      <span className="ml-2 text-white">{stems.filter(s => !s.muted).length}</span>
                    </div>
                    <div>
                      <span className="text-slate-500">Reference:</span>
                      <span className="ml-2 text-white">{referenceAnalysis ? 'Loaded' : 'None'}</span>
                    </div>
                  </div>
                </div>

                <button
                  onClick={renderMixdown}
                  disabled={isMixing}
                  className="w-full py-4 bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-white font-bold rounded-xl transition-all disabled:opacity-50"
                >
                  {isMixing ? 'Rendering...' : 'Render Mixdown'}
                </button>

                {mixResult && (
                  <div className={`p-4 rounded-xl ${mixResult.clipped ? 'bg-red-500/20 border border-red-500/30' : 'bg-green-500/20 border border-green-500/30'}`}>
                    <h4 className="text-sm font-bold mb-2 ${mixResult.clipped ? 'text-red-400' : 'text-green-400'}">
                      {mixResult.clipped ? 'Mixdown Complete (Clipping Detected!)' : 'Mixdown Complete'}
                    </h4>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-slate-500">Peak:</span>
                        <span className="ml-2 text-white">{mixResult.peakDb} dB</span>
                      </div>
                      <div>
                        <span className="text-slate-500">RMS:</span>
                        <span className="ml-2 text-white">{mixResult.rmsDb} dB</span>
                      </div>
                    </div>
                    {mixResult.clipped && (
                      <p className="text-xs text-red-400 mt-2">Reduce stem volumes to avoid clipping.</p>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
