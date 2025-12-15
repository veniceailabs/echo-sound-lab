import React from 'react';
import { AnalysisResult, AudioMetrics, Suggestion, MixReadiness, ReferenceTrack } from '../types';

// White Plugin Icons for AI Recommendations
const PluginIcon: React.FC<{ category: string }> = ({ category }) => {
  const getCategoryIcon = () => {
    const type = category.toUpperCase();

    // Match common variations
    if (type.includes('EQ') && !type.includes('DYNAMIC')) {
      return (
        <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
          <path d="M2 12 Q 6 8, 8 12 T 12 12 Q 14 16, 16 12 T 20 12 L 22 12" strokeLinecap="round"/>
          <circle cx="8" cy="12" r="1.5" fill="currentColor"/>
          <circle cx="12" cy="12" r="1.5" fill="currentColor"/>
          <circle cx="16" cy="12" r="1.5" fill="currentColor"/>
        </svg>
      );
    } else if (type.includes('COMPRESS') || type.includes('DYNAMIC')) {
      return (
        <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
          <path d="M4 20 L 10 10 L 20 6" strokeLinecap="round"/>
          <path d="M4 4 L 20 20" stroke="currentColor" strokeWidth="1" opacity="0.3" strokeDasharray="2,2"/>
        </svg>
      );
    } else if (type.includes('LIMIT')) {
      return (
        <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
          <path d="M4 20 L 10 10 L 14 6 L 20 6" strokeLinecap="round"/>
          <line x1="14" y1="3" x2="14" y2="21" stroke="currentColor" strokeWidth="1" opacity="0.5"/>
        </svg>
      );
    } else if (type.includes('STEREO') || type.includes('IMAG')) {
      return (
        <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
          <path d="M12 6 L 12 18" strokeLinecap="round"/>
          <path d="M6 12 L 2 12 M 2 8 L 2 16" strokeLinecap="round"/>
          <path d="M18 12 L 22 12 M 22 8 L 22 16" strokeLinecap="round"/>
          <path d="M8 10 L 6 12 L 8 14" strokeLinecap="round" fill="none"/>
          <path d="M16 10 L 18 12 L 16 14" strokeLinecap="round" fill="none"/>
        </svg>
      );
    } else if (type.includes('SATUR')) {
      return (
        <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
          <path d="M2 12 Q 4 6, 6 12 T 10 12 Q 12 18, 14 12 T 18 12 Q 20 6, 22 12" strokeLinecap="round"/>
          <path d="M2 12 Q 4 8, 6 12 T 10 12 Q 12 16, 14 12 T 18 12 Q 20 8, 22 12" strokeLinecap="round" opacity="0.4"/>
        </svg>
      );
    } else if (type.includes('REVERB')) {
      return (
        <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
          <circle cx="12" cy="12" r="3" strokeWidth="2"/>
          <circle cx="12" cy="12" r="6" strokeWidth="1.5" opacity="0.6"/>
          <circle cx="12" cy="12" r="9" strokeWidth="1" opacity="0.3"/>
        </svg>
      );
    } else if (type.includes('DE-ESS') || type.includes('DEESS')) {
      return (
        <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
          <path d="M8 7 Q 12 5, 12 9 Q 12 13, 8 11 Q 4 13, 8 17 Q 12 19, 12 15 Q 12 11, 16 13" strokeLinecap="round"/>
          <path d="M18 4 L 14 20" strokeLinecap="round"/>
        </svg>
      );
    } else if (type.includes('TRANSIENT')) {
      return (
        <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
          <path d="M2 20 L 8 16 L 12 4 L 14 20 L 22 20" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      );
    } else if (type.includes('MULTIBAND')) {
      return (
        <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
          <path d="M2 20 L 6 14" strokeLinecap="round"/>
          <path d="M8 20 L 12 10 L 14 8" strokeLinecap="round"/>
          <path d="M16 20 L 20 12 L 22 10" strokeLinecap="round"/>
        </svg>
      );
    } else if (type.includes('DELAY')) {
      return (
        <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
          <circle cx="6" cy="12" r="2" fill="currentColor"/>
          <circle cx="12" cy="12" r="1.5" fill="currentColor" opacity="0.7"/>
          <circle cx="17" cy="12" r="1" fill="currentColor" opacity="0.4"/>
          <path d="M8 12 L 10.5 12 M 13.5 12 L 16 12" strokeLinecap="round"/>
        </svg>
      );
    } else if (type.includes('EXCIT')) {
      return (
        <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
          <path d="M2 12 Q 6 6, 10 12 T 18 12" strokeLinecap="round"/>
          <path d="M2 12 Q 6 10, 10 12 T 18 12" strokeLinecap="round" opacity="0.5"/>
          <path d="M18 8 L 22 4 M 18 12 L 22 12 M 18 16 L 22 20" strokeLinecap="round" strokeWidth="1.5"/>
        </svg>
      );
    }

    // Default icon for unknown categories
    return (
      <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
        <circle cx="12" cy="12" r="8"/>
        <path d="M12 8 L 12 12 L 15 15" strokeLinecap="round"/>
      </svg>
    );
  };

  return <div className="w-5 h-5 flex-shrink-0">{getCategoryIcon()}</div>;
};

interface AnalysisPanelProps {
  analysisResult: AnalysisResult | null;
  onReferenceUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  referenceMetrics: AudioMetrics | null;
  referenceTrack?: ReferenceTrack | null;
  onClearReference?: () => void;
  isLoadingReference?: boolean;
  onApplySuggestions: () => Promise<boolean>;
  onToggleSuggestion: (id: string) => void;
  appliedSuggestionIds: string[];
  isProcessing: boolean;
  applySuggestionsError: string | null;
  selectedSuggestionCount: number;
  mixReadiness: MixReadiness;
  onRequestAIAnalysis?: () => void;
  echoReportStatus?: 'idle' | 'loading' | 'success' | 'error';
}

const AnalysisPanel: React.FC<AnalysisPanelProps> = ({
  analysisResult,
  onReferenceUpload,
  referenceMetrics,
  referenceTrack,
  onClearReference,
  isLoadingReference,
  onApplySuggestions,
  onToggleSuggestion,
  appliedSuggestionIds,
  isProcessing,
  applySuggestionsError,
  selectedSuggestionCount,
  onRequestAIAnalysis,
  echoReportStatus
}) => {
  if (!analysisResult) return null;

  return (
    <div className="bg-gradient-to-br from-slate-900/90 to-slate-800/90 backdrop-blur-xl rounded-3xl p-8 shadow-[6px_6px_20px_rgba(0,0,0,0.4),-2px_-2px_10px_rgba(255,255,255,0.02)] border border-slate-700/30 mb-6">
      {/* AI Recommendations - First */}
      <div className="mb-8 border-b border-slate-700/50 pb-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500 to-pink-500 flex items-center justify-center shadow-lg">
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
          </div>
          <div>
            <h3 className="text-lg font-black text-white tracking-tight">AI Recommendations</h3>
            <p className="text-xs text-slate-400">Powered by Gemini</p>
          </div>
        </div>

        {analysisResult.genrePrediction === 'Ready for Analysis' && analysisResult.suggestions.length === 0 ? (
          <div className="text-center py-12 px-4">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-orange-500/20 to-pink-500/20 flex items-center justify-center mx-auto mb-4 border border-orange-500/30">
              <svg className="w-8 h-8 text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <p className="text-slate-300 text-base font-semibold mb-2">Ready for AI Analysis</p>
            <p className="text-slate-500 text-sm mb-6 max-w-sm mx-auto">Let AI analyze your track and suggest professional improvements</p>
            <button
              onClick={onRequestAIAnalysis}
              className="relative overflow-hidden bg-gradient-to-r from-orange-500 to-orange-600 text-white font-bold py-4 px-8 rounded-xl shadow-[0_4px_20px_rgba(251,146,60,0.3)] hover:shadow-[0_8px_40px_rgba(251,146,60,0.5)] hover:from-orange-600 hover:to-orange-700 active:scale-[0.98] transition-all duration-300 ease-out uppercase tracking-wider text-sm backdrop-blur-xl border border-orange-400/20 before:absolute before:inset-0 before:bg-gradient-to-r before:from-transparent before:via-white/20 before:to-transparent before:-translate-x-full hover:before:translate-x-full before:transition-transform before:duration-700 before:ease-out before:pointer-events-none"
            >
              <span className="relative z-10">Analyze with AI</span>
            </button>
          </div>
        ) : analysisResult.genrePrediction === 'Analyzing...' && analysisResult.suggestions.length === 0 ? (
          <div className="text-center py-12">
            <div className="relative w-16 h-16 mx-auto mb-4">
              <div className="absolute inset-0 rounded-full bg-gradient-to-r from-orange-500 to-pink-500 opacity-20 animate-pulse" />
              <div className="absolute inset-2 rounded-full border-4 border-transparent border-t-orange-500 border-r-pink-500 animate-spin" />
            </div>
            <p className="text-slate-200 font-semibold mb-1">Analyzing your track...</p>
            <p className="text-slate-500 text-sm">This may take a few moments</p>
          </div>
        ) : (
          <>
            <div className="space-y-3">
              {analysisResult.suggestions.map((suggestion: Suggestion) => {
                const isApplied = appliedSuggestionIds.includes(suggestion.id);
                return (
                  <div
                    key={suggestion.id}
                    className={`group relative bg-gradient-to-br from-slate-800/80 to-slate-800/50 backdrop-blur-sm p-5 rounded-xl border transition-all duration-300 ${
                      isApplied
                        ? 'opacity-60 border-green-500/20 bg-green-900/10'
                        : 'border-slate-700/50 hover:shadow-[0_0_20px_rgba(251,146,60,0.1)]'
                    }`}
                  >
                    <div className="flex items-start gap-4">
                      <div className="pt-1">
                        <input
                          type="checkbox"
                          checked={suggestion.isSelected}
                          onChange={() => onToggleSuggestion(suggestion.id)}
                          disabled={isApplied || isProcessing}
                          className={`form-checkbox h-5 w-5 text-orange-500 rounded-lg bg-slate-900/50 border-slate-600 focus:ring-2 focus:ring-orange-500/50 transition-all ${
                            isApplied ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:border-orange-500/50'
                          }`}
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2 flex-wrap">
                          <span className="text-white bg-gradient-to-r from-orange-500 to-orange-600 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider shadow-lg flex items-center gap-1.5">
                            {suggestion.category}
                            <span className="text-sm">✨</span>
                          </span>
                          {isApplied && (
                            <span className="text-green-400 text-xs font-bold flex items-center gap-1 bg-green-900/30 px-2 py-1 rounded-full">
                              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                              </svg>
                              Applied
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-slate-200 leading-relaxed">{suggestion.description}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
              {analysisResult.suggestions.length === 0 && analysisResult.genrePrediction !== 'Analyzing...' && (
                <div className="text-center py-12 px-4">
                  <div className="w-16 h-16 rounded-2xl bg-green-500/10 flex items-center justify-center mx-auto mb-4 border border-green-500/30">
                    <svg className="w-8 h-8 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <p className="text-slate-300 font-semibold mb-1">Looking Good!</p>
                  <p className="text-slate-500 text-sm">No critical issues detected in your mix</p>
                </div>
              )}
            </div>

            {analysisResult.suggestions.length > 0 && (
              <div className="mt-6">
                {(() => {
                  const areAllSelectedApplied = selectedSuggestionCount > 0 && analysisResult.suggestions
                    .filter((s: Suggestion) => s.isSelected)
                    .every((s: Suggestion) => appliedSuggestionIds.includes(s.id));

                  return (
                    <button
                      onClick={onApplySuggestions}
                      disabled={isProcessing || selectedSuggestionCount === 0 || areAllSelectedApplied}
                      className={`relative overflow-hidden w-full font-bold py-4 rounded-xl transition-all duration-300 ease-out flex items-center justify-center gap-2 text-sm uppercase tracking-wider shadow-lg ${
                        areAllSelectedApplied
                          ? 'bg-gradient-to-r from-green-600 to-green-700 text-white cursor-default shadow-[0_4px_20px_rgba(34,197,94,0.3)]'
                          : isProcessing
                            ? 'bg-gradient-to-r from-orange-500 to-orange-600 text-white shadow-[0_4px_20px_rgba(251,146,60,0.3)]'
                            : selectedSuggestionCount === 0
                              ? 'bg-slate-700/50 text-slate-500 cursor-not-allowed'
                              : 'bg-gradient-to-r from-orange-500 to-orange-600 text-white hover:from-orange-600 hover:to-orange-700 hover:shadow-[0_8px_40px_rgba(251,146,60,0.5)] active:scale-[0.98] backdrop-blur-xl border border-orange-400/20 before:absolute before:inset-0 before:bg-gradient-to-r before:from-transparent before:via-white/20 before:to-transparent before:-translate-x-full hover:before:translate-x-full before:transition-transform before:duration-700 before:ease-out'
                      }`}
                    >
                      <span className="relative z-10 flex items-center justify-center gap-2">
                        {isProcessing ? (
                          <>
                            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            Applying Changes...
                          </>
                        ) : areAllSelectedApplied ? (
                          <>
                            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                            Fixes Applied
                          </>
                        ) : (
                          `Apply ${selectedSuggestionCount > 0 ? `${selectedSuggestionCount} Selected Fix${selectedSuggestionCount > 1 ? 'es' : ''}` : 'Selected Fixes'}`
                        )}
                      </span>
                    </button>
                  );
                })()}
                {applySuggestionsError && (
                  <div className="mt-3 p-3 bg-red-900/20 border border-red-500/30 rounded-lg">
                    <p className="text-red-400 text-xs font-medium">{applySuggestionsError}</p>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Reference Track - Second - Hidden when Echo Report is active */}
      {(echoReportStatus !== 'loading' && echoReportStatus !== 'success') && (
      <div>
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center shadow-lg">
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
            </svg>
          </div>
          <div>
            <h3 className="text-lg font-black text-white tracking-tight">Reference Track</h3>
            <p className="text-xs text-slate-400">Optional AI matching</p>
          </div>
        </div>

        {!referenceTrack ? (
          <label className={`group block relative overflow-hidden bg-gradient-to-br from-slate-800/50 to-slate-800/30 backdrop-blur-sm border-2 border-dashed rounded-2xl p-8 cursor-pointer transition-all duration-300 ${
            isLoadingReference
              ? 'opacity-50 pointer-events-none'
              : 'border-slate-700/50 hover:border-purple-500/50 hover:bg-slate-800/60 hover:shadow-[0_0_30px_rgba(168,85,247,0.1)]'
          }`}>
            <input
              type="file"
              onChange={onReferenceUpload}
              className="hidden"
              accept="audio/*"
              disabled={isLoadingReference}
            />
            <div className="text-center relative z-10">
              {isLoadingReference ? (
                <>
                  <div className="relative w-12 h-12 mx-auto mb-3">
                    <div className="absolute inset-0 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 opacity-20 animate-pulse" />
                    <div className="absolute inset-2 rounded-full border-4 border-transparent border-t-purple-500 border-r-pink-500 animate-spin" />
                  </div>
                  <p className="text-slate-300 font-semibold">Loading reference...</p>
                </>
              ) : (
                <>
                  <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-500/20 to-pink-500/20 flex items-center justify-center mx-auto mb-4 border border-purple-500/30 group-hover:scale-110 transition-transform duration-300">
                    <svg className="w-8 h-8 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                  </div>
                  <p className="text-slate-200 text-base font-semibold mb-1">Drop a reference track</p>
                  <p className="text-slate-500 text-sm">AI will analyze and match your mix to the target sound</p>
                </>
              )}
            </div>
            <div className="absolute inset-0 bg-gradient-to-r from-purple-500/0 via-purple-500/5 to-pink-500/0 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
          </label>
        ) : (
          <div className="bg-gradient-to-br from-purple-500/10 to-pink-500/10 backdrop-blur-sm border border-purple-500/30 rounded-2xl p-5 shadow-lg">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center flex-shrink-0 shadow-lg">
                  <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-white truncate">{referenceTrack.name}</p>
                  <p className="text-xs text-purple-300/70 font-medium">Reference loaded</p>
                </div>
              </div>
              {onClearReference && (
                <button
                  onClick={onClearReference}
                  className="ml-2 text-xs bg-slate-800/50 hover:bg-slate-700 text-slate-300 hover:text-white px-3 py-2 rounded-lg transition-all border border-slate-700/50 hover:border-slate-600 font-medium"
                >
                  Remove
                </button>
              )}
            </div>
            {referenceMetrics && (
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-slate-900/40 backdrop-blur-sm rounded-xl p-3 text-center border border-purple-500/20">
                  <div className="text-[10px] text-purple-300/70 uppercase font-bold tracking-wider mb-1">RMS</div>
                  <div className="text-sm font-mono font-bold text-purple-200">{referenceMetrics.rms.toFixed(1)} dB</div>
                </div>
                <div className="bg-slate-900/40 backdrop-blur-sm rounded-xl p-3 text-center border border-purple-500/20">
                  <div className="text-[10px] text-purple-300/70 uppercase font-bold tracking-wider mb-1">Peak</div>
                  <div className="text-sm font-mono font-bold text-purple-200">{referenceMetrics.peak.toFixed(1)} dB</div>
                </div>
                <div className="bg-slate-900/40 backdrop-blur-sm rounded-xl p-3 text-center border border-purple-500/20">
                  <div className="text-[10px] text-purple-300/70 uppercase font-bold tracking-wider mb-1">Crest</div>
                  <div className="text-sm font-mono font-bold text-purple-200">{referenceMetrics.crestFactor.toFixed(1)} dB</div>
                </div>
              </div>
            )}
            <div className="mt-4 p-3 bg-purple-900/20 border border-purple-500/20 rounded-xl">
              <p className="text-xs text-purple-200/80 text-center font-medium">Echo will match your mix to this reference</p>
            </div>
          </div>
        )}
      </div>
      )}
    </div>
  );
};

export default AnalysisPanel;