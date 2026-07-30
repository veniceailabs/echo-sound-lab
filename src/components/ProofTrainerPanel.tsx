import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { audioEngine } from '../services/audioEngine';
import {
  preflightCoreProofTrainerUpload,
  renderCoreProofTrainerUpload,
  submitCoreProofTrainerFeedback,
  type CoreProofTrainerSessionPreflight,
  type CoreProofTrainerResult,
} from '../services/coreApi';
import {
  buildProofTrainerSessionManifest,
  buildProofTrainerTracksFromFiles,
  type ProofTrainerSessionManifest,
} from '../services/sessionAlignmentService';
import {
  classifySessionFiles,
  inferSessionImportRole,
  type SessionImportBundle,
  type SessionImportTrack,
} from '../services/sessionImportService';
import {
  importLogicSessionSnapshot,
  matchLogicSnapshotToImport,
  type LogicSessionSnapshot,
} from '../services/logicSessionSnapshotService';
import {
  importProofTrainerBlueprint,
  matchProofTrainerBlueprint,
  type ProofTrainerBlueprint,
} from '../services/proofTrainerBlueprintService';
import {
  importProofTrainerArtifactBundle,
  type ProofTrainerArtifactBundle,
} from '../services/proofTrainerArtifactBundleService';
import { SessionPackageTree } from './SessionPackageTree';
import {
  loadProofTrainerPresetArtifactBundle,
  loadProofTrainerPresetBlueprint,
  loadProofTrainerPresetManifest,
  type ProofTrainerPresetManifestEntry,
} from '../services/proofTrainerPresetRegistryService';

type TrainerStatus = 'idle' | 'preflighting' | 'uploading' | 'rendering' | 'done' | 'error' | 'saving-feedback';

const styleOptions = [
  { value: '40 Drake Toronto Depth', label: '40 / Drake Depth' },
  { value: 'Navy Blue Underground', label: 'Navy Blue Underground' },
  { value: 'MixedByAli Crisp', label: 'MixedByAli Crisp' },
  { value: 'proof_mix_trainer', label: 'Neutral Proof' },
];

const formatSeconds = (value: number | null | undefined): string => {
  if (value == null || Number.isNaN(value)) return '—';
  return `${value.toFixed(3)}s`;
};

const fileName = (path: string): string => path.split(/[\\/]/).pop() || path;
const formatMs = (value: number | null | undefined): string => {
  if (value == null || Number.isNaN(value)) return '—';
  if (value < 1000) return `${value} ms`;
  return `${(value / 1000).toFixed(2)} s`;
};

export const ProofTrainerPanel: React.FC = () => {
  const [beatFile, setBeatFile] = useState<File | null>(null);
  const [vocalFiles, setVocalFiles] = useState<File[]>([]);
  const [referenceFile, setReferenceFile] = useState<File | null>(null);
  const [referenceStyle, setReferenceStyle] = useState(styleOptions[0].value);
  const [changeRequest, setChangeRequest] = useState('');
  const [acceptToVault, setAcceptToVault] = useState(true);
  const [feedbackScore, setFeedbackScore] = useState(0.9);
  const [feedbackNote, setFeedbackNote] = useState('Raw vocal proof accepted.');
  const [status, setStatus] = useState<TrainerStatus>('idle');
  const [result, setResult] = useState<CoreProofTrainerResult | null>(null);
  const [preflight, setPreflight] = useState<CoreProofTrainerSessionPreflight | null>(null);
  const [sessionManifest, setSessionManifest] = useState<ProofTrainerSessionManifest | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [feedbackMixId, setFeedbackMixId] = useState<number | null>(null);
  const [arrangementConfirmed, setArrangementConfirmed] = useState(false);
  const [sessionImportWarnings, setSessionImportWarnings] = useState<string[]>([]);
  const [sessionImportBundle, setSessionImportBundle] = useState<SessionImportBundle<File> | null>(null);
  const [logicSnapshot, setLogicSnapshot] = useState<LogicSessionSnapshot | null>(null);
  const [logicSnapshotFileName, setLogicSnapshotFileName] = useState<string | null>(null);
  const [blueprint, setBlueprint] = useState<ProofTrainerBlueprint | null>(null);
  const [blueprintFileName, setBlueprintFileName] = useState<string | null>(null);
  const [artifactBundleFileName, setArtifactBundleFileName] = useState<string | null>(null);
  const [isLoadingPreset, setIsLoadingPreset] = useState(false);
  const [presetEntries, setPresetEntries] = useState<ProofTrainerPresetManifestEntry[]>([]);

  const sessionFolderInputProps = { webkitdirectory: '', directory: '' } as any;

  const canRender = Boolean(beatFile && vocalFiles.length > 0);
  const selectedSummary = useMemo(() => {
    if (!result) return null;
    return {
      vocals: result.selected_vocals.length,
      missing: result.missing_parts.join(', ') || 'none',
      lufs: typeof result.metrics.integrated_lufs === 'number' ? result.metrics.integrated_lufs : null,
      truePeak: typeof result.metrics.true_peak_db === 'number' ? result.metrics.true_peak_db : null,
    };
  }, [result]);

  const manifestPreview = useMemo(
    () => ({
      beat: beatFile?.name ?? null,
      vocalCount: vocalFiles.length,
      reference: referenceFile?.name ?? null,
      referenceStyle,
      acceptToVault,
      vocalRoles: vocalFiles.map((file, index) => ({ file: file.name, role: inferSessionImportRole(file.name, index) })),
      missingRoles: ['lead', 'double', 'adlib'].filter((role) => !vocalFiles.some((file, index) => inferSessionImportRole(file.name, index) === role)),
      hasRequiredInputs: Boolean(beatFile && vocalFiles.length > 0),
    }),
    [acceptToVault, beatFile, referenceFile, referenceStyle, vocalFiles.length],
  );

  const manifestTracks = useMemo(() => {
    if (sessionManifest) {
      return sessionManifest.tracks.map((track) => ({
        id: track.trackId,
        role: track.role,
        filePath: track.fileName,
        startMs: track.start_timestamp_ms,
        trimStartMs: track.trim_start_ms,
        trimEndMs: track.trim_end_ms,
        sourceKind: track.kind,
      }));
    }
    const tracks = Array.isArray(preflight?.manifest?.tracks) ? preflight?.manifest?.tracks as Array<Record<string, unknown>> : [];
    return tracks.map((track, index) => ({
      id: String(track.track_id ?? `track-${index}`),
      role: String(track.role ?? 'unknown'),
      filePath: String(track.file_path ?? track.source_path ?? ''),
      startMs: Number(track.start_timestamp_ms ?? 0),
      trimStartMs: Number(track.trim_start_ms ?? 0),
      trimEndMs: track.trim_end_ms == null ? null : Number(track.trim_end_ms),
      sourceKind: String(track.source_kind ?? 'other'),
    }));
  }, [preflight, sessionManifest]);

  const manifestDurationMs = useMemo(() => {
    const rawDuration = Number(sessionManifest?.duration_ms ?? preflight?.manifest?.duration_ms ?? 0);
    if (Number.isFinite(rawDuration) && rawDuration > 0) return rawDuration;
    return manifestTracks.reduce((maxValue, track) => Math.max(maxValue, track.trimEndMs ?? track.startMs), 0) || 1000;
  }, [preflight, manifestTracks, sessionManifest]);

  const duplicateRows = useMemo(() => {
    const duplicates = preflight?.duplicate_report?.duplicates;
    return Array.isArray(duplicates) ? duplicates : [];
  }, [preflight]);
  const logicMatchSummary = useMemo(
    () => (logicSnapshot && sessionImportBundle ? matchLogicSnapshotToImport(logicSnapshot, sessionImportBundle) : null),
    [logicSnapshot, sessionImportBundle],
  );
  const blueprintMatchSummary = useMemo(
    () => (blueprint ? matchProofTrainerBlueprint(blueprint, sessionImportBundle, referenceFile) : null),
    [blueprint, referenceFile, sessionImportBundle],
  );
  const sessionSourceLabel = sessionImportBundle?.sourceDetections?.[0]
    ? `${sessionImportBundle.sourceDetections[0].displayName} (${sessionImportBundle.sourceDetections[0].confidence}/10)`
    : sessionImportBundle?.sourceApp && sessionImportBundle.sourceApp !== 'unknown'
      ? sessionImportBundle.sourceApp
      : null;

  useEffect(() => {
    setArrangementConfirmed(false);
    setPreflight(null);
    setSessionManifest(null);
    setResult(null);
    setFeedbackMixId(null);
    setError(null);
    setStatus('idle');
  }, [beatFile, referenceFile, referenceStyle, vocalFiles]);

  useEffect(() => {
    let active = true;
    void loadProofTrainerPresetManifest()
      .then((manifest) => {
        if (!active) return;
        setPresetEntries(manifest.presets);
      })
      .catch((err) => {
        if (!active) return;
        console.warn('[ProofTrainer] Failed to load preset manifest', err);
      });
    return () => {
      active = false;
    };
  }, []);

  const loadFiles = (list: FileList | null, setter: (files: File[]) => void) => {
    if (!list) return;
    const files = Array.from(list).filter((file) => file.type.startsWith('audio/') || /\.(wav|wave|mp3|m4a|aac|flac|aif|aiff|ogg)$/i.test(file.name));
    setter(files);
  };

  const clearImportedSessionAudit = () => {
    setSessionImportBundle(null);
    setSessionImportWarnings([]);
  };

  const handleSessionImport = async (list: FileList | null) => {
    if (!list) return;
    const files = Array.from(list);
    const imported = classifySessionFiles(files);
    const lowerNames = files.map((file) => `${file.webkitRelativePath || file.name}`.toLowerCase());
    const artifactBundleFile =
      files.find((file) => /\.artifact-bundle\.json$/i.test(file.name)) ??
      files.find((file) => lowerNames.some((name) => name.includes('artifact bundle')) && file.name.toLowerCase().endsWith('.json')) ??
      null;
    const blueprintFile =
      files.find((file) => /\.proof-trainer-blueprint\.json$/i.test(file.name)) ??
      files.find((file) => lowerNames.some((name) => name.includes('blueprint')) && file.name.toLowerCase().endsWith('.json')) ??
      null;
    const logicSnapshotFile =
      files.find((file) => /\.esl-logic-session\.json$/i.test(file.name)) ??
      files.find((file) => lowerNames.some((name) => name.includes('logic')) && file.name.toLowerCase().endsWith('.json')) ??
      null;

    setBeatFile(imported.beatFile);
    setVocalFiles(imported.vocalFiles);
    setReferenceFile(imported.referenceFile);
    setSessionImportWarnings(imported.warnings);
    setSessionImportBundle(imported);
    setError(null);

    if (artifactBundleFile) {
      const artifactBundle = await importProofTrainerArtifactBundle(artifactBundleFile);
      if (artifactBundle) {
        applyLoadedArtifactBundle(artifactBundle, artifactBundleFile.name);
        return;
      }
    }

    if (logicSnapshotFile) {
      const snapshot = await importLogicSessionSnapshot(logicSnapshotFile);
      if (snapshot) {
        setLogicSnapshot(snapshot);
        setLogicSnapshotFileName(logicSnapshotFile.name);
      }
    }

    if (blueprintFile) {
      const importedBlueprint = await importProofTrainerBlueprint(blueprintFile);
      if (importedBlueprint) {
        applyLoadedBlueprint(importedBlueprint, blueprintFile.name);
      }
    }
  };

  const handleLogicSnapshotImport = async (file: File | null) => {
    if (!file) return;
    const snapshot = await importLogicSessionSnapshot(file);
    if (!snapshot) {
      setError('Logic session snapshot is invalid. Export a fresh .esl-logic-session.json file first.');
      return;
    }
    setLogicSnapshot(snapshot);
    setLogicSnapshotFileName(file.name);
    setError(null);
  };

  const handleBlueprintImport = async (file: File | null) => {
    if (!file) return;
    const imported = await importProofTrainerBlueprint(file);
    if (!imported) {
      setError('Proof Trainer blueprint is invalid. Import a fresh .proof-trainer-blueprint.json file.');
      return;
    }
    applyLoadedBlueprint(imported, file.name);
    setError(null);
  };

  const applyLoadedArtifactBundle = (imported: ProofTrainerArtifactBundle, sourceLabel: string) => {
    setArtifactBundleFileName(sourceLabel);
    if (imported.blueprint) {
      applyLoadedBlueprint(imported.blueprint, `${sourceLabel} Blueprint`);
    }
    if (imported.logicSnapshot) {
      setLogicSnapshot(imported.logicSnapshot);
      setLogicSnapshotFileName(`${sourceLabel} Logic Snapshot`);
    }
    if (imported.blueprint?.referenceStyle) {
      setReferenceStyle(imported.blueprint.referenceStyle);
    }
  };

  const handleArtifactBundleImport = async (file: File | null) => {
    if (!file) return;
    const imported = await importProofTrainerArtifactBundle(file);
    if (!imported) {
      setError('Proof Trainer artifact bundle is invalid. Import a fresh .artifact-bundle.json file.');
      return;
    }
    applyLoadedArtifactBundle(imported, file.name);
    setError(null);
  };

  const applyLoadedBlueprint = (imported: ProofTrainerBlueprint, sourceLabel: string) => {
    setBlueprint(imported);
    setBlueprintFileName(sourceLabel);
    if (imported.logicSnapshot) {
      setLogicSnapshot(imported.logicSnapshot);
      setLogicSnapshotFileName(`${sourceLabel} Logic Snapshot`);
    }
    if (imported.referenceStyle) {
      setReferenceStyle(imported.referenceStyle);
    }
  };

  const handleLoadPreset = async (preset: ProofTrainerPresetManifestEntry) => {
    setIsLoadingPreset(true);
    setError(null);
    try {
      if (preset.artifactBundlePath) {
        const imported = await loadProofTrainerPresetArtifactBundle(preset);
        applyLoadedArtifactBundle(imported, `${preset.label} Built-in Preset`);
      } else {
        const imported = await loadProofTrainerPresetBlueprint(preset);
        applyLoadedBlueprint(imported, `${preset.label} Built-in Preset`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load bundled preset');
    } finally {
      setIsLoadingPreset(false);
    }
  };

  const renderImportedTrack = (track: SessionImportTrack<File>) => (
    <div key={track.relativePath} className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs text-slate-300">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="font-medium text-white">{track.displayName}</div>
        <div className="flex flex-wrap gap-2">
          <span className="rounded-full border border-cyan-400/20 bg-cyan-500/10 px-2 py-0.5 text-cyan-100">{track.kind}</span>
          <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-slate-200">{track.role}</span>
        </div>
      </div>
      <div className="mt-1 text-[11px] text-slate-500">{track.relativePath}</div>
      <div className="mt-2 text-[11px] text-slate-400">
        {track.reasons.join(' • ')}
      </div>
    </div>
  );

  const buildProofTrainerFormData = async () => {
    if (!beatFile) return null;
    const filesToDecode = [
      beatFile,
      ...vocalFiles,
      ...(referenceFile ? [referenceFile] : []),
    ];
    const decodedBuffers = new Map<string, AudioBuffer>();
    await Promise.all(filesToDecode.map(async (file) => {
      const buffer = await audioEngine.decodeFile(file);
      decodedBuffers.set(file.name, buffer);
    }));

    const decodedTracks = buildProofTrainerTracksFromFiles(beatFile, vocalFiles, referenceFile, decodedBuffers);
    const manifest = buildProofTrainerSessionManifest({
      beatFile: decodedTracks.find((track) => track.kind === 'beat' && track.fileName === beatFile.name) || null,
      vocalFiles: decodedTracks.filter((track) => track.kind === 'vocal'),
      referenceFile: referenceFile
        ? (decodedTracks.find((track) => track.kind === 'reference' && track.fileName === referenceFile.name) || null)
        : null,
      referenceStyle,
      requestText: changeRequest.trim(),
      acceptToVault,
    }) as ProofTrainerSessionManifest & {
      source_app?: string | null;
      source_package_confidence?: number | null;
      source_package_markers?: string[] | null;
      package_graph?: ProofTrainerSessionManifest['package_graph'];
    };

    if (sessionImportBundle?.sourceApp && sessionImportBundle.sourceApp !== 'unknown') {
      manifest.source_app = sessionImportBundle.sourceApp;
      manifest.source_package_confidence = sessionImportBundle.sourceDetections[0]?.confidence ?? null;
      manifest.source_package_markers = sessionImportBundle.sourceDetections.flatMap((detection) => detection.markers);
      manifest.package_graph = sessionImportBundle.packageGraph;
    }

    const formData = new FormData();
    formData.append('beat', beatFile);
    for (const vocal of vocalFiles) {
      formData.append('vocal_files', vocal);
    }
    if (referenceFile) {
      formData.append('reference_master', referenceFile);
    }
    formData.append('reference_style', referenceStyle);
    formData.append('request_text', changeRequest.trim());
    formData.append('accept_to_vault', String(acceptToVault));
    formData.append('session_manifest', JSON.stringify(manifest));
    formData.append(
      'feedback_json',
      JSON.stringify({
        score: feedbackScore,
        note: feedbackNote,
        request_text: changeRequest.trim(),
      }),
    );
    setSessionManifest(manifest);
    return formData;
  };

  const handlePreflight = async () => {
    if (!beatFile || vocalFiles.length === 0) {
      setError('Upload a beat and at least one vocal file.');
      return;
    }

    const formData = await buildProofTrainerFormData();
    if (!formData) return;

    setStatus('preflighting');
    setError(null);
    setArrangementConfirmed(false);

    try {
      const response = await preflightCoreProofTrainerUpload(formData);
      setPreflight(response.session_preflight);
      setStatus('idle');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Session preflight failed');
      setStatus('error');
    }
  };

  const handleRender = async () => {
    if (!beatFile || vocalFiles.length === 0) {
      setError('Upload a beat and at least one vocal file.');
      return;
    }
    if (!preflight?.safe_to_render) {
      setError('Run session preflight and clear the manifest warnings before rendering.');
      return;
    }
    if (!arrangementConfirmed) {
      setError('Confirm the arrangement after reviewing the timeline before rendering.');
      return;
    }

    const formData = await buildProofTrainerFormData();
    if (!formData) return;

    setStatus('uploading');
    setError(null);
    setResult(null);
    setFeedbackMixId(null);

    try {
      setStatus('rendering');
      const response = await renderCoreProofTrainerUpload(formData);
      setResult(response.result);
      setPreflight(response.session_preflight ?? null);
      setStatus('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Proof render failed');
      setStatus('error');
    }
  };

  const renderTrackBar = (track: { id: string; role: string; filePath: string; startMs: number; trimStartMs: number; trimEndMs: number | null; sourceKind?: string }) => {
    const duration = Math.max(1, (track.trimEndMs ?? manifestDurationMs) - track.trimStartMs);
    const left = Math.max(0, Math.min(100, (track.startMs / manifestDurationMs) * 100));
    const width = Math.max(2, Math.min(100 - left, (duration / manifestDurationMs) * 100));
    const tone = track.sourceKind === 'beat'
      ? 'from-orange-400/70 to-amber-300/60'
      : track.sourceKind === 'reference'
      ? 'from-violet-400/80 to-fuchsia-300/60'
      : track.role === 'lead'
      ? 'from-cyan-400/80 to-sky-300/60'
      : 'from-emerald-400/70 to-teal-300/60';
    return (
      <div key={track.id} className="rounded-xl border border-white/10 bg-black/20 p-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-white">{fileName(track.filePath) || track.id}</div>
            <div className="text-[11px] uppercase tracking-[0.16em] text-slate-500">
              {track.role}{track.sourceKind ? ` · ${track.sourceKind}` : ''}
            </div>
          </div>
          <div className="text-right text-xs text-slate-400">
            <div>Start {formatMs(track.startMs)}</div>
            <div>Trim {formatMs(track.trimStartMs)} → {formatMs(track.trimEndMs)}</div>
          </div>
        </div>
        <div className="mt-3 h-3 rounded-full bg-white/[0.05]">
          <div
            className={`h-3 rounded-full bg-gradient-to-r ${tone}`}
            style={{ marginLeft: `${left}%`, width: `${width}%` }}
          />
        </div>
      </div>
    );
  };

  const handleSaveFeedback = async () => {
    if (!result) {
      setError('Render a proof first.');
      return;
    }

    setStatus('saving-feedback');
    setError(null);

    try {
      const response = await submitCoreProofTrainerFeedback({
        report_path: result.report_path,
        feedback: {
          score: feedbackScore,
          note: feedbackNote,
          request_text: changeRequest.trim(),
          source: 'frontend_proof_trainer',
        },
        genre_label: referenceStyle,
      });
      setFeedbackMixId(response.mix_id);
      setStatus('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Feedback save failed');
      setStatus('error');
    }
  };

  return (
    <motion.section
      className="mt-5 rounded-[28px] border border-white/10 bg-[linear-gradient(135deg,rgba(10,14,27,0.96),rgba(14,20,38,0.9))] p-5 shadow-[0_22px_60px_rgba(0,0,0,0.45)]"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
    >
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div className="max-w-2xl">
          <p className="text-[10px] uppercase tracking-[0.3em] text-orange-300/80">Proof Trainer</p>
          <h2 className="mt-2 text-2xl font-bold tracking-tight text-white sm:text-3xl">
            Upload the raw session, render the proof, then lock the benchmark.
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            Beat, raw vocal prints, and an optional reference master are aligned, masked, and rendered into one complete proof session.
          </p>
          {presetEntries.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-3">
              {presetEntries.map((preset) => (
                <button
                  key={preset.presetId}
                  type="button"
                  onClick={() => void handleLoadPreset(preset)}
                  disabled={isLoadingPreset}
                  className="rounded-full border border-emerald-400/30 bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                  title={preset.summary}
                >
                  {isLoadingPreset ? 'Loading Preset...' : `Load ${preset.label}`}
                </button>
              ))}
              <span className="self-center text-xs text-slate-500">
                Loads a bundled session blueprint and any embedded Logic snapshot. Import the actual folder and mastered reference after that.
              </span>
            </div>
          )}
        </div>

          <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
          <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Status</div>
          <div className="mt-1 text-lg font-semibold capitalize text-white">{status.replace(/_/g, ' ')}</div>
          <div className="mt-1 text-xs text-slate-400">
            {result?.mix_vault_id ? `MixVault id ${result.mix_vault_id}` : arrangementConfirmed ? 'Arrangement confirmed. Ready to render.' : 'Run preflight before rendering.'}
          </div>
        </div>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-4">
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <p className="text-[10px] uppercase tracking-[0.22em] text-slate-500">Change Brief</p>
            <label className="mt-3 block">
              <div className="mb-2 text-sm font-semibold text-white">Tell the engine what to change</div>
              <textarea
                value={changeRequest}
                onChange={(event) => setChangeRequest(event.target.value)}
                rows={4}
                className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-slate-200 outline-none"
                placeholder="Example: keep Dynamic EQ simple, raise the lead vocal a bit, lower the beat a touch, and keep the reverb barely noticeable."
              />
              <p className="mt-2 text-xs leading-5 text-slate-400">
                Use this to describe the result you want. The rest of the workflow stays simple unless you open the advanced controls.
              </p>
            </label>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <p className="text-[10px] uppercase tracking-[0.22em] text-slate-500">Inputs</p>
            <div className="mt-4 grid gap-3">
              <label className="rounded-2xl border border-cyan-400/20 bg-cyan-500/[0.05] p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-white">Session Folder Import</div>
                    <div className="text-xs text-slate-400">Drop one folder and ESL will classify the beat, raw vocals, and reference locally.</div>
                  </div>
                  <span className="text-xs text-cyan-300">Auto classify</span>
                </div>
                <input
                  {...sessionFolderInputProps}
                  className="mt-3 block w-full text-sm text-slate-300 file:mr-4 file:rounded-full file:border-0 file:bg-cyan-500/20 file:px-4 file:py-2 file:text-cyan-100 hover:file:bg-cyan-500/30"
                  type="file"
                  multiple
                  accept="audio/*,.wav,.wave,.mp3,.m4a,.aac,.flac,.aif,.aiff,.ogg,.caf,.alac,.json,application/json"
                  onChange={(event) => void handleSessionImport(event.target.files)}
                />
                {sessionImportWarnings.length > 0 && (
                  <div className="mt-3 rounded-xl border border-amber-400/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
                    {sessionImportWarnings.join(' • ')}
                  </div>
                )}
              </label>

              <label className="rounded-2xl border border-violet-400/20 bg-violet-500/[0.05] p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-white">Artifact Bundle</div>
                    <div className="text-xs text-slate-400">Import one ESL bundle to load the Logic snapshot and blueprint together.</div>
                  </div>
                  <span className="text-xs text-violet-300">{artifactBundleFileName ?? 'Optional'}</span>
                </div>
                <input
                  className="mt-3 block w-full text-sm text-slate-300 file:mr-4 file:rounded-full file:border-0 file:bg-violet-500/20 file:px-4 file:py-2 file:text-violet-100 hover:file:bg-violet-500/30"
                  type="file"
                  accept=".json,application/json"
                  onChange={(event) => void handleArtifactBundleImport(event.target.files?.[0] ?? null)}
                />
                {artifactBundleFileName && (
                  <div className="mt-3 rounded-xl border border-violet-400/20 bg-violet-500/10 px-3 py-2 text-xs text-violet-100">
                    Loaded artifact bundle {artifactBundleFileName}
                  </div>
                )}
              </label>

              <label className="rounded-2xl border border-violet-400/20 bg-violet-500/[0.05] p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-white">Logic Session Snapshot</div>
                    <div className="text-xs text-slate-400">Import an `.esl-logic-session.json` snapshot exported from the real `.logicx` package.</div>
                  </div>
                  <span className="text-xs text-violet-300">{logicSnapshotFileName ?? 'Optional'}</span>
                </div>
                <input
                  className="mt-3 block w-full text-sm text-slate-300 file:mr-4 file:rounded-full file:border-0 file:bg-violet-500/20 file:px-4 file:py-2 file:text-violet-100 hover:file:bg-violet-500/30"
                  type="file"
                  accept=".json,application/json"
                  onChange={(event) => void handleLogicSnapshotImport(event.target.files?.[0] ?? null)}
                />
                {logicSnapshot && (
                  <div className="mt-3 rounded-xl border border-violet-400/20 bg-violet-500/10 px-3 py-2 text-xs text-violet-100">
                    {logicSnapshot.projectName} · {logicSnapshot.bpm ?? '—'} BPM · {logicSnapshot.sampleRate ?? '—'} Hz · {logicSnapshot.trackCount ?? '—'} tracks
                  </div>
                )}
              </label>

              <label className="rounded-2xl border border-emerald-400/20 bg-emerald-500/[0.05] p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-white">Session Blueprint</div>
                    <div className="text-xs text-slate-400">Import one ESL blueprint to validate the folder, Logic snapshot, and reference-master contract together.</div>
                  </div>
                  <span className="text-xs text-emerald-300">{blueprintFileName ?? 'Optional'}</span>
                </div>
                <input
                  className="mt-3 block w-full text-sm text-slate-300 file:mr-4 file:rounded-full file:border-0 file:bg-emerald-500/20 file:px-4 file:py-2 file:text-emerald-100 hover:file:bg-emerald-500/30"
                  type="file"
                  accept=".json,application/json"
                  onChange={(event) => void handleBlueprintImport(event.target.files?.[0] ?? null)}
                />
                {blueprint && (
                  <div className="mt-3 rounded-xl border border-emerald-400/20 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-100">
                    {blueprint.blueprintName} · {blueprint.expectedTracks.length} expected tracks · {blueprint.referenceMasterName ?? 'No reference master in blueprint'}
                  </div>
                )}
              </label>

              <label className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-white">Beat / Instrumental</div>
                    <div className="text-xs text-slate-500">The bounce the vocals must sit inside.</div>
                  </div>
                  <span className="text-xs text-orange-300">{beatFile ? beatFile.name : 'Required'}</span>
                </div>
                <input
                  className="mt-3 block w-full text-sm text-slate-300 file:mr-4 file:rounded-full file:border-0 file:bg-orange-500/20 file:px-4 file:py-2 file:text-orange-100 hover:file:bg-orange-500/30"
                  type="file"
                  accept="audio/*,.wav,.wave,.mp3,.m4a,.aac,.flac,.aif,.aiff,.ogg"
                  onChange={(event) => {
                    clearImportedSessionAudit();
                    setBeatFile(event.target.files?.[0] ?? null);
                  }}
                />
              </label>

              <label className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-white">Raw Vocal Files</div>
                    <div className="text-xs text-slate-500">Upload all candidate prints. Multiple files are supported.</div>
                  </div>
                  <span className="text-xs text-cyan-300">{vocalFiles.length ? `${vocalFiles.length} files` : 'Required'}</span>
                </div>
                <input
                  className="mt-3 block w-full text-sm text-slate-300 file:mr-4 file:rounded-full file:border-0 file:bg-cyan-500/20 file:px-4 file:py-2 file:text-cyan-100 hover:file:bg-cyan-500/30"
                  type="file"
                  accept="audio/*,.wav,.wave,.mp3,.m4a,.aac,.flac,.aif,.aiff,.ogg"
                  multiple
                  onChange={(event) => {
                    clearImportedSessionAudit();
                    loadFiles(event.target.files, setVocalFiles);
                  }}
                />
                {vocalFiles.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {vocalFiles.slice(0, 8).map((file) => (
                      <span key={file.name} className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1 text-[11px] text-slate-300">
                        {file.name}
                      </span>
                    ))}
                  </div>
                )}
              </label>

              <label className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-white">Reference Master</div>
                    <div className="text-xs text-slate-500">Optional target for timing and tonal context.</div>
                  </div>
                  <span className="text-xs text-emerald-300">{referenceFile ? referenceFile.name : 'Optional'}</span>
                </div>
                <input
                  className="mt-3 block w-full text-sm text-slate-300 file:mr-4 file:rounded-full file:border-0 file:bg-emerald-500/20 file:px-4 file:py-2 file:text-emerald-100 hover:file:bg-emerald-500/30"
                  type="file"
                  accept="audio/*,.wav,.wave,.mp3,.m4a,.aac,.flac,.aif,.aiff,.ogg"
                  onChange={(event) => {
                    clearImportedSessionAudit();
                    setReferenceFile(event.target.files?.[0] ?? null);
                  }}
                />
              </label>
            </div>
          </div>

          <details className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <summary className="cursor-pointer text-[10px] uppercase tracking-[0.22em] text-slate-500">
              Advanced Training Controls
            </summary>
            <p className="mt-3 text-xs leading-5 text-slate-400">
              The backend builds a versioned session manifest from uploaded files and blocks render if the manifest fails preflight.
              Accepted renders stay quarantined until feedback promotes them into MixVault.
            </p>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <label className="block">
                <div className="mb-2 text-sm font-semibold text-white">Reference Style</div>
                <select
                  value={referenceStyle}
                  onChange={(event) => setReferenceStyle(event.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-slate-200 outline-none"
                >
                  {styleOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col justify-end rounded-xl border border-white/10 bg-black/20 p-3">
                <span className="text-sm font-semibold text-white">Accept into MixVault</span>
                <span className="mt-1 text-xs text-slate-500">Record this proof as a reusable benchmark.</span>
                <button
                  type="button"
                  onClick={() => setAcceptToVault((value) => !value)}
                  className={`mt-3 inline-flex w-fit items-center rounded-full px-4 py-2 text-xs font-semibold transition ${
                    acceptToVault
                      ? 'bg-emerald-500/20 text-emerald-200 ring-1 ring-emerald-400/30'
                      : 'bg-white/[0.06] text-slate-300 ring-1 ring-white/10'
                  }`}
                >
                  {acceptToVault ? 'Enabled' : 'Disabled'}
                </button>
              </label>
            </div>

            <div className="mt-4 space-y-4">
              <label className="block">
                <div className="mb-2 flex items-center justify-between text-sm font-semibold text-white">
                  <span>Feedback Score</span>
                  <span className="text-orange-300">{feedbackScore.toFixed(2)}</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={feedbackScore}
                  onChange={(event) => setFeedbackScore(parseFloat(event.target.value))}
                  className="w-full"
                />
              </label>

              <label className="block">
                <div className="mb-2 text-sm font-semibold text-white">Feedback Note</div>
                <textarea
                  value={feedbackNote}
                  onChange={(event) => setFeedbackNote(event.target.value)}
                  rows={4}
                  className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-slate-200 outline-none"
                  placeholder="Example: vocals too low, beat still loud, raise intro support."
                />
              </label>
            </div>
          </details>

          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <p className="text-[10px] uppercase tracking-[0.22em] text-slate-500">Session Manifest</p>
            <div className="mt-3 grid gap-2 text-sm text-slate-300">
              <div className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/20 px-3 py-2">
                <span className="text-slate-500">Beat</span>
                <span className="font-medium text-white">{manifestPreview.beat ?? 'Missing'}</span>
              </div>
              <div className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/20 px-3 py-2">
                <span className="text-slate-500">Vocals</span>
                <span className="font-medium text-white">{manifestPreview.vocalCount} files</span>
              </div>
              <div className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/20 px-3 py-2">
                <span className="text-slate-500">Reference</span>
                <span className="font-medium text-white">{manifestPreview.reference ?? 'Optional'}</span>
              </div>
              <div className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/20 px-3 py-2">
                <span className="text-slate-500">MixVault</span>
                <span className={`font-medium ${manifestPreview.acceptToVault ? 'text-emerald-300' : 'text-slate-300'}`}>
                  {manifestPreview.acceptToVault ? 'Will accept' : 'Quarantined'}
                </span>
              </div>
              <div className={`rounded-xl border px-3 py-2 text-xs ${manifestPreview.hasRequiredInputs ? 'border-emerald-400/20 bg-emerald-500/10 text-emerald-100' : 'border-amber-400/20 bg-amber-500/10 text-amber-100'}`}>
                {manifestPreview.hasRequiredInputs
                  ? 'Inputs are loaded. Run preflight to build the server manifest and inspect timing before render.'
                  : 'Need a beat and at least one vocal file before the session can be rendered.'}
              </div>
              {sessionImportBundle && (
                <div className="rounded-xl border border-cyan-400/20 bg-cyan-500/[0.04] px-3 py-3 text-xs text-cyan-100">
                  Imported {sessionImportBundle.summary.audioFileCount} audio files from one session folder.
                  Beat: {sessionImportBundle.summary.beatCount} · Vocals: {sessionImportBundle.summary.vocalCount} · Reference: {sessionImportBundle.summary.referenceCount} · Other: {sessionImportBundle.summary.otherCount}
                  {sessionSourceLabel && (
                    <div className="mt-2 text-cyan-50">
                      Session source: {sessionSourceLabel}
                    </div>
                  )}
                  {sessionImportBundle.sourceDetections.length > 0 && (
                    <div className="mt-2 text-[11px] text-cyan-100/80">
                      Markers: {sessionImportBundle.sourceDetections.map((item) => item.displayName).join(' · ')}
                    </div>
                  )}
                  {sessionImportBundle.packageGraph && (
                    <div className="mt-2 text-[11px] text-cyan-100/80">
                      Graph: {sessionImportBundle.packageGraph.rootName} · {sessionImportBundle.packageGraph.audioFileCount} audio files · {sessionImportBundle.packageGraph.topLevelNodeCount} top-level folders
                    </div>
                  )}
                  {sessionImportBundle.packageGraph && (
                    <div className="mt-3 rounded-xl border border-white/10 bg-black/20 p-2 text-cyan-50">
                      <SessionPackageTree graph={sessionImportBundle.packageGraph} title="Imported session graph" />
                    </div>
                  )}
                </div>
              )}
              {logicSnapshot && (
                <div className="rounded-xl border border-violet-400/20 bg-violet-500/[0.04] px-3 py-3 text-xs text-violet-100">
                  Logic metadata: {logicSnapshot.projectName} · {logicSnapshot.logicVersion ?? 'Logic version unknown'} · {logicSnapshot.bpm ?? '—'} BPM · {logicSnapshot.timeSignature.numerator ?? '—'}/{logicSnapshot.timeSignature.denominator ?? '—'} · Key {logicSnapshot.keySignature.tonic ?? '—'} {logicSnapshot.keySignature.scale ?? ''}
                </div>
              )}
              {blueprint && (
                <div className="rounded-xl border border-emerald-400/20 bg-emerald-500/[0.04] px-3 py-3 text-xs text-emerald-100">
                  Blueprint expects {blueprint.expectedTracks.length} tracks from {blueprint.sessionFolderPath ?? 'unknown session folder'} and reference {blueprint.referenceMasterName ?? 'none'}.
                </div>
              )}
              <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs text-slate-300">
                <div className="font-semibold text-slate-100">Detected roles</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {manifestPreview.vocalRoles.length > 0 ? (
                    manifestPreview.vocalRoles.map((item) => (
                      <span key={item.file} className="rounded-full border border-white/10 bg-white/[0.05] px-2 py-1">
                        {item.file} → {item.role}
                      </span>
                    ))
                  ) : (
                    <span className="text-slate-500">No vocals loaded yet.</span>
                  )}
                </div>
                {manifestPreview.missingRoles.length > 0 && (
                  <div className="mt-2 text-amber-200">
                    Missing likely roles: {manifestPreview.missingRoles.join(', ')}
                  </div>
                )}
              </div>
              {sessionImportBundle && (
                <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-xs text-slate-300">
                  <div className="font-semibold text-slate-100">Imported session audit</div>
                  <div className="mt-3 space-y-2">
                    {sessionImportBundle.tracks.map(renderImportedTrack)}
                  </div>
                  {sessionImportBundle.otherFiles.length > 0 && (
                    <div className="mt-3 text-amber-200">
                      Non-primary audio files detected: {sessionImportBundle.otherFiles.map((file) => file.name).join(', ')}
                    </div>
                  )}
                  {sessionImportBundle.ignoredFiles.length > 0 && (
                    <div className="mt-2 text-slate-500">
                      Ignored non-audio files: {sessionImportBundle.ignoredFiles.map((file) => file.name).join(', ')}
                    </div>
                  )}
                </div>
              )}
              {blueprintMatchSummary && (
                <div className="rounded-xl border border-emerald-400/20 bg-emerald-500/[0.04] px-3 py-3 text-xs text-slate-200">
                  <div className="font-semibold text-emerald-100">Blueprint match audit</div>
                  <div className="mt-2 text-emerald-100">
                    Matched {blueprintMatchSummary.matchedExpectedTrackCount} of {blueprintMatchSummary.expectedTrackCount} expected tracks.
                    {' '}Reference status: {blueprintMatchSummary.referenceStatus}.
                  </div>
                  {blueprintMatchSummary.missingExpectedTracks.length > 0 && (
                    <div className="mt-3 text-amber-200">
                      Missing expected tracks: {blueprintMatchSummary.missingExpectedTracks.map((track) => track.displayName).join(', ')}
                    </div>
                  )}
                  {blueprintMatchSummary.extraImportedTracks.length > 0 && (
                    <div className="mt-2 text-slate-300">
                      Extra imported tracks: {blueprintMatchSummary.extraImportedTracks.map((track) => track.displayName).join(', ')}
                    </div>
                  )}
                </div>
              )}
              {logicMatchSummary && (
                <div className="rounded-xl border border-violet-400/20 bg-violet-500/[0.04] px-3 py-3 text-xs text-slate-200">
                  <div className="font-semibold text-violet-100">Logic session match audit</div>
                  <div className="mt-2 text-violet-100">
                    Matched {logicMatchSummary.matchedCount} of {logicMatchSummary.totalLogicAudioFiles} Logic audio references to the imported folder.
                    {logicMatchSummary.unmatchedImportedTrackCount > 0 && ` ${logicMatchSummary.unmatchedImportedTrackCount} imported tracks are not direct Logic audio-file matches.`}
                  </div>
                  <div className="mt-3 space-y-2">
                    {logicMatchSummary.rows.map((row) => (
                      <div key={row.logicAudioPath} className="rounded-lg border border-white/10 bg-black/20 px-3 py-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="font-medium text-white">{row.logicAudioName}</div>
                          <span className={`rounded-full px-2 py-0.5 ${
                            row.matchType === 'missing'
                              ? 'bg-rose-500/15 text-rose-200'
                              : row.matchType === 'normalized'
                                ? 'bg-amber-500/15 text-amber-200'
                                : 'bg-emerald-500/15 text-emerald-200'
                          }`}>
                            {row.matchType}
                          </span>
                        </div>
                        <div className="mt-1 text-[11px] text-slate-500">{row.logicAudioPath}</div>
                        <div className="mt-2 text-[11px] text-slate-300">
                          {row.importedTrackName
                            ? `Imported match: ${row.importedTrackName} (${row.importedKind ?? 'unknown'} / ${row.importedRole ?? 'unknown'})`
                            : 'No imported folder match yet.'}
                        </div>
                      </div>
                    ))}
                  </div>
                  {logicMatchSummary.unmatchedImportedTracks.length > 0 && (
                    <div className="mt-3 text-amber-200">
                      Imported tracks without direct Logic audio references: {logicMatchSummary.unmatchedImportedTracks.map((track) => track.displayName).join(', ')}
                    </div>
                  )}
                </div>
              )}
              {sessionManifest && (
                <div className="rounded-xl border border-cyan-400/20 bg-cyan-500/10 px-3 py-2 text-xs text-cyan-100">
                  Local alignment from detected lead-ins. Anchor: {sessionManifest.anchor_track_id ?? 'none'} · zero at {formatMs(sessionManifest.session_zero_ms)}
                </div>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[10px] uppercase tracking-[0.22em] text-slate-500">Session Preflight</p>
                <h3 className="mt-1 text-lg font-semibold text-white">Inspect the arrangement before any DSP runs</h3>
              </div>
              <button
                type="button"
                onClick={handlePreflight}
                disabled={!canRender || status === 'preflighting' || status === 'uploading' || status === 'rendering' || status === 'saving-feedback'}
                className="rounded-full border border-cyan-400/30 bg-cyan-500/10 px-4 py-2 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {status === 'preflighting' ? 'Running Preflight...' : 'Run Preflight'}
              </button>
            </div>

            {!preflight ? (
              <div className="mt-4 rounded-xl border border-dashed border-white/10 bg-black/20 p-4 text-sm text-slate-500">
                Build the manifest first. This step detects duplicates, computes timing offsets, and lays out the uploaded session on a read-only timeline.
              </div>
            ) : (
              <div className="mt-4 space-y-4">
                <div className={`rounded-xl border p-3 ${preflight.safe_to_render ? 'border-emerald-400/20 bg-emerald-500/10 text-emerald-100' : 'border-rose-400/20 bg-rose-500/10 text-rose-100'}`}>
                  <div className="text-[10px] uppercase tracking-[0.18em] text-slate-400">Manifest Gate</div>
                  <div className="mt-1 font-semibold">{preflight.safe_to_render ? 'Safe to render once you confirm the arrangement.' : 'Blocked until the manifest issues are fixed.'}</div>
                  <div className="mt-2 text-xs text-slate-200">
                    {preflight.errors.length > 0 ? preflight.errors.join(' • ') : 'No blocking manifest errors were reported.'}
                  </div>
                  {preflight.warnings.length > 0 && (
                    <div className="mt-2 text-xs text-slate-300">Warnings: {preflight.warnings.join(' • ')}</div>
                  )}
                  {preflight.manifest_digest_sha256 && (
                    <div className="mt-2 break-all font-mono text-[11px] text-slate-300">
                      Manifest hash: {preflight.manifest_digest_sha256}
                    </div>
                  )}
                </div>

                {duplicateRows.length > 0 && (
                  <div className="rounded-xl border border-amber-400/20 bg-amber-500/10 p-3 text-xs text-amber-100">
                    <div className="font-semibold">Exact duplicate uploads were quarantined.</div>
                    <div className="mt-2 space-y-1">
                      {duplicateRows.map((entry, index) => (
                        <div key={`${String(entry.duplicate ?? index)}-${index}`}>
                          {String(entry.duplicate ?? 'duplicate')} duplicates {String(entry.original ?? 'original')}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="text-sm font-semibold text-white">Read-only timeline</div>
                    <div className="text-xs text-slate-500">Duration {formatMs(manifestDurationMs)}</div>
                  </div>
                  <div className="mt-3 space-y-3">
                    {manifestTracks.length > 0 ? manifestTracks.map(renderTrackBar) : (
                      <div className="text-sm text-slate-500">No manifest tracks were returned.</div>
                    )}
                  </div>
                </div>

                <label className={`flex items-start gap-3 rounded-xl border px-3 py-3 text-sm ${preflight.safe_to_render ? 'border-white/10 bg-black/20 text-slate-200' : 'border-white/5 bg-black/10 text-slate-500'}`}>
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={arrangementConfirmed}
                    disabled={!preflight.safe_to_render}
                    onChange={(event) => setArrangementConfirmed(event.target.checked)}
                  />
                  <span>
                    I reviewed the arrangement, timing, and duplicate warnings. This session layout looks correct, and I want processing to use this manifest.
                  </span>
                </label>
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={handleRender}
              disabled={!canRender || !preflight?.safe_to_render || !arrangementConfirmed || status === 'preflighting' || status === 'uploading' || status === 'rendering' || status === 'saving-feedback'}
              className="rounded-full bg-orange-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-orange-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {status === 'uploading' || status === 'rendering' ? 'Rendering Proof...' : 'Render Proof'}
            </button>
            <button
              type="button"
              onClick={handleSaveFeedback}
              disabled={!result || status === 'uploading' || status === 'rendering' || status === 'saving-feedback'}
              className="rounded-full border border-white/10 bg-white/[0.04] px-5 py-3 text-sm font-semibold text-slate-200 transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {status === 'saving-feedback' ? 'Saving Feedback...' : 'Accept to MixVault'}
            </button>
          </div>

          {error && (
            <div className="rounded-2xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
              {error}
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <p className="text-[10px] uppercase tracking-[0.22em] text-slate-500">Proof Output</p>
            {!result ? (
              <div className="mt-4 rounded-xl border border-dashed border-white/10 bg-black/20 p-4 text-sm text-slate-500">
                Render a proof to inspect alignment, masking, automation, and benchmark details.
              </div>
            ) : (
              <div className="mt-4 space-y-3 text-sm">
                {preflight && (
                  <div
                    className={`rounded-xl border p-3 ${
                      preflight.safe_to_render
                        ? 'border-emerald-400/20 bg-emerald-500/10 text-emerald-100'
                        : 'border-rose-400/20 bg-rose-500/10 text-rose-100'
                    }`}
                  >
                    <div className="text-[10px] uppercase tracking-[0.18em] text-slate-400">Session Preflight</div>
                    <div className="mt-1 font-semibold">{preflight.safe_to_render ? 'Safe to render' : 'Blocked by manifest errors'}</div>
                    <div className="mt-2 text-xs text-slate-200">
                      {preflight.errors.length > 0 ? preflight.errors.join(' • ') : 'No manifest errors reported.'}
                    </div>
                    {preflight.warnings.length > 0 && (
                      <div className="mt-2 text-xs text-slate-300">Warnings: {preflight.warnings.join(' • ')}</div>
                    )}
                  </div>
                )}
                <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                  <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Files</div>
                  <div className="mt-2 text-slate-200">Output: {fileName(result.output_path)}</div>
                  <div className="text-slate-400">Report: {fileName(result.report_path)}</div>
                  <div className="text-slate-400">Reference: {result.reference_path ? fileName(result.reference_path) : 'None'}</div>
                </div>

                <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                  <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Selection</div>
                  <div className="mt-2 text-slate-200">{selectedSummary?.vocals ?? 0} selected vocals</div>
                  <div className="text-slate-400">Missing parts: {selectedSummary?.missing ?? 'none'}</div>
                </div>

                <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                  <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Masking</div>
                  <div className="mt-2 text-slate-200">
                    Ratio: {typeof result.masking_report.vocal_to_beat_median_rms_ratio === 'number'
                      ? result.masking_report.vocal_to_beat_median_rms_ratio.toFixed(3)
                      : '—'}
                  </div>
                  <div className="text-slate-400">
                    Masked regions: {typeof result.masking_report.masked_region_count === 'number'
                      ? result.masking_report.masked_region_count
                      : '—'}
                  </div>
                </div>

                <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                  <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Automation</div>
                  <div className="mt-2 text-slate-200">
                    Vocal profile: {typeof result.automation_plan.vocal_profile === 'string' ? result.automation_plan.vocal_profile : '—'}
                  </div>
                  <div className="text-slate-400">
                    Sidechain dip: {typeof result.automation_plan.sidechain_dip_db === 'number'
                      ? `${result.automation_plan.sidechain_dip_db.toFixed(1)} dB`
                      : '—'}
                  </div>
                </div>

                <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                  <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Metrics</div>
                  <div className="mt-2 text-slate-200">
                    LUFS: {selectedSummary?.lufs != null ? selectedSummary.lufs.toFixed(2) : '—'}
                  </div>
                  <div className="text-slate-400">
                    True Peak: {selectedSummary?.truePeak != null ? selectedSummary.truePeak.toFixed(2) : '—'} dBTP
                  </div>
                  <div className="text-slate-400">
                    MixVault: {result.mix_vault_id ?? 'not accepted yet'}
                  </div>
                  {feedbackMixId != null && <div className="text-emerald-300">Feedback saved as mix {feedbackMixId}</div>}
                </div>
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <p className="text-[10px] uppercase tracking-[0.22em] text-slate-500">Selected Vocals</p>
            {!result || result.selected_vocals.length === 0 ? (
              <div className="mt-4 text-sm text-slate-500">No rendered vocals yet.</div>
            ) : (
              <div className="mt-4 space-y-2">
                {result.selected_vocals.map((item) => (
                  <div key={`${item.path}-${item.part_type}`} className="rounded-xl border border-white/10 bg-black/20 p-3 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <div className="font-semibold text-white">{fileName(item.path)}</div>
                      <div className="text-[11px] uppercase tracking-[0.16em] text-orange-300">{item.part_type}</div>
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-slate-400">
                      <div>Offset: {formatSeconds(item.offset_seconds)}</div>
                      <div>Gain: {item.gain.toFixed(2)}</div>
                      <div>Pan: {item.pan.toFixed(2)}</div>
                      <div>Score: {item.alignment_score != null ? item.alignment_score.toFixed(3) : '—'}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </motion.section>
  );
};

export default ProofTrainerPanel;
