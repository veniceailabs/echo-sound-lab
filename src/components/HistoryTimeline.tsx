import React, { useState, useEffect, useRef } from 'react';
import { HistoryEntry, ProcessingConfig, AudioMetrics } from '../types';
import { historyManager } from '../services/historyManager';
import { glassCard, neonCard, secondaryButton, dangerButton, glowBadge, sectionHeader, gradientDivider, metricCard, cn } from '../utils/secondLightStyles';

interface HistoryTimelineProps {
  isOpen: boolean;
  onClose: () => void;
  onJumpToEntry?: (entry: HistoryEntry) => void;
}

type FilterType = 'all' | 'eq' | 'compression' | 'reverb' | 'delay' | 'saturation' | 'user' | 'ai';

export const HistoryTimeline: React.FC<HistoryTimelineProps> = ({
  isOpen,
  onClose,
  onJumpToEntry
}) => {
  const [timeline, setTimeline] = useState<Array<{
    entry: HistoryEntry;
    isCurrent: boolean;
    isAccessible: boolean;
  }>>([]);
  const [activeFilter, setActiveFilter] = useState<FilterType>('all');
  const [expandedEntry, setExpandedEntry] = useState<string | null>(null);
  const timelineRef = useRef<HTMLDivElement>(null);

  // Load timeline on mount and when history changes
  useEffect(() => {
    if (isOpen) {
      const freshTimeline = historyManager.getTimeline();
      setTimeline(freshTimeline);

      // Scroll to current entry
      setTimeout(() => {
        const currentElement = document.getElementById('current-history-entry');
        if (currentElement && timelineRef.current) {
          currentElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 100);
    }
  }, [isOpen]);

  // Refresh timeline periodically
  useEffect(() => {
    if (!isOpen) return;

    const interval = setInterval(() => {
      setTimeline(historyManager.getTimeline());
    }, 2000);

    return () => clearInterval(interval);
  }, [isOpen]);

  // Extract processing components from config
  const extractComponents = (config: ProcessingConfig): string[] => {
    const components: string[] = [];
    if (config.eq && config.eq.length > 0) components.push('EQ');
    if (config.compression) components.push('Compression');
    if (config.multibandCompression) components.push('Multiband Compression');
    if (config.motionReverb) components.push('Reverb');
    if (config.delay) components.push('Delay');
    if (config.saturation) components.push('Saturation');
    if (config.deEsser) components.push('De-Esser');
    if (config.transientShaper) components.push('Transient Shaper');
    if (config.stereoImager) components.push('Stereo Imager');
    if (config.stereoWidener) components.push('Stereo Widener');
    if (config.dynamicEq) components.push('Dynamic EQ');
    if (config.limiter) components.push('Limiter');
    if (config.colorFilter && config.colorFilter !== 'None') components.push('Color Filter');
    return components;
  };

  // Determine if entry matches filter
  const matchesFilter = (entry: HistoryEntry): boolean => {
    if (activeFilter === 'all') return true;

    const components = extractComponents(entry.config);
    const componentsLower = components.map(c => c.toLowerCase());

    if (activeFilter === 'eq') return componentsLower.includes('eq') || componentsLower.includes('dynamic eq');
    if (activeFilter === 'compression') return componentsLower.includes('compression') || componentsLower.includes('multiband compression');
    if (activeFilter === 'reverb') return componentsLower.includes('reverb');
    if (activeFilter === 'delay') return componentsLower.includes('delay');
    if (activeFilter === 'saturation') return componentsLower.includes('saturation');

    // User actions vs AI actions
    if (activeFilter === 'user') return entry.action === 'manual_adjust' || entry.action === 'preset_apply' || entry.action === 'upload';
    if (activeFilter === 'ai') return entry.action === 'echo_action' || entry.action === 'process';

    return false;
  };

  // Format timestamp
  const formatTimestamp = (timestamp: number): string => {
    const date = new Date(timestamp);
    const now = Date.now();
    const diff = now - timestamp;

    // Less than 1 minute ago
    if (diff < 60000) return 'Just now';

    // Less than 1 hour ago
    if (diff < 3600000) {
      const minutes = Math.floor(diff / 60000);
      return `${minutes} min${minutes > 1 ? 's' : ''} ago`;
    }

    // Less than 24 hours ago
    if (diff < 86400000) {
      const hours = Math.floor(diff / 3600000);
      return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    }

    // More than 24 hours ago - show date and time
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  };

  // Get action icon SVG
  const getActionIcon = (action: HistoryEntry['action']): React.ReactElement => {
    const iconClass = "w-5 h-5";

    switch (action) {
      case 'upload':
        return (
          <svg className={iconClass} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
          </svg>
        );
      case 'process':
        return (
          <svg className={iconClass} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        );
      case 'commit':
        return (
          <svg className={iconClass} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        );
      case 'echo_action':
        return (
          <svg className={iconClass} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
        );
      case 'preset_apply':
        return (
          <svg className={iconClass} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
          </svg>
        );
      case 'manual_adjust':
        return (
          <svg className={iconClass} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
        );
      default:
        return (
          <svg className={iconClass} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
    }
  };

  // Get action color (Second Light OS style)
  const getActionColor = (action: HistoryEntry['action']): string => {
    switch (action) {
      case 'upload': return 'bg-slate-800/80 border-orange-500/30 text-orange-400';
      case 'process': return 'bg-slate-800/80 border-orange-500/40 text-orange-300';
      case 'commit': return 'bg-slate-800/80 border-orange-500/50 text-orange-400';
      case 'echo_action': return 'bg-slate-800/80 border-orange-500/60 text-orange-300';
      case 'preset_apply': return 'bg-slate-800/80 border-orange-500/40 text-orange-400';
      case 'manual_adjust': return 'bg-slate-800/80 border-orange-500/30 text-orange-300';
      default: return 'bg-slate-800/80 border-slate-700/50 text-slate-400';
    }
  };

  // Format metrics comparison
  const formatMetricsComparison = (metrics: AudioMetrics, label: string): React.ReactElement => {
    const rmsDb = 20 * Math.log10(metrics.rms);
    const lufs = metrics.lufs?.integrated;

    return (
      <div className="text-xs space-y-1">
        <div className="font-bold text-slate-400">{label}</div>
        <div className="font-mono text-slate-300">
          RMS: {rmsDb.toFixed(1)} dB
        </div>
        {lufs !== undefined && (
          <div className="font-mono text-slate-300">
            LUFS: {lufs.toFixed(1)}
          </div>
        )}
        <div className="font-mono text-slate-300">
          Peak: {(20 * Math.log10(metrics.peak)).toFixed(1)} dB
        </div>
        <div className="font-mono text-slate-300">
          Crest: {metrics.crestFactor.toFixed(1)} dB
        </div>
      </div>
    );
  };

  // Format config parameters
  const formatConfigParameters = (config: ProcessingConfig): React.ReactElement => {
    const params: React.ReactElement[] = [];

    if (config.eq && config.eq.length > 0) {
      params.push(
        <div key="eq" className="mb-2">
          <div className="font-bold text-cyan-400 text-xs mb-1">EQ ({config.eq.length} bands)</div>
          <div className="space-y-0.5">
            {config.eq.map((band, i) => (
              <div key={i} className="text-xs font-mono text-slate-300">
                {band.frequency}Hz: {band.gain > 0 ? '+' : ''}{band.gain.toFixed(1)}dB ({band.type})
              </div>
            ))}
          </div>
        </div>
      );
    }

    if (config.compression) {
      params.push(
        <div key="comp" className="mb-2">
          <div className="font-bold text-orange-400 text-xs mb-1">Compression</div>
          <div className="text-xs font-mono text-slate-300 space-y-0.5">
            <div>Ratio: {config.compression.ratio}:1</div>
            <div>Threshold: {config.compression.threshold} dB</div>
            <div>Attack: {(config.compression.attack * 1000).toFixed(1)}ms</div>
            <div>Release: {(config.compression.release * 1000).toFixed(0)}ms</div>
            {config.compression.makeupGain !== undefined && (
              <div>Makeup: +{config.compression.makeupGain}dB</div>
            )}
          </div>
        </div>
      );
    }

    if (config.motionReverb) {
      params.push(
        <div key="reverb" className="mb-2">
          <div className="font-bold text-purple-400 text-xs mb-1">Reverb</div>
          <div className="text-xs font-mono text-slate-300 space-y-0.5">
            <div>Mix: {(config.motionReverb.mix * 100).toFixed(0)}%</div>
            <div>Decay: {config.motionReverb.decay.toFixed(1)}s</div>
            <div>Pre-delay: {(config.motionReverb.preDelay * 1000).toFixed(0)}ms</div>
          </div>
        </div>
      );
    }

    if (config.delay) {
      params.push(
        <div key="delay" className="mb-2">
          <div className="font-bold text-blue-400 text-xs mb-1">Delay</div>
          <div className="text-xs font-mono text-slate-300 space-y-0.5">
            <div>Time: {(config.delay.time * 1000).toFixed(0)}ms</div>
            <div>Feedback: {(config.delay.feedback * 100).toFixed(0)}%</div>
            <div>Mix: {(config.delay.mix * 100).toFixed(0)}%</div>
          </div>
        </div>
      );
    }

    if (config.saturation) {
      params.push(
        <div key="sat" className="mb-2">
          <div className="font-bold text-amber-400 text-xs mb-1">Saturation</div>
          <div className="text-xs font-mono text-slate-300 space-y-0.5">
            <div>Type: {config.saturation.type}</div>
            <div>Amount: {(config.saturation.amount * 100).toFixed(0)}%</div>
            {config.saturation.mix !== undefined && (
              <div>Mix: {(config.saturation.mix * 100).toFixed(0)}%</div>
            )}
          </div>
        </div>
      );
    }

    return <div className="space-y-2">{params}</div>;
  };

  const filteredTimeline = timeline.filter(item => matchesFilter(item.entry));

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/90 backdrop-blur-md z-50 flex items-center justify-center p-6 animate-fade-in">
      <div className={cn(glassCard, 'w-full max-w-4xl max-h-[90vh] flex flex-col shadow-[0_0_60px_rgba(6,182,212,0.2)]')}>
        {/* Header */}
        <div className="flex items-center justify-between p-8 border-b border-slate-700/30">
          <div>
            <h2 className={cn(sectionHeader, 'text-3xl mb-2')}>Processing History</h2>
            <p className="text-sm text-slate-400 mt-2">
              {timeline.length} total entries • {filteredTimeline.length} visible
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-12 h-12 rounded-2xl bg-slate-800/50 hover:bg-slate-700/60 text-slate-300 hover:text-white flex items-center justify-center transition-all duration-300 border border-slate-700/30"
          >
            ✕
          </button>
        </div>

        {/* Filters */}
        <div className="px-8 py-5 border-b border-slate-700/30 flex gap-3 flex-wrap bg-slate-900/30">
          {[
            { value: 'all' as const, label: 'All', icon: 'ALL' },
            { value: 'eq' as const, label: 'EQ', icon: 'EQ' },
            { value: 'compression' as const, label: 'Compression', icon: 'CMP' },
            { value: 'reverb' as const, label: 'Reverb', icon: 'REV' },
            { value: 'delay' as const, label: 'Delay', icon: 'DLY' },
            { value: 'saturation' as const, label: 'Saturation', icon: 'SAT' },
            { value: 'user' as const, label: 'User', icon: 'USR' },
            { value: 'ai' as const, label: 'AI', icon: 'AI' }
          ].map(filter => (
            <button
              key={filter.value}
              onClick={() => setActiveFilter(filter.value)}
              className={cn(
                'px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all duration-300',
                activeFilter === filter.value
                  ? 'bg-slate-900 text-orange-400 shadow-[inset_3px_3px_6px_#050710,inset_-3px_-3px_6px_#0f1828] border border-orange-500/30'
                  : 'bg-slate-800/50 text-slate-400 hover:bg-slate-700/60 hover:text-slate-200 border border-slate-700/30 shadow-[2px_2px_4px_#050710,-2px_-2px_4px_#0f1828]'
              )}
            >
              {filter.icon} {filter.label}
            </button>
          ))}
        </div>

        {/* Timeline */}
        <div ref={timelineRef} className="flex-1 overflow-y-auto p-6 space-y-4">
          {filteredTimeline.length === 0 ? (
            <div className="text-center text-slate-500 py-12">
              <div className="text-4xl mb-4">📭</div>
              <div className="text-lg font-bold">No entries match this filter</div>
              <div className="text-sm mt-2">Try selecting a different filter</div>
            </div>
          ) : (
            filteredTimeline.map((item, index) => {
              const components = extractComponents(item.entry.config);
              const isExpanded = expandedEntry === item.entry.id;

              return (
                <div
                  key={item.entry.id}
                  id={item.isCurrent ? 'current-history-entry' : undefined}
                  className={`rounded-2xl border-2 transition-all ${
                    item.isCurrent
                      ? 'bg-slate-800/70 border-orange-500/50 shadow-[0_0_20px_rgba(251,146,60,0.15)]'
                      : 'bg-slate-800/50 border-slate-700/50 hover:border-slate-600/50'
                  }`}
                >
                  <div
                    className="p-4 cursor-pointer"
                    onClick={() => setExpandedEntry(isExpanded ? null : item.entry.id)}
                  >
                    {/* Entry Header */}
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-3 flex-1">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center border shadow-[inset_2px_2px_4px_#050710,inset_-2px_-2px_4px_#0f1828] ${getActionColor(item.entry.action)}`}>
                          {getActionIcon(item.entry.action)}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <div className="text-sm font-bold text-slate-200">
                              {item.entry.description}
                            </div>
                            {item.isCurrent && (
                              <span className="px-2 py-0.5 bg-cyan-500 text-white text-xs rounded-full font-bold">
                                CURRENT
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-slate-400 mt-1">
                            {formatTimestamp(item.entry.timestamp)}
                          </div>
                          {components.length > 0 && (
                            <div className="flex gap-1.5 mt-2 flex-wrap">
                              {components.map(comp => (
                                <span
                                  key={comp}
                                  className="px-2 py-0.5 bg-slate-700/50 text-slate-300 text-xs rounded-md font-mono"
                                >
                                  {comp}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="text-slate-400 text-xs">
                        {isExpanded ? '−' : '+'}
                      </div>
                    </div>

                    {/* Expanded Details */}
                    {isExpanded && (
                      <div className="mt-4 pt-4 border-t border-slate-700/50 grid grid-cols-2 gap-4">
                        {/* Config Parameters */}
                        <div>
                          <div className="text-xs font-bold text-slate-400 uppercase mb-2">Configuration</div>
                          <div className="bg-slate-950/50 rounded-xl p-3 max-h-64 overflow-y-auto">
                            {formatConfigParameters(item.entry.config)}
                          </div>
                        </div>

                        {/* Metrics */}
                        <div>
                          <div className="text-xs font-bold text-slate-400 uppercase mb-2">Audio Metrics</div>
                          <div className="bg-slate-950/50 rounded-xl p-3">
                            {formatMetricsComparison(item.entry.metrics, 'State')}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Jump Button */}
                  {!item.isCurrent && onJumpToEntry && (
                    <div className="px-4 pb-4">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onJumpToEntry(item.entry);
                        }}
                        className="w-full py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-xl text-sm font-bold transition-all"
                      >
                        Jump to this state
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-8 py-5 border-t border-slate-700/30 flex items-center justify-between bg-slate-900/30">
          <div className="text-xs text-slate-500 font-medium">
            TIP: Click any entry to view detailed parameters
          </div>
          <button
            onClick={() => {
              if (confirm('Clear all history? This cannot be undone.')) {
                historyManager.clearHistory();
                setTimeline([]);
              }
            }}
            className={cn(dangerButton, 'px-5 py-2.5 text-sm')}
          >
            Clear History
          </button>
        </div>
      </div>
    </div>
  );
};