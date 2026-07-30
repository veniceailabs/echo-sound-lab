import React, { useRef } from 'react';
import { motion } from 'framer-motion';
import type { AnalysisResult, AudioMetrics, ProcessingConfig, ReferenceTrack } from '../types';
import type { FinishLoopAnalysis } from '../services/finishing/finishLoopEngine';
import type { ReferenceDeltaAnalysis } from '../services/finishing/referenceDeltaEngine';
import type { SessionFinishAuthorityAnalysis } from '../services/finishing/sessionFinishAuthority';
import type { FullStudioStatus } from '../services/fullStudioSuite';
import type { AudioEngineSnapshot, MasteringQualityMode } from '../services/audioEngine';
import type { ServiceTemplate } from '../services/ServiceTemplates';

interface StudioCommandCenterProps {
  analysisResult: AnalysisResult | null;
  originalMetrics: AudioMetrics | null;
  processedMetrics: AudioMetrics | null;
  currentConfig: ProcessingConfig;
  referenceTrack: ReferenceTrack | null;
  referenceDelta: ReferenceDeltaAnalysis | null;
  finishLoop: FinishLoopAnalysis | null;
  sessionFinish: SessionFinishAuthorityAnalysis | null;
  fullStudioStatus: FullStudioStatus;
  isAutoMixing: boolean;
  isTimelineDispatching: boolean;
  isTimelineIntentGenerating: boolean;
  onFullStudioAutoMix: () => void;
  onApplyAutomationPlan: () => void;
  onSimpleStart: () => void;
  onOpenAdvancedGuide: () => void;
  engineSnapshot: AudioEngineSnapshot;
  masteringQualityMode: MasteringQualityMode;
  onMasteringQualityModeChange: (mode: MasteringQualityMode) => void;
  serviceTemplates: ServiceTemplate[];
  onApplyServiceTemplate: (templateId: ServiceTemplate['templateId']) => void;
  onExportSessionPackage: () => void;
  onImportSessionPackage: (file: File) => Promise<void>;
}

type HealthTone = 'emerald' | 'amber' | 'rose';

const toneStyles: Record<HealthTone, string> = {
  emerald: 'border-emerald-400/25 bg-emerald-500/10 text-emerald-200',
  amber: 'border-amber-400/25 bg-amber-500/10 text-amber-200',
  rose: 'border-rose-400/25 bg-rose-500/10 text-rose-200',
};

const panelCard = 'rounded-2xl border border-white/10 bg-white/[0.04] p-4 shadow-[0_10px_30px_rgba(0,0,0,0.22)]';

function countEnabledProcessing(config: ProcessingConfig): number {
  const items = [
    config.eq,
    config.compression,
    config.saturation,
    config.transientShaper,
    config.stereoImager,
    config.motionReverb,
    config.limiter,
    config.pitch,
    config.deEsser,
    config.dynamicEq,
  ];

  return items.reduce((count, item) => {
    if (!item) return count;
    if (typeof item === 'object' && 'enabled' in item) {
      return count + (item.enabled ? 1 : 0);
    }
    return count + 1;
  }, 0);
}

function resolveTone(
  fullStudioStatus: FullStudioStatus,
  finishLoop: FinishLoopAnalysis | null,
  sessionFinish: SessionFinishAuthorityAnalysis | null
): HealthTone {
  if (fullStudioStatus === 'error') return 'rose';
  if (fullStudioStatus === 'loading') return 'amber';
  if (sessionFinish?.verdict === 'ready' || finishLoop?.verdict === 'PASS') return 'emerald';
  return 'amber';
}

function metricValue(value?: number | null, fractionDigits = 1): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return value.toFixed(fractionDigits);
}

