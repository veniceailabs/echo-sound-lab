import React from 'react';
import type { EchoPluginManifest } from '../services/plugins/echoPlugin';
import { estimatePluginLatencyMs } from '../services/plugins/pluginRegistry';
import type { ReplayPluginInstance } from '../services/deterministicReplayService';

interface PluginWindowProps {
  trackId: string;
  pluginInstance: ReplayPluginInstance;
  manifest: EchoPluginManifest;
  isReadOnly?: boolean;
  onSetParam: (payload: {
    trackId: string;
    instanceId: string;
    paramId: string;
    value: number | boolean | string;
  }) => void;
}

function toNumber(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

export default function PluginWindow({
  trackId,
  pluginInstance,
  manifest,
  isReadOnly = false,
  onSetParam,
}: PluginWindowProps) {
  const estimatedLatencyMs = estimatePluginLatencyMs(manifest.manifestId, pluginInstance.parameters);
  return (
    <div className="rounded-xl border border-cyan-400/20 bg-cyan-950/20 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div>
          <p className="text-xs font-semibold text-cyan-200">{manifest.displayName}</p>
          <p className="text-[10px] text-cyan-300/80">{manifest.manifestId}</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className="rounded bg-cyan-500/15 px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-cyan-200">
            {manifest.category}
          </span>
          <span className="rounded bg-black/30 px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-slate-300">
            {estimatedLatencyMs.toFixed(2)} ms est. latency
          </span>
        </div>
      </div>

      <div className="space-y-2">
        {manifest.parameters.map((param) => {
          const currentValue =
            pluginInstance.parameters[param.id] !== undefined
              ? pluginInstance.parameters[param.id]
              : param.defaultValue;

          if (param.type === 'boolean') {
            return (
              <label key={param.id} className="flex items-center justify-between gap-2 rounded border border-white/10 bg-slate-900/50 px-2 py-1 text-[11px] text-slate-200">
                <span>{param.label}</span>
                <input
                  type="checkbox"
                  checked={Boolean(currentValue)}
                  disabled={isReadOnly}
                  onChange={(event) => {
                    onSetParam({
                      trackId,
                      instanceId: pluginInstance.instanceId,
                      paramId: param.id,
                      value: event.target.checked,
                    });
                  }}
                />
              </label>
            );
          }

          if (param.type === 'enum' && param.options) {
            return (
              <label key={param.id} className="flex items-center justify-between gap-2 rounded border border-white/10 bg-slate-900/50 px-2 py-1 text-[11px] text-slate-200">
                <span>{param.label}</span>
                <select
                  className="rounded border border-white/10 bg-slate-900 px-2 py-1 text-[11px]"
                  value={String(currentValue)}
                  disabled={isReadOnly}
                  onChange={(event) => {
                    onSetParam({
                      trackId,
                      instanceId: pluginInstance.instanceId,
                      paramId: param.id,
                      value: event.target.value,
                    });
                  }}
                >
                  {param.options.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            );
          }

          const min = typeof param.min === 'number' ? param.min : 0;
          const max = typeof param.max === 'number' ? param.max : 1;
          const step = typeof param.step === 'number' ? param.step : param.type === 'int' ? 1 : 0.01;
          const numericValue = toNumber(currentValue, toNumber(param.defaultValue, min));
          return (
            <label key={param.id} className="block rounded border border-white/10 bg-slate-900/50 px-2 py-1 text-[11px] text-slate-200">
              <div className="mb-1 flex items-center justify-between gap-2">
                <span>{param.label}</span>
                <span className="font-mono text-cyan-200">
                  {numericValue.toFixed(param.type === 'int' ? 0 : 3)}
                  {param.unit ? ` ${param.unit}` : ''}
                </span>
              </div>
              <input
                type="range"
                min={min}
                max={max}
                step={step}
                value={numericValue}
                disabled={isReadOnly}
                onChange={(event) => {
                  const value = Number(event.target.value);
                  onSetParam({
                    trackId,
                    instanceId: pluginInstance.instanceId,
                    paramId: param.id,
                    value,
                  });
                }}
                className="w-full accent-cyan-400"
              />
            </label>
          );
        })}
      </div>
    </div>
  );
}
