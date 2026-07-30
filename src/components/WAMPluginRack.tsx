import React, { useState, useEffect, useRef, useCallback } from 'react';
import { wamPluginService, WAMPluginStatus, wamSlotManager, WAMSlot, StemName } from '../services/wamPluginService';
import { audioEngine } from '../services/audioEngine';

interface WAMPluginRackProps {
  onPluginChange?: () => void;
}

interface PluginParameter {
  id: string;
  label: string;
  type: string;
  minValue: number;
  maxValue: number;
  defaultValue: number;
  value: number;
}

export const WAMPluginRack: React.FC<WAMPluginRackProps> = ({ onPluginChange }) => {
  const [plugins, setPlugins] = useState<WAMPluginStatus[]>([]);
  const [activePluginId, setActivePluginId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [parameters, setParameters] = useState<PluginParameter[]>([]);
  const [isTestingAvailability, setIsTestingAvailability] = useState(false);
  const [showPluginUI, setShowPluginUI] = useState(false);
  const [isLoadingUI, setIsLoadingUI] = useState(false);
  const [retryingPluginId, setRetryingPluginId] = useState<string | null>(null);
  const pluginUIRef = useRef<HTMLDivElement>(null);

  // Slot Manager state
  const [masterSlots, setMasterSlots] = useState<[WAMSlot, WAMSlot, WAMSlot]>(
    wamSlotManager.getMasterSlots()
  );
  const [stemInserts, setStemInserts] = useState<Record<StemName, WAMSlot>>(
    wamSlotManager.getStemInserts()
  );
  const [slotLoadingIndex, setSlotLoadingIndex] = useState<number | null>(null);
  const [stemLoadingStem, setStemLoadingStem] = useState<StemName | null>(null);
  const [selectedSlotPlugin, setSelectedSlotPlugin] = useState<{ type: 'master' | 'stem'; index: number | StemName } | null>(null);

  const refreshSlots = useCallback(() => {
    setMasterSlots(wamSlotManager.getMasterSlots());
    setStemInserts(wamSlotManager.getStemInserts());
  }, []);

  const handleLoadIntoMasterSlot = async (slotIndex: 0 | 1 | 2, pluginId: string) => {
    setSlotLoadingIndex(slotIndex);
    const ok = await wamSlotManager.loadPluginIntoMasterSlot(slotIndex, pluginId);
    refreshSlots();
    setSlotLoadingIndex(null);
    if (ok) onPluginChange?.();
  };

  const handleUnloadMasterSlot = async (slotIndex: 0 | 1 | 2) => {
    await wamSlotManager.unloadMasterSlot(slotIndex);
    refreshSlots();
    onPluginChange?.();
  };

  const handleBypassMasterSlot = (slotIndex: 0 | 1 | 2, bypassed: boolean) => {
    wamSlotManager.bypassMasterSlot(slotIndex, bypassed);
    refreshSlots();
  };

  const handleLoadIntoStemInsert = async (stem: StemName, pluginId: string) => {
    setStemLoadingStem(stem);
    const ok = await wamSlotManager.loadPluginIntoStemInsert(stem, pluginId);
    refreshSlots();
    setStemLoadingStem(null);
    if (ok) onPluginChange?.();
  };

  const handleUnloadStemInsert = async (stem: StemName) => {
    await wamSlotManager.unloadStemInsert(stem);
    refreshSlots();
    onPluginChange?.();
  };

  const handleBypassStemInsert = (stem: StemName, bypassed: boolean) => {
    wamSlotManager.bypassStemInsert(stem, bypassed);
    refreshSlots();
  };

  const stemNames: StemName[] = ['vocals', 'drums', 'bass', 'other'];

  // Refresh plugin list
  const refreshPlugins = useCallback(() => {
    setPlugins(wamPluginService.getPluginsWithStatus());
  }, []);

  // Initial load and test availability
  useEffect(() => {
    refreshPlugins();

    // Start availability testing in background
    const testAvailability = async () => {
      setIsTestingAvailability(true);
      for (const plugin of wamPluginService.getPluginsWithStatus()) {
        if (plugin.availability === 'unknown') {
          await wamPluginService.testPluginAvailability(plugin.id);
          refreshPlugins();
        }
      }
      setIsTestingAvailability(false);
    };

    testAvailability();
  }, [refreshPlugins]);

  // Load a plugin
  const handleLoadPlugin = async (pluginId: string) => {
    // Unload current plugin first
    if (activePluginId) {
      await handleUnloadPlugin();
    }

    setIsLoading(true);
    setLoadError(null);

    try {
      const success = await audioEngine.loadWAMPlugin(pluginId);
      if (success) {
        setActivePluginId(pluginId);
        refreshPlugins();

        // Load parameters
        const params = await audioEngine.getWAMPluginParameters(pluginId);
        if (params?.info) {
          const paramList: PluginParameter[] = Object.entries(params.info).map(([id, info]: [string, any]) => ({
            id,
            label: info.label || id,
            type: info.type || 'float',
            minValue: info.minValue ?? 0,
            maxValue: info.maxValue ?? 1,
            defaultValue: info.defaultValue ?? 0.5,
            value: params.values?.[id]?.value ?? info.defaultValue ?? 0.5,
          }));
          setParameters(paramList);
        }

        onPluginChange?.();
      } else {
        const pluginInfo = plugins.find(p => p.id === pluginId);
        setLoadError(
          `Failed to load ${pluginInfo?.name || 'plugin'}.\n\n` +
          `Common causes:\n` +
          `â€Plugin server is offline or unreachable\n` +
          `â€CORS policy blocking the plugin\n` +
          `â€Plugin code has errors or incompatible format\n` +
          `â€Network connectivity issues\n\n` +
          `Try: Refresh the plugin list or check browser console for detailed error logs.`
        );
      }
    } catch (err: any) {
      const pluginInfo = plugins.find(p => p.id === pluginId);
      let errorMsg = `Error loading ${pluginInfo?.name || 'plugin'}:\n\n`;

      if (err.message) {
        errorMsg += `${err.message}\n\n`;
      }

      if (err.message?.includes('CORS') || err.message?.includes('cors')) {
        errorMsg += `Issue: Cross-origin security restriction\n`;
        errorMsg += `Cause: Plugin server doesn't allow loading from this domain\n`;
        errorMsg += `Solution: WAM plugins must be hosted with proper CORS headers. This is a plugin hosting issue.`;
      } else if (err.message?.includes('404') || err.message?.includes('not found')) {
        errorMsg += `Issue: Plugin files not found\n`;
        errorMsg += `Cause: The plugin URL is incorrect or files have moved\n`;
        errorMsg += `Solution: Try refreshing the plugin list or contact plugin vendor.`;
      } else if (err.message?.includes('timeout') || err.message?.includes('Timeout')) {
        errorMsg += `Issue: Connection timeout\n`;
        errorMsg += `Cause: Plugin server is slow or unreachable\n`;
        errorMsg += `Solution: Check your internet connection and try again.`;
      } else {
        errorMsg += `Try: Refresh the plugin list, check your connection, or try a different plugin.`;
      }

      setLoadError(errorMsg);
    } finally {
      setIsLoading(false);
    }
  };

  // Unload current plugin
  const handleUnloadPlugin = async () => {
    if (activePluginId) {
      await audioEngine.unloadWAMPlugin(activePluginId);
      setActivePluginId(null);
      setParameters([]);
      setShowPluginUI(false);
      wamPluginService.clearAvailabilityCache();
      refreshPlugins();
      onPluginChange?.();
    }
  };

  // Update parameter value
  const handleParameterChange = async (paramId: string, value: number) => {
    if (activePluginId) {
      await audioEngine.setWAMPluginParameter(activePluginId, paramId, value);
      setParameters(prev => prev.map(p =>
        p.id === paramId ? { ...p, value } : p
      ));
    }
  };

  // Open native plugin UI
  const handleOpenPluginUI = async () => {
    if (activePluginId && pluginUIRef.current) {
      setIsLoadingUI(true);
      setLoadError(null);
      // Clear previous UI
      pluginUIRef.current.innerHTML = '';

      try {
        const gui = await audioEngine.openWAMPluginGUI(activePluginId, pluginUIRef.current);
        if (gui) {
          setShowPluginUI(true);
        } else {
          // GUI failed to load - show fallback with better error message
          setLoadError('Plugin GUI unavailable. Using fallback parameter controls below. This is common - many WAM plugins have no GUI or use incompatible rendering methods.');
          setShowPluginUI(false);
        }
      } catch (err: any) {
        console.error('Failed to open plugin UI:', err);
        // Detailed error handling
        let errorMsg = 'Plugin GUI failed to load. Using fallback parameter controls below.\n\n';
        if (err.message && err.message.includes('CORS')) {
          errorMsg += 'Issue: Cross-origin security restriction.\n';
          errorMsg += 'Solution: Plugin host must allow iframe embedding. This is a plugin limitation, not an app bug.';
        } else if (err.message && err.message.includes('404')) {
          errorMsg += 'Issue: Plugin GUI files not found.\n';
          errorMsg += 'Solution: The plugin may not have a web UI, or files are missing.';
        } else {
          errorMsg += `Error: ${err.message || 'Unknown GUI error'}`;
        }
        setLoadError(errorMsg);
        setShowPluginUI(false);
      } finally {
        setIsLoadingUI(false);
      }
    }
  };

  // Retry single plugin availability
  const handleRetryPlugin = async (pluginId: string) => {
    setRetryingPluginId(pluginId);
    await wamPluginService.testPluginAvailability(pluginId);
    refreshPlugins();
    setRetryingPluginId(null);
  };

  // Retry availability check
  const handleRetryAvailability = async () => {
    wamPluginService.clearAvailabilityCache();
    refreshPlugins();

    setIsTestingAvailability(true);
    for (const plugin of wamPluginService.getPluginsWithStatus()) {
      await wamPluginService.testPluginAvailability(plugin.id);
      refreshPlugins();
    }
    setIsTestingAvailability(false);
  };

  const getAvailabilityBadge = (status: WAMPluginStatus) => {
    if (status.isLoaded) {
      return (
        <span className="px-2 py-0.5 bg-green-500/20 text-green-400 text-xs rounded-full border border-green-500/30 font-medium">
          Active
        </span>
      );
    }
    switch (status.availability) {
      case 'available':
        return (
          <span className="px-2 py-0.5 bg-cyan-500/20 text-cyan-400 text-xs rounded-full border border-cyan-500/30 font-medium">
            Ready
          </span>
        );
      case 'unavailable':
        return (
          <span className="px-2 py-0.5 bg-red-500/20 text-red-400 text-xs rounded-full border border-red-500/30 font-medium" title={status.error}>
            Offline
          </span>
        );
      case 'loading':
        return (
          <span className="px-2 py-0.5 bg-amber-500/20 text-amber-400 text-xs rounded-full border border-amber-500/30 font-medium animate-pulse">
            Checking
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 bg-white/5 text-slate-400 text-xs rounded-full border border-white/10 font-medium">
            Unknown
          </span>
        );
    }
  };

  const availablePlugins = plugins.filter(p => p.availability === 'available');

  const SlotDropdown: React.FC<{
    currentPluginId: string | null;
    onSelect: (id: string) => void;
    loading: boolean;
  }> = ({ currentPluginId, onSelect, loading }) => (
    <select
      value={currentPluginId ?? ''}
      onChange={e => e.target.value && onSelect(e.target.value)}
      disabled={loading}
      className="w-full text-xs bg-black/40 text-slate-300 border border-white/10 rounded-lg px-2 py-1.5 mt-2 disabled:opacity-50"
    >
      <option value="">â€Select plugin â€”</option>
      {plugins.map(p => (
        <option key={p.id} value={p.id} disabled={p.availability === 'unavailable'}>
          {p.name} {p.availability === 'unavailable' ? '(offline)' : p.availability === 'unknown' ? '(?)' : ''}
        </option>
      ))}
    </select>
  );

  return (
    <div className="space-y-4">
      {/* Header - Second Light OS Style */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-orange-500 to-blue-600 flex items-center justify-center shadow-[0_0_15px_rgba(59,130,246,0.25)]">
            <span className="text-white text-sm font-bold">W</span>
          </div>
          <div>
            <h3 className="text-lg font-bold text-white">Plugin Rack</h3>
            <p className="text-[10px] text-sky-300/80 font-medium tracking-widest uppercase">WAM 2.0</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isTestingAvailability && (
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
              <span className="text-xs text-slate-400">Scanning...</span>
            </div>
          )}
          <button
            onClick={handleRetryAvailability}
            disabled={isTestingAvailability}
            className="px-3 py-1.5 text-xs font-medium text-white/60 hover:text-white bg-white/5 hover:bg-white/10 rounded-lg border border-white/10 transition-all disabled:opacity-50"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* ===== MASTER RACK â€3 slots ===== */}
      <div>
        <p className="text-[10px] uppercase tracking-[0.28em] text-orange-300 mb-2">Master Rack</p>
        <div className="grid grid-cols-3 gap-3">
          {([0, 1, 2] as const).map(slotIndex => {
            const slot = masterSlots[slotIndex];
            const isSlotLoading = slotLoadingIndex === slotIndex;
            return (
              <div
                key={slotIndex}
                className={`rounded-xl p-3 border ${slot.pluginId
                  ? 'bg-cyan-500/10 border-cyan-500/30'
                  : 'bg-white/[0.03] border-dashed border-white/10'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] uppercase tracking-wider text-slate-500">Slot {slotIndex + 1}</span>
                  {slot.pluginId && (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleBypassMasterSlot(slotIndex, !slot.bypassed)}
                        className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${slot.bypassed
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                          : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                        }`}
                      >
                        {slot.bypassed ? 'BP' : 'ON'}
                      </button>
                      <button
                        onClick={() => handleUnloadMasterSlot(slotIndex)}
                        className="text-red-400 hover:text-red-300 text-[10px] px-1"
                      >
                        âœ•
                      </button>
                    </div>
                  )}
                </div>
                {slot.pluginId ? (
                  <p className="text-xs font-semibold text-slate-200 truncate">
                    {plugins.find(p => p.id === slot.pluginId)?.name ?? slot.pluginId}
                  </p>
                ) : (
                  <p className="text-xs text-slate-600">Empty</p>
                )}
                <SlotDropdown
                  currentPluginId={slot.pluginId}
                  onSelect={id => handleLoadIntoMasterSlot(slotIndex, id)}
                  loading={isSlotLoading}
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* ===== STEM INSERT RACK â€4 rows ===== */}
      <div>
        <p className="text-[10px] uppercase tracking-[0.28em] text-sky-300 mb-2">Stem Inserts</p>
        <div className="space-y-2">
          {stemNames.map(stem => {
            const slot = stemInserts[stem];
            const isStemLoading = stemLoadingStem === stem;
            return (
              <div
                key={stem}
                className={`rounded-xl p-3 border flex items-center gap-3 ${slot.pluginId
                  ? 'bg-purple-500/10 border-purple-500/30'
                  : 'bg-white/[0.03] border-dashed border-white/10'
                }`}
              >
                <span className="text-xs font-semibold text-slate-400 w-12 capitalize flex-shrink-0">{stem}</span>
                <div className="flex-1 min-w-0">
                  {slot.pluginId ? (
                    <p className="text-xs font-semibold text-slate-200 truncate">
                      {plugins.find(p => p.id === slot.pluginId)?.name ?? slot.pluginId}
                    </p>
                  ) : (
                    <p className="text-xs text-slate-600">No insert</p>
                  )}
                  <select
                    value={slot.pluginId ?? ''}
                    onChange={e => e.target.value && handleLoadIntoStemInsert(stem, e.target.value)}
                    disabled={isStemLoading}
                    className="w-full text-xs bg-black/40 text-slate-300 border border-white/10 rounded-lg px-2 py-1 mt-1 disabled:opacity-50"
                  >
                    <option value="">â€Select plugin â€”</option>
                    {plugins.map(p => (
                      <option key={p.id} value={p.id} disabled={p.availability === 'unavailable'}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
                {slot.pluginId && (
                  <div className="flex flex-col items-end gap-1 flex-shrink-0">
                    <button
                      onClick={() => handleBypassStemInsert(stem, !slot.bypassed)}
                      className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${slot.bypassed
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                        : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                      }`}
                    >
                      {slot.bypassed ? 'BP' : 'ON'}
                    </button>
                    <button
                      onClick={() => handleUnloadStemInsert(stem)}
                      className="text-red-400 hover:text-red-300 text-[10px] px-1"
                    >
                      âœ•
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ===== SINGLE PLUGIN LEGACY SECTION ===== */}
      {/* Active Plugin Section */}
      {activePluginId ? (
        <div className="bg-gradient-to-br from-green-500/10 to-emerald-500/5 rounded-xl p-4 border border-green-500/30 backdrop-blur-sm shadow-[0_0_20px_rgba(34,197,94,0.1)]">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-3 h-3 rounded-full bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.5)] animate-pulse" />
              <div>
                <span className="text-green-400 text-[10px] font-bold uppercase tracking-wider">Active Plugin</span>
                <h4 className="text-white font-bold">
                  {plugins.find(p => p.id === activePluginId)?.name}
                </h4>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleOpenPluginUI}
                disabled={isLoadingUI}
                className="px-4 py-2 bg-white/10 hover:bg-white/15 text-white text-sm font-medium rounded-lg border border-white/10 transition-all disabled:opacity-50"
              >
                {isLoadingUI ? (
                  <span className="flex items-center gap-2">
                    <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Loading
                  </span>
                ) : 'Open UI'}
              </button>
              <button
                onClick={handleUnloadPlugin}
                className="px-4 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-400 text-sm font-medium rounded-lg border border-red-500/30 transition-all"
              >
                Unload
              </button>
            </div>
          </div>

          {/* Plugin UI Container */}
          {showPluginUI && (
            <div
              ref={pluginUIRef}
              className="mb-4 p-3 bg-black/40 rounded-lg border border-white/10 overflow-auto max-h-[300px] backdrop-blur-sm"
            />
          )}

          {/* Parameter Sliders */}
          {parameters.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="h-px flex-1 bg-gradient-to-r from-white/10 to-transparent" />
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Parameters</span>
                <div className="h-px flex-1 bg-gradient-to-l from-white/10 to-transparent" />
              </div>
              <div className="grid gap-3 max-h-[400px] overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-white/10">
                {parameters.map(param => (
                  <div key={param.id} className="space-y-1.5">
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-300 font-medium">{param.label}</span>
                      <span className="text-amber-400 font-mono">{param.value.toFixed(2)}</span>
                    </div>
                    <input
                      type="range"
                      min={param.minValue}
                      max={param.maxValue}
                      step={(param.maxValue - param.minValue) / 100}
                      value={param.value}
                      onChange={(e) => handleParameterChange(param.id, parseFloat(e.target.value))}
                      className="w-full h-2 bg-white/10 rounded-full appearance-none cursor-pointer
                        [&::-webkit-slider-thumb]:appearance-none
                        [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4
                        [&::-webkit-slider-thumb]:rounded-full
                        [&::-webkit-slider-thumb]:bg-gradient-to-br [&::-webkit-slider-thumb]:from-amber-400 [&::-webkit-slider-thumb]:to-orange-500
                        [&::-webkit-slider-thumb]:shadow-[0_0_10px_rgba(245,158,11,0.5)]
                        [&::-webkit-slider-thumb]:cursor-pointer
                        [&::-webkit-slider-thumb]:transition-shadow
                        [&::-webkit-slider-thumb]:hover:shadow-[0_0_15px_rgba(245,158,11,0.7)]"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-gradient-to-br from-white/[0.03] to-transparent rounded-xl p-6 text-center border border-dashed border-white/10 backdrop-blur-sm">
          <div className="w-12 h-12 mx-auto mb-3 rounded-xl bg-white/5 flex items-center justify-center border border-white/10">
            <span className="text-2xl opacity-40">+</span>
          </div>
          <p className="text-slate-400 text-sm">No plugin loaded</p>
          <p className="text-slate-500 text-xs mt-1">Select a plugin below to get started</p>
        </div>
      )}

      {/* Error Display with Troubleshooting */}
      {loadError && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-5 backdrop-blur-sm shadow-[0_0_20px_rgba(245,158,11,0.1)]">
          <div className="flex items-start gap-4">
            <div className="w-6 h-6 rounded-full bg-amber-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
              <span className="text-amber-400 text-sm">âš </span>
            </div>
            <div className="flex-1">
              <p className="text-amber-400 text-sm font-bold mb-2">Plugin Notice</p>
              <div className="text-amber-300/90 text-xs space-y-2 whitespace-pre-wrap leading-relaxed">
                {loadError}
              </div>
              {parameters.length > 0 && (
                <div className="mt-3 pt-3 border-t border-amber-500/20">
                  <p className="text-amber-400/80 text-xs font-medium">
                    Fallback parameter controls available below
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Available Plugins */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <div className="h-px flex-1 bg-gradient-to-r from-white/10 to-transparent" />
          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Available Plugins</span>
          <div className="h-px flex-1 bg-gradient-to-l from-white/10 to-transparent" />
        </div>
        <div className="grid gap-2 max-h-[300px] overflow-y-auto pr-2">
          {plugins.map(plugin => (
            <div
              key={plugin.id}
              className={`bg-gradient-to-br from-white/[0.05] to-white/[0.02] rounded-xl p-4 transition-all border backdrop-blur-sm ${
                plugin.isLoaded
                  ? 'border-green-500/30 shadow-[0_0_15px_rgba(34,197,94,0.1)]'
                  : plugin.availability === 'available'
                    ? 'border-white/10 hover:border-amber-500/30 hover:shadow-[0_0_15px_rgba(245,158,11,0.1)] cursor-pointer'
                    : 'border-white/5 opacity-60'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="font-bold text-white truncate">{plugin.name}</h4>
                    {getAvailabilityBadge(plugin)}
                  </div>
                  <p className="text-xs text-slate-400 truncate">{plugin.description}</p>
                  <p className="text-[10px] text-slate-500 mt-1">{plugin.vendor}</p>
                </div>
                <div className="flex flex-col items-end gap-2">
                  {plugin.isLoaded ? (
                    <button
                      onClick={handleUnloadPlugin}
                      className="px-4 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-400 font-bold rounded-lg border border-red-500/30 transition-all"
                    >
                      Unload
                    </button>
                  ) : plugin.availability === 'available' && (
                    <button
                      onClick={() => handleLoadPlugin(plugin.id)}
                      disabled={isLoading}
                      className="px-4 py-2 bg-slate-900 text-orange-400 font-bold rounded-lg shadow-[4px_4px_12px_rgba(0,0,0,0.5),_1px_1px_3px_rgba(255,255,255,0.03)] hover:shadow-[6px_6px_16px_rgba(0,0,0,0.6),_2px_2px_4px_rgba(255,255,255,0.04)] hover:text-orange-300 active:shadow-[inset_2px_2px_6px_rgba(0,0,0,0.8),inset_-1px_-1px_3px_rgba(255,255,255,0.02)] active:translate-y-[1px] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isLoading ? (
                        <span className="flex items-center gap-2">
                          <span className="w-3 h-3 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                        </span>
                      ) : 'Load'}
                    </button>
                  )}
                  {plugin.availability === 'unavailable' && (
                    <div className="flex flex-col items-end gap-2">
                      <button
                        onClick={() => handleRetryPlugin(plugin.id)}
                        disabled={retryingPluginId === plugin.id}
                        className="px-3 py-1.5 bg-white/5 hover:bg-white/10 text-white text-xs font-medium rounded-lg border border-white/10 transition-all disabled:opacity-50"
                      >
                        {retryingPluginId === plugin.id ? (
                          <span className="flex items-center gap-2">
                            <span className="w-2 h-2 border border-white/30 border-t-white rounded-full animate-spin" />
                            Retry
                          </span>
                        ) : 'Retry'}
                      </button>
                      <span className="text-[10px] text-red-400/70 max-w-[100px] truncate" title={plugin.error}>
                        {plugin.error || 'Network error'}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Info Footer */}
      <div className="flex items-center gap-3 pt-3 border-t border-white/5">
        <div className="w-4 h-4 rounded bg-blue-500/20 flex items-center justify-center">
          <span className="text-blue-300 text-[10px]">i</span>
        </div>
        <p className="text-[10px] text-slate-500">
          WAM 2.0 plugins load from external servers. Availability depends on network and CORS policies.
        </p>
      </div>
    </div>
  );
};