export function StudioCommandCenter({
  analysisResult,
  originalMetrics,
  processedMetrics,
  currentConfig,
  referenceTrack,
  referenceDelta,
  finishLoop,
  sessionFinish,
  fullStudioStatus,
  isAutoMixing,
  isTimelineDispatching,
  isTimelineIntentGenerating,
  onFullStudioAutoMix,
  onApplyAutomationPlan,
  onSimpleStart,
  onOpenAdvancedGuide,
  engineSnapshot,
  masteringQualityMode,
  onMasteringQualityModeChange,
  serviceTemplates,
  onApplyServiceTemplate,
  onExportSessionPackage,
  onImportSessionPackage,
}: StudioCommandCenterProps) {
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const activeStages = countEnabledProcessing(currentConfig);
  const healthTone = resolveTone(fullStudioStatus, finishLoop, sessionFinish);
  const selectedActions = (analysisResult?.actions ?? []).filter((action) => action?.isSelected && !action?.isApplied);
  const topActions = selectedActions.slice(0, 3);
  const nextMove =
    finishLoop?.recommendations?.[0] ||
    sessionFinish?.recommendations?.[0] ||
    referenceDelta?.recommendations?.[0] ||
    analysisResult?.genrePrediction ||
    'Hold the current direction and continue with the cleanest move available.';

  const originalLufs = originalMetrics?.lufs?.integrated;
  const processedLufs = processedMetrics?.lufs?.integrated;
  const lufsShift = originalLufs != null && processedLufs != null ? processedLufs - originalLufs : null;
  const crestShift = originalMetrics && processedMetrics ? processedMetrics.crestFactor - originalMetrics.crestFactor : null;
  const masterState = sessionFinish?.verdict ?? finishLoop?.verdict ?? (analysisResult?.mixReadiness ?? 'in_progress');
  const telemetryFlags = Object.entries(engineSnapshot.activeFlags)
    .filter(([, enabled]) => enabled)
    .map(([key]) => key.replace(/([A-Z])/g, ' $1').replace(/^./, (char) => char.toUpperCase()));
  const sessionSummary = `${serviceTemplates.length} templates ready`;

  return (
    <motion.section
      className="mt-5 rounded-[28px] border border-white/10 bg-[linear-gradient(135deg,rgba(15,23,42,0.96),rgba(7,11,24,0.9))] p-5 shadow-[0_22px_60px_rgba(0,0,0,0.45)]"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-2xl">
          <p className="text-[10px] uppercase tracking-[0.3em] text-cyan-300/80">Studio Command Center</p>
          <h2 className="mt-2 text-2xl font-bold tracking-tight text-white sm:text-3xl">
            One glance. One decision. One cleaner master.
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            The studio now reads like a control room: signal health, reference pressure, finishing authority, and the next move are all surfaced together.
          </p>
        </div>

        <div className={`rounded-2xl border px-4 py-3 ${toneStyles[healthTone]}`}>
          <div className="text-[10px] uppercase tracking-[0.2em] opacity-70">Studio state</div>
          <div className="mt-1 text-lg font-semibold capitalize">{fullStudioStatus}</div>
          <div className="mt-1 text-xs opacity-80">
            {sessionFinish?.verdict === 'ready'
              ? 'Finish authority is ready to lock.'
              : finishLoop?.verdict === 'PASS'
                ? 'The finish loop is ready to close.'
                : 'The studio is still collecting leverage.'}
          </div>
        </div>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-[1.2fr_0.9fr_0.9fr]">
        <div className={panelCard}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] uppercase tracking-[0.22em] text-slate-500">Signal Brief</p>
              <p className="mt-1 text-lg font-semibold text-white">Current mix position</p>
            </div>
            <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-slate-300">
              {activeStages} active stages
            </span>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-xl border border-white/10 bg-black/20 p-3">
              <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">LUFS</div>
              <div className="mt-1 text-lg font-mono font-semibold text-white">
                {metricValue(processedLufs ?? originalLufs)}
              </div>
              <div className="text-[11px] text-slate-500">
                {lufsShift != null ? `${lufsShift > 0 ? '+' : ''}${lufsShift.toFixed(1)} vs source` : 'source or processed'}
              </div>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/20 p-3">
              <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Crest</div>
              <div className="mt-1 text-lg font-mono font-semibold text-white">
                {metricValue(processedMetrics?.crestFactor ?? originalMetrics?.crestFactor)}
              </div>
              <div className="text-[11px] text-slate-500">
                {crestShift != null ? `${crestShift > 0 ? '+' : ''}${crestShift.toFixed(1)} dB shift` : 'dynamic range'}
              </div>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/20 p-3">
              <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Reference</div>
              <div className="mt-1 text-lg font-semibold text-white">
                {referenceTrack?.name ?? 'None loaded'}
              </div>
              <div className="text-[11px] text-slate-500">
                {referenceDelta?.matchScore != null ? `${referenceDelta.matchScore}% match` : 'No reference delta yet'}
              </div>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/20 p-3">
              <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Authority</div>
              <div className="mt-1 text-lg font-semibold text-white capitalize">
                {String(masterState).replace(/_/g, ' ')}
              </div>
              <div className="text-[11px] text-slate-500">
                {analysisResult?.mixReadiness ?? 'in progress'}
              </div>
            </div>
          </div>

          <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[10px] uppercase tracking-[0.22em] text-slate-500">Next best move</p>
              <span className="text-[10px] uppercase tracking-[0.18em] text-cyan-300">Actionable</span>
            </div>
            <p className="mt-2 text-sm leading-6 text-slate-200">{nextMove}</p>
          </div>

          <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[10px] uppercase tracking-[0.22em] text-slate-500">Render path</p>
              <span className="text-[10px] uppercase tracking-[0.18em] text-slate-400">{engineSnapshot.recommendedRenderPath}</span>
            </div>
            <p className="mt-2 text-sm text-slate-200">{engineSnapshot.renderPathReason}</p>
            {engineSnapshot.warnings.length > 0 && (
              <div className="mt-3 space-y-1">
                {engineSnapshot.warnings.map((warning) => (
                  <p key={warning} className="text-xs text-amber-300">{warning}</p>
                ))}
              </div>
            )}
          </div>

          <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[10px] uppercase tracking-[0.22em] text-slate-500">Session interchange</p>
              <span className="text-[10px] uppercase tracking-[0.18em] text-cyan-300">{engineSnapshot.masteringQualityMode}</span>
            </div>
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Package profile</div>
                <div className="mt-1 text-sm font-semibold text-white">{sessionSummary}</div>
                <div className="mt-1 text-xs text-slate-400">
                  Chain {engineSnapshot.chainSignature ?? 'unbuilt'} · {engineSnapshot.recommendedRenderPath}
                </div>
              </div>
              <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Export / import</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={onExportSessionPackage}
                    className="rounded-lg border border-cyan-400/30 bg-cyan-500/10 px-3 py-2 text-[11px] uppercase tracking-[0.12em] text-cyan-100 hover:bg-cyan-500/20"
                  >
                    Export package
                  </button>
                  <button
                    type="button"
                    onClick={() => importInputRef.current?.click()}
                    className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-[11px] uppercase tracking-[0.12em] text-slate-200 hover:bg-white/[0.08]"
                  >
                    Import package
                  </button>
                  <input
                    ref={importInputRef}
                    type="file"
                    accept=".json,application/json"
                    className="hidden"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (!file) return;
                      void onImportSessionPackage(file);
                      event.currentTarget.value = '';
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className={panelCard}>
          <p className="text-[10px] uppercase tracking-[0.22em] text-slate-500">Priority moves</p>
          <div className="mt-3 space-y-3">
            {topActions.length > 0 ? topActions.map((action) => (
              <div key={action.id} className="rounded-xl border border-white/10 bg-black/20 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-semibold text-white">{action.label}</div>
                  <span className="rounded-full border border-white/10 px-2 py-1 text-[10px] uppercase tracking-[0.16em] text-slate-400">
                    {action.category}
                  </span>
                </div>
                <p className="mt-2 text-xs leading-5 text-slate-400">{action.description}</p>
              </div>
            )) : (
              <div className="rounded-xl border border-white/10 bg-black/20 p-4 text-sm text-slate-400">
                No selected actions yet. Run analysis or apply a reference pass to surface the strongest moves.
              </div>
            )}
          </div>

          <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[10px] uppercase tracking-[0.22em] text-slate-500">Quality mode</p>
              <span className="text-[10px] uppercase tracking-[0.18em] text-cyan-300">{masteringQualityMode}</span>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2">
              {(['speed', 'balanced', 'fidelity'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => onMasteringQualityModeChange(mode)}
                  className={`rounded-xl border px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.16em] transition-colors ${
                    masteringQualityMode === mode
                      ? 'border-cyan-400/30 bg-cyan-500/20 text-cyan-100'
                      : 'border-white/10 bg-white/[0.03] text-slate-300 hover:bg-white/[0.06]'
                  }`}
                >
                  {mode}
                </button>
              ))}
            </div>
            <div className="mt-3 text-xs text-slate-400">
              {masteringQualityMode === 'speed' && 'Minimize overhead and keep renders lean.'}
              {masteringQualityMode === 'balanced' && 'Default path: deterministic and practical.'}
              {masteringQualityMode === 'fidelity' && 'Prefer the most faithful render path available.'}
            </div>
          </div>
        </div>

        <div className={panelCard}>
          <p className="text-[10px] uppercase tracking-[0.22em] text-slate-500">Start guide</p>
          <div className="mt-3 rounded-2xl border border-white/10 bg-black/20 p-4">
            <p className="text-sm font-semibold text-white">Three steps for new users</p>
            <ol className="mt-3 space-y-2 text-sm text-slate-300">
              <li className="flex gap-3">
                <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-cyan-400/25 bg-cyan-500/10 text-[10px] font-semibold text-cyan-200">1</span>
                <span>Upload or import one track.</span>
              </li>
              <li className="flex gap-3">
                <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-cyan-400/25 bg-cyan-500/10 text-[10px] font-semibold text-cyan-200">2</span>
                <span>Press Do It For Me and let the studio handle the rest.</span>
              </li>
              <li className="flex gap-3">
                <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-cyan-400/25 bg-cyan-500/10 text-[10px] font-semibold text-cyan-200">3</span>
                <span>Export when it sounds right, or open the advanced guide if you want to step in.</span>
              </li>
            </ol>
          </div>

          <div className="mt-3 space-y-3">
            <button
              type="button"
              onClick={onSimpleStart}
              disabled={isAutoMixing || isTimelineDispatching || isTimelineIntentGenerating}
              className="w-full rounded-2xl border border-cyan-400/30 bg-cyan-400 px-4 py-3 text-sm font-semibold text-slate-950 transition-colors hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isAutoMixing ? 'Running…' : 'Do It For Me'}
            </button>
            <button
              type="button"
              onClick={onOpenAdvancedGuide}
              className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-slate-200 transition-colors hover:bg-white/10"
            >
              Advanced guide
            </button>
          </div>

          <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[10px] uppercase tracking-[0.22em] text-slate-500">Template vault</p>
              <span className="text-[10px] uppercase tracking-[0.18em] text-slate-400">{serviceTemplates.length}</span>
            </div>
            <div className="mt-3 space-y-2">
              {serviceTemplates.slice(0, 3).map((template) => (
                <button
                  key={template.templateId}
                  type="button"
                  onClick={() => onApplyServiceTemplate(template.templateId)}
                  className="w-full rounded-xl border border-white/10 bg-white/[0.03] p-3 text-left hover:bg-white/[0.06]"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-semibold text-white">{template.name}</div>
                    <span className="rounded-full border border-white/10 px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-slate-400">
                      {template.category}
                    </span>
                  </div>
                  <p className="mt-2 text-xs leading-5 text-slate-400">{template.summary}</p>
                </button>
              ))}
            </div>
            <p className="mt-3 text-[10px] text-slate-500">
              These are the built-in starting points for the content ecosystem: fast, repeatable, and shippable.
            </p>
          </div>

          <div className="mt-4 grid gap-2">
            <div className="rounded-xl border border-white/10 bg-black/20 p-3">
              <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Loaded reference</div>
              <div className="mt-1 text-sm font-semibold text-white">{referenceTrack?.name ?? 'No reference loaded'}</div>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/20 p-3">
              <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Monitoring</div>
              <div className="mt-1 text-sm font-semibold text-white">
                {processedMetrics?.lufs?.truePeak != null
                  ? `${metricValue(processedMetrics.lufs.truePeak)} dBTP`
                  : 'Source-level view'}
              </div>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/20 p-3">
              <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Routing</div>
              <div className="mt-1 text-sm font-semibold text-white">
                {engineSnapshot.routingGraph.nodeCount > 0
                  ? `${engineSnapshot.routingGraph.nodeCount} nodes / ${engineSnapshot.routingGraph.edgeCount} edges`
                  : 'Routing graph not yet built'}
              </div>
              <div className="mt-1 text-[11px] text-slate-500">
                {engineSnapshot.routingGraph.pluginCount} active plugins · {engineSnapshot.routingGraph.playbackMode} playback
              </div>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/20 p-3">
              <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Latency</div>
              <div className="mt-1 text-sm font-semibold text-white">
                {engineSnapshot.latency.baseLatencyMs != null || engineSnapshot.latency.outputLatencyMs != null
                  ? `${((engineSnapshot.latency.baseLatencyMs ?? 0) + (engineSnapshot.latency.outputLatencyMs ?? 0)).toFixed(1)} ms`
                  : 'Latency unavailable'}
              </div>
              <div className="mt-1 text-[11px] text-slate-500">
                {engineSnapshot.latency.latencyHint ? `Hint: ${engineSnapshot.latency.latencyHint}` : 'No latency hint reported'}
              </div>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/20 p-3">
              <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Telemetry</div>
              <div className="mt-1 flex flex-wrap gap-2">
                {telemetryFlags.length > 0 ? telemetryFlags.map((flag) => (
                  <span key={flag} className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-slate-300">
                    {flag}
                  </span>
                )) : (
                  <span className="text-sm text-slate-400">No active stages</span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </motion.section>
  );
}
