import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ReplayTrackState } from '../services/deterministicReplayService';
import { pluginRegistry } from '../services/plugins/pluginRegistry';
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
}

export default function PluginRack({
  track,
  isReadOnly = false,
  onAddPlugin,
  onSetPluginParam,
}: PluginRackProps) {
  const { t, i18n } = useTranslation();
  const [isPaletteOpen, setIsPaletteOpen] = useState(false);
  const [selectedInstanceId, setSelectedInstanceId] = useState<string | null>(track.inserts?.[0]?.instanceId || null);

  const allManifests = useMemo(() => pluginRegistry.getAllPlugins(), []);
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

      {selectedPlugin && selectedManifest && (
        <PluginWindow
          trackId={track.trackId}
          pluginInstance={selectedPlugin}
          manifest={selectedManifest}
          isReadOnly={isReadOnly}
          onSetParam={onSetPluginParam}
        />
      )}
    </div>
  );
}
