import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ReplayTrackState } from '../services/deterministicReplayService';
import { estimatePluginLatencyMs, pluginRegistry } from '../services/plugins/pluginRegistry';
import PluginWindow from './PluginWindow';

interface PluginRackProps {
  track: ReplayTrackState;
  isReadOnly?: boolean;
  onAddPlugin: (manifestId: string) => void;
  onSetPluginParam: (payload: {
    trackId: string;
    instanceId: string;
    paramId: string;
    value: number | boolean | string;
  }) => void;
  onMovePlugin?: (instanceId: string, direction: 'left' | 'right') => void;
  onRemovePlugin?: (instanceId: string) => void;
}

interface PluginRackPreset {
  presetId: string;
  name: string;
  manifestId: string;
  parameters: Record<string, number | boolean | string>;
  savedAt: number;
}

const PRESET_STORAGE_KEY = 'esl.pluginRackPresets.v1';

export default function PluginRack({
  track,
  isReadOnly = false,
  onAddPlugin,
  onSetPluginParam,
  onMovePlugin,
  onRemovePlugin,
}: PluginRackProps) {
  const { t, i18n } = useTranslation();
  const [isPaletteOpen, setIsPaletteOpen] = useState(false);
  const [selectedInstanceId, setSelectedInstanceId] = useState<string | null>(track.inserts?.[0]?.instanceId || null);
  const [presetName, setPresetName] = useState('');
  const [savedPresets, setSavedPresets] = useState<PluginRackPreset[]>([]);

  const allManifests = useMemo(() => pluginRegistry.getAllPlugins(), []);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(PRESET_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return;
      setSavedPresets(parsed.filter((entry): entry is PluginRackPreset => {
        return Boolean(entry)
          && typeof entry === 'object'
          && typeof (entry as PluginRackPreset).presetId === 'string'
          && typeof (entry as PluginRackPreset).name === 'string'
          && typeof (entry as PluginRackPreset).manifestId === 'string'
          && typeof (entry as PluginRackPreset).savedAt === 'number'
          && typeof (entry as PluginRackPreset).parameters === 'object';
      }));
    } catch {
      setSavedPresets([]);
    }
  }, []);

  const persistPresets = (nextPresets: PluginRackPreset[]) => {
    setSavedPresets(nextPresets);
    try {
      window.localStorage.setItem(PRESET_STORAGE_KEY, JSON.stringify(nextPresets));
    } catch {}
  };

  const grouped = useMemo(() => {
    const map = new Map<string, typeof allManifests>();
    for (const manifest of allManifests) {
      const categoryKey = manifest.category.toLowerCase();
      if (!map.has(categoryKey)) map.set(categoryKey, []);
      map.get(categoryKey)!.push(manifest);
    }
    return Array.from(map.entries()).sort((a, b) =>
      t(`pluginCategories.${a[0]}`, { defaultValue: a[0].toUpperCase() }).localeCompare(
        t(`pluginCategories.${b[0]}`, { defaultValue: b[0].toUpperCase() })
      )
    );
  }, [allManifests, i18n.language, t]);

  const inserts = track.inserts || [];
  const selectedPlugin = inserts.find((insert) => insert.instanceId === selectedInstanceId) || inserts[0] || null;
  const selectedManifest = selectedPlugin ? pluginRegistry.getManifest(selectedPlugin.manifestId) : null;
  const selectedManifestPresets = useMemo(
    () => savedPresets.filter((preset) => preset.manifestId === selectedPlugin?.manifestId),
    [savedPresets, selectedPlugin?.manifestId]
  );
  const selectedLatencyMs = selectedPlugin && selectedManifest
    ? estimatePluginLatencyMs(selectedManifest.manifestId, selectedPlugin.parameters)
    : 0;

  const saveCurrentPreset = () => {
    if (!selectedPlugin || !selectedManifest) return;
    const name = presetName.trim();
    if (!name) return;
    const nextPreset: PluginRackPreset = {
      presetId: `preset-${selectedPlugin.manifestId}-${Date.now().toString(36)}`,
      name,
      manifestId: selectedPlugin.manifestId,
      parameters: { ...(selectedPlugin.parameters || {}) },
      savedAt: Date.now(),
    };
    const nextPresets = [
      ...savedPresets.filter((preset) => !(preset.manifestId === nextPreset.manifestId && preset.name.toLowerCase() === nextPreset.name.toLowerCase())),
      nextPreset,
    ].sort((left, right) => right.savedAt - left.savedAt);
    persistPresets(nextPresets);
    setPresetName('');
  };

  const loadPreset = (preset: PluginRackPreset) => {
    if (!selectedPlugin || !selectedManifest) return;
    if (preset.manifestId !== selectedPlugin.manifestId) return;
    for (const [paramId, rawValue] of Object.entries(preset.parameters)) {
      onSetPluginParam({
        trackId: track.trackId,
        instanceId: selectedPlugin.instanceId,
        paramId,
        value: rawValue,
      });
    }
  };

  const deletePreset = (presetId: string) => {
    persistPresets(savedPresets.filter((preset) => preset.presetId !== presetId));
  };

  return (
    <div className="rounded-xl border border-white/10 bg-slate-950/50 p-2">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">
          {t('pluginRack.title', { defaultValue: 'Plugin Rack' })}
        </p>
        <button
          type="button"
          disabled={isReadOnly}
          onClick={() => setIsPaletteOpen((value) => !value)}
          className="rounded bg-slate-800 px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-slate-200 hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {t('pluginRack.addPlugin', { defaultValue: '+ Add Plugin' })}
        </button>
      </div>

      {isPaletteOpen && (
        <div className="mb-2 max-h-44 overflow-y-auto rounded border border-white/10 bg-slate-900/75 p-2">
          {grouped.map(([category, manifests]) => (
            <div key={category} className="mb-2 last:mb-0">
              <p className="mb-1 text-[10px] uppercase tracking-[0.12em] text-cyan-300/80">
                {t(`pluginCategories.${category}`, { defaultValue: category.toUpperCase() })}
              </p>
              <div className="space-y-1">
                {manifests.map((manifest) => (
                  <button
                    key={manifest.manifestId}
                    type="button"
                    disabled={isReadOnly}
                    onClick={() => {
                      onAddPlugin(manifest.manifestId);
                      setIsPaletteOpen(false);
                    }}
                    className="w-full rounded border border-white/10 bg-slate-800/70 px-2 py-1 text-left text-[11px] text-slate-200 hover:border-cyan-300/40 hover:bg-slate-700/70 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {manifest.displayName}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mb-2 flex flex-wrap gap-1">
        {inserts.length === 0 && (
          <p className="text-[11px] text-slate-500">
            {t('pluginRack.noInserts', { defaultValue: 'No inserts on this track.' })}
          </p>
        )}
        {inserts.map((insert) => (
          <button
            key={insert.instanceId}
            type="button"
            onClick={() => setSelectedInstanceId(insert.instanceId)}
            className={`rounded border px-2 py-1 text-[10px] uppercase tracking-[0.1em] ${
              selectedPlugin?.instanceId === insert.instanceId
                ? 'border-cyan-300/60 bg-cyan-500/20 text-cyan-100'
                : 'border-white/10 bg-slate-800/50 text-slate-200 hover:border-cyan-300/40'
            }`}
          >
            {pluginRegistry.getManifest(insert.manifestId)?.displayName || insert.manifestId}
          </button>
        ))}
      </div>

      {selectedPlugin && (
        <div className="mb-2 rounded border border-white/10 bg-black/20 p-2">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Selected Insert</p>
              <p className="text-sm text-slate-100">
                {pluginRegistry.getManifest(selectedPlugin.manifestId)?.displayName || selectedPlugin.manifestId}
              </p>
            </div>
            <div className="flex flex-wrap gap-1">
              {onMovePlugin && (
                <>
                  <button
                    type="button"
                    disabled={isReadOnly || inserts.indexOf(selectedPlugin) <= 0}
                    onClick={() => onMovePlugin(selectedPlugin.instanceId, 'left')}
                    className="rounded bg-slate-800 px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-slate-200 hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Prev
                  </button>
                  <button
                    type="button"
                    disabled={isReadOnly || inserts.indexOf(selectedPlugin) >= inserts.length - 1}
                    onClick={() => onMovePlugin(selectedPlugin.instanceId, 'right')}
                    className="rounded bg-slate-800 px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-slate-200 hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Next
                  </button>
                </>
              )}
              {onRemovePlugin && (
                <button
                  type="button"
                  disabled={isReadOnly}
                  onClick={() => onRemovePlugin(selectedPlugin.instanceId)}
                  className="rounded bg-rose-500/10 px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-rose-100 hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Remove
                </button>
              )}
            </div>
          </div>
          <p className="mt-2 text-[11px] text-slate-400">
            Chain position {inserts.findIndex((insert) => insert.instanceId === selectedPlugin.instanceId) + 1} of {inserts.length}
            {selectedPlugin.enabled === false ? ' · bypassed' : ''}
          </p>
          <p className="mt-1 text-[10px] uppercase tracking-[0.12em] text-cyan-200/70">
            {selectedLatencyMs.toFixed(2)} ms est. insert latency
          </p>
        </div>
      )}

      {selectedPlugin && selectedManifest && (
        <PluginWindow
          trackId={track.trackId}
          pluginInstance={selectedPlugin}
          manifest={selectedManifest}
          isReadOnly={isReadOnly}
          onSetParam={onSetPluginParam}
        />
      )}

      {selectedPlugin && selectedManifest && (
        <div className="mt-2 rounded border border-white/10 bg-black/15 p-2">
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              value={presetName}
              onChange={(event) => setPresetName(event.target.value)}
              placeholder="Preset name"
              disabled={isReadOnly}
              className="min-w-0 flex-1 rounded border border-white/10 bg-slate-900 px-2 py-1 text-[11px] text-slate-100 placeholder:text-slate-500"
            />
            <button
              type="button"
              onClick={saveCurrentPreset}
              disabled={isReadOnly || !presetName.trim()}
              className="rounded bg-emerald-500/15 px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-emerald-100 hover:bg-emerald-500/25 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Save Preset
            </button>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {selectedManifestPresets.length === 0 ? (
              <span className="text-[10px] text-slate-500">No presets saved for this insert.</span>
            ) : selectedManifestPresets.map((preset) => (
              <div key={preset.presetId} className="flex items-center gap-1 rounded border border-white/10 bg-slate-900/70 px-2 py-1">
                <button
                  type="button"
                  onClick={() => loadPreset(preset)}
                  disabled={isReadOnly}
                  className="text-[10px] uppercase tracking-[0.12em] text-cyan-100 hover:text-cyan-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {preset.name}
                </button>
                <button
                  type="button"
                  onClick={() => deletePreset(preset.presetId)}
                  disabled={isReadOnly}
                  className="text-[10px] uppercase tracking-[0.12em] text-rose-100 hover:text-rose-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  x
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
