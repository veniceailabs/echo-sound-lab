/**
 * Local Plugin Rack - UI for Echo Sound Lab's built-in audio effects
 * Plugins: echo-delay, echo-reverb, echo-chorus
 */

import React, { useState, useEffect, useCallback } from 'react';
import { localPluginService, LocalPluginDefinition, LocalPluginInstance } from '../services/localPluginService';
import { audioEngine } from '../services/audioEngine';

interface LocalPluginRackProps {
  onPluginChange?: () => void;
}

export const LocalPluginRack: React.FC<LocalPluginRackProps> = ({ onPluginChange }) => {
  const [availablePlugins, setAvailablePlugins] = useState<LocalPluginDefinition[]>([]);
  const [activeInstances, setActiveInstances] = useState<LocalPluginInstance[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [expandedPlugin, setExpandedPlugin] = useState<string | null>(null);

  // Initialize
  useEffect(() => {
    const init = async () => {
      const ctx = audioEngine.getAudioContext?.();
      if (ctx) {
        await localPluginService.init(ctx);
      }
      setAvailablePlugins(localPluginService.getAvailablePlugins());
    };
    init();
  }, []);

  // Refresh active instances
  const refreshInstances = useCallback(() => {
    setActiveInstances(localPluginService.getActiveInstances());
  }, []);

  // Load a plugin
  const handleLoadPlugin = async (pluginId: string) => {
    setIsLoading(true);
    try {
      const instanceId = await localPluginService.createInstance(pluginId);
      if (instanceId) {
        refreshInstances();
        setExpandedPlugin(instanceId);
        onPluginChange?.();
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Unload a plugin
  const handleUnloadPlugin = (instanceId: string) => {
    localPluginService.destroyInstance(instanceId);
    refreshInstances();
    if (expandedPlugin === instanceId) {
      setExpandedPlugin(null);
    }
    onPluginChange?.();
  };

  // Update parameter
  const handleParameterChange = (instanceId: string, paramId: string, value: number) => {
    localPluginService.setParameter(instanceId, paramId, value);
    refreshInstances();
  };

  const getCategoryIcon = (category: LocalPluginDefinition['category']) => {
    switch (category) {
      case 'delay': return 'D';
      case 'reverb': return 'R';
      case 'modulation': return 'M';
      case 'dynamics': return 'C';
      case 'filter': return 'F';
      default: return '?';
    }
  };

  const getCategoryColor = (category: LocalPluginDefinition['category']) => {
    switch (category) {
      case 'delay': return 'from-cyan-500 to-blue-600';
      case 'reverb': return 'from-purple-500 to-indigo-600';
      case 'modulation': return 'from-pink-500 to-rose-600';
      case 'dynamics': return 'from-amber-500 to-orange-600';
      case 'filter': return 'from-emerald-500 to-green-600';
      default: return 'from-slate-500 to-slate-600';
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-[0_0_15px_rgba(245,158,11,0.3)]">
            <span className="text-black text-sm font-bold">L</span>
          </div>
          <div>
            <h3 className="text-lg font-bold text-white">Local Effects</h3>
            <p className="text-[10px] text-amber-400/80 font-medium tracking-widest uppercase">Built-in DSP</p>
          </div>
        </div>
        <div className="text-xs text-slate-500">
          {activeInstances.length} active
        </div>
      </div>

      {/* Active Plugins */}
      {activeInstances.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <div className="h-px flex-1 bg-gradient-to-r from-green-500/30 to-transparent" />
            <span className="text-[10px] text-green-400 font-bold uppercase tracking-wider">Active Effects</span>
            <div className="h-px flex-1 bg-gradient-to-l from-green-500/30 to-transparent" />
          </div>

          {activeInstances.map(instance => {
            const definition = localPluginService.getPluginDefinition(instance.pluginId);
            if (!definition) return null;
            const isExpanded = expandedPlugin === instance.id;

            return (
              <div
                key={instance.id}
                className="bg-gradient-to-br from-green-500/10 to-emerald-500/5 rounded-xl border border-green-500/30 backdrop-blur-sm overflow-hidden"
              >
                {/* Plugin Header */}
                <div
                  className="p-4 flex items-center justify-between cursor-pointer hover:bg-white/5 transition-colors"
                  onClick={() => setExpandedPlugin(isExpanded ? null : instance.id)}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${getCategoryColor(definition.category)} flex items-center justify-center shadow-lg`}>
                      <span className="text-white text-xs font-bold">{getCategoryIcon(definition.category)}</span>
                    </div>
                    <div>
                      <h4 className="text-white font-bold">{definition.name}</h4>
                      <p className="text-[10px] text-slate-400">{definition.description}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)] animate-pulse" />
                    <button
                      onClick={(e) => { e.stopPropagation(); handleUnloadPlugin(instance.id); }}
                      className="px-3 py-1 bg-red-500/20 hover:bg-red-500/30 text-red-400 text-xs font-medium rounded-lg border border-red-500/30 transition-all"
                    >
                      Remove
                    </button>
                  </div>
                </div>

                {/* Parameters (Expanded) */}
                {isExpanded && (
                  <div className="px-4 pb-4 border-t border-white/5">
                    <div className="pt-4 space-y-3">
                      {definition.parameters.map(param => {
                        const value = instance.parameters[param.id] ?? param.defaultValue;
                        return (
                          <div key={param.id} className="space-y-1.5">
                            <div className="flex justify-between text-xs">
                              <span className="text-slate-300 font-medium">{param.label}</span>
                              <span className="text-amber-400 font-mono">
                                {value.toFixed(param.unit === 'Hz' ? 0 : 2)}
                                {param.unit && <span className="text-slate-500 ml-1">{param.unit}</span>}
                              </span>
                            </div>
                            <input
                              type="range"
                              min={param.minValue}
                              max={param.maxValue}
                              step={(param.maxValue - param.minValue) / 100}
                              value={value}
                              onChange={(e) => handleParameterChange(instance.id, param.id, parseFloat(e.target.value))}
                              className="w-full h-2 bg-white/10 rounded-full appearance-none cursor-pointer
                                [&::-webkit-slider-thumb]:appearance-none
                                [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4
                                [&::-webkit-slider-thumb]:rounded-full
                                [&::-webkit-slider-thumb]:bg-gradient-to-br [&::-webkit-slider-thumb]:from-amber-400 [&::-webkit-slider-thumb]:to-orange-500
                                [&::-webkit-slider-thumb]:shadow-[0_0_10px_rgba(245,158,11,0.5)]
                                [&::-webkit-slider-thumb]:cursor-pointer"
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Available Plugins */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <div className="h-px flex-1 bg-gradient-to-r from-white/10 to-transparent" />
          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Add Effect</span>
          <div className="h-px flex-1 bg-gradient-to-l from-white/10 to-transparent" />
        </div>

        <div className="grid gap-2">
          {availablePlugins.map(plugin => (
            <div
              key={plugin.id}
              className="bg-gradient-to-br from-white/[0.05] to-white/[0.02] rounded-xl p-4 border border-white/10 hover:border-amber-500/30 hover:shadow-[0_0_15px_rgba(245,158,11,0.1)] transition-all backdrop-blur-sm"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${getCategoryColor(plugin.category)} flex items-center justify-center shadow-lg`}>
                    <span className="text-white font-bold">{getCategoryIcon(plugin.category)}</span>
                  </div>
                  <div>
                    <h4 className="text-white font-bold">{plugin.name}</h4>
                    <p className="text-xs text-slate-400">{plugin.description}</p>
                  </div>
                </div>
                <button
                  onClick={() => handleLoadPlugin(plugin.id)}
                  disabled={isLoading}
                  className="px-4 py-2 bg-slate-900 text-orange-400 font-bold rounded-lg shadow-[4px_4px_12px_rgba(0,0,0,0.5),_1px_1px_3px_rgba(255,255,255,0.03)] hover:shadow-[6px_6px_16px_rgba(0,0,0,0.6),_2px_2px_4px_rgba(255,255,255,0.04)] hover:text-orange-300 active:shadow-[inset_2px_2px_6px_rgba(0,0,0,0.8),inset_-1px_-1px_3px_rgba(255,255,255,0.02)] active:translate-y-[1px] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isLoading ? (
                    <span className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin inline-block" />
                  ) : '+'}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Info Footer */}
      <div className="flex items-center gap-3 pt-3 border-t border-white/5">
        <div className="w-4 h-4 rounded bg-amber-500/20 flex items-center justify-center">
          <span className="text-amber-400 text-[10px]">i</span>
        </div>
        <p className="text-[10px] text-slate-500">
          Local effects run entirely in your browser. No external dependencies.
        </p>
      </div>
    </div>
  );
};

export default LocalPluginRack;
