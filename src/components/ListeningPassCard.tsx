import React, { useState } from 'react';

interface ListeningPassData {
  version: string;
  analysis_confidence: number;
  tokens: Array<{
    token_id: string;
    detected: boolean;
    suppressed: boolean;
    confidence: number;
    listener_impact: string;
    intentionality: string;
  }>;
  priority_summary: {
    highest_stage_triggered: number;
    dominant_tokens: string[];
    recommended_focus: string | null;
    conflicts: string[];
  };
}

interface ListeningPassCardProps {
  listeningPassData: ListeningPassData | null;
  llmGuidance: any | null;
}

/**
 * ListeningPassCard Component
 *
 * Displays the Listening Pass analysis data and optional AI insights toggle.
 *
 * Phase 4: Option 3 - Silent-by-Default
 * - Listening Pass data always visible (primary)
 * - AI insights hidden by default (optional, user controls visibility)
 * - Read-only display
 * - No auto-surfacing or nudging
 */
export const ListeningPassCard: React.FC<ListeningPassCardProps> = ({
  listeningPassData,
  llmGuidance,
}) => {
  const [aiInsightsExpanded, setAiInsightsExpanded] = useState(false);

  if (!listeningPassData) {
    return null;
  }

  // Get token display name
  const getTokenLabel = (tokenId: string): string => {
    switch (tokenId) {
      case 'FATIGUE_EVENT':
        return 'Listener Fatigue';
      case 'INTELLIGIBILITY_LOSS':
        return 'Speech/Lead Clarity';
      case 'INSTABILITY_EVENT':
        return 'Transient Behavior';
      default:
        return tokenId;
    }
  };

  // Get confidence color
  const getConfidenceColor = (confidence: number): string => {
    if (confidence >= 0.8) return 'text-green-400';
    if (confidence >= 0.7) return 'text-emerald-400';
    if (confidence >= 0.6) return 'text-yellow-400';
    return 'text-orange-400';
  };

  return (
    <div className="bg-gradient-to-br from-white/[0.08] to-white/[0.02] backdrop-blur-xl rounded-2xl border border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.4)] hover:shadow-[0_8px_32px_rgba(0,0,0,0.4),0_0_50px_rgba(251,146,60,0.08)] transition-shadow duration-300 overflow-hidden">

      {/* Header */}
      <div className="px-5 py-3 border-b border-white/5 bg-white/[0.02] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-cyan-500" />
          <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">Listening Pass Analysis</span>
        </div>
        <span className="text-[10px] px-2 py-1 bg-white/5 rounded text-slate-500 font-mono">
          v{listeningPassData.version}
        </span>
      </div>
      <div className="px-5 py-2 text-[10px] text-slate-500 uppercase tracking-wider">
        Informational only (heuristic signals)
      </div>

      {/* Content */}
      <div className="p-5 space-y-4">

        {/* Confidence Level */}
        <div className="flex items-center justify-between mb-4">
          <span className="text-xs text-slate-400 uppercase font-bold">Analysis Confidence</span>
          <div className="flex items-center gap-2">
            <div className="w-32 h-1.5 bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full transition-all"
                style={{ width: `${listeningPassData.analysis_confidence * 100}%` }}
              />
            </div>
            <span className="text-xs font-mono text-slate-300 w-10">
              {(listeningPassData.analysis_confidence * 100).toFixed(0)}%
            </span>
          </div>
        </div>

        {/* Tokens Display */}
        <div className="space-y-3">
          <div className="text-xs text-slate-500 uppercase font-bold">Tokens Detected</div>
          <div className="space-y-2">
            {listeningPassData.tokens.map((token) => (
              <div
                key={token.token_id}
                className={`flex items-start gap-3 p-3 rounded-lg border transition-all ${
                  token.suppressed
                    ? 'bg-slate-900/20 border-slate-700/20 opacity-50'
                    : token.detected
                      ? 'bg-slate-800/30 border-slate-700/30'
                      : 'bg-slate-900/10 border-slate-800/20'
                }`}
              >
                {/* Token indicator */}
                <div className="flex-shrink-0 mt-0.5">
                  {token.suppressed ? (
                    <div className="w-3 h-3 rounded-full bg-slate-600 border border-slate-500" />
                  ) : token.detected ? (
                    <div className={`w-3 h-3 rounded-full border-2 ${getConfidenceColor(token.confidence)}`} />
                  ) : (
                    <div className="w-3 h-3 rounded-full bg-slate-700 border border-slate-600" />
                  )}
                </div>

                {/* Token content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2 mb-1">
                    <span className="text-sm font-semibold text-slate-200">
                      {getTokenLabel(token.token_id)}
                    </span>
                    {!token.suppressed && (
                      <span
                        className={`text-xs font-mono ${
                          token.detected ? getConfidenceColor(token.confidence) : 'text-slate-500'
                        }`}
                      >
                        {token.detected ? `${(token.confidence * 100).toFixed(0)}%` : 'Not detected'}
                      </span>
                    )}
                  </div>
                  {!token.suppressed && token.listener_impact && (
                    <p className="text-xs text-slate-400 leading-relaxed">
                      {token.listener_impact}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Dominant Token Focus (if any) */}
        {listeningPassData.priority_summary.dominant_tokens.length > 0 && (
          <div className="mt-4 pt-4 border-t border-white/5">
            <div className="text-xs text-slate-500 uppercase font-bold mb-2">Focus Area</div>
            <div className="text-sm text-slate-300">
              {listeningPassData.priority_summary.dominant_tokens[0] &&
                getTokenLabel(listeningPassData.priority_summary.dominant_tokens[0])}
            </div>
          </div>
        )}

        {/* AI Insights Toggle */}
        {llmGuidance && (
          <div className="mt-4 pt-4 border-t border-white/5">
            <button
              onClick={() => setAiInsightsExpanded(!aiInsightsExpanded)}
              className="w-full flex items-center justify-between p-3 rounded-lg bg-slate-800/30 border border-slate-700/30 hover:bg-slate-800/50 hover:border-slate-600/30 transition-all group"
              role="button"
              tabIndex={0}
              aria-expanded={aiInsightsExpanded}
              aria-controls="ai-insights-content"
            >
              <div className="flex items-center gap-2 text-left">
                <span className="text-base">✨</span>
                <span className="text-sm font-semibold text-slate-300">
                  {aiInsightsExpanded ? 'AI INTERPRETATION (Optional)' : 'AI insights available'}
                </span>
              </div>
              <svg
                className={`w-4 h-4 text-slate-400 transition-transform ${
                  aiInsightsExpanded ? 'rotate-180' : ''
                }`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 14l-7 7m0 0l-7-7m7 7V3"
                />
              </svg>
            </button>

            {/* AI Guidance Content (Collapsed by Default) */}
            {aiInsightsExpanded && (
              <div
                id="ai-insights-content"
                className="mt-3 p-4 rounded-lg bg-slate-900/40 border border-cyan-500/20 space-y-3 animate-in fade-in duration-200"
              >
                <p className="text-sm text-slate-300 leading-relaxed">
                  {llmGuidance.guidance_text}
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setAiInsightsExpanded(false)}
                    className="flex-1 px-3 py-2 text-xs font-semibold text-slate-300 bg-slate-800/50 border border-slate-700/50 rounded-lg hover:bg-slate-700 hover:border-slate-600 transition-all"
                  >
                    Hide
                  </button>
                  <button
                    className="flex-1 px-3 py-2 text-xs font-semibold text-slate-300 bg-slate-800/50 border border-slate-700/50 rounded-lg hover:bg-slate-700 hover:border-slate-600 transition-all"
                    title="Learn more about this interpretation"
                  >
                    Learn More
                  </button>
                </div>
              </div>
            )}
        </div>
        )}
      </div>
    </div>
  );
};
