import { buildSessionInterchangePackage, type SessionInterchangePackage } from './sessionInterchangeService';
import type { SessionState } from './sessionManager';
import type { ReplayState } from './deterministicReplayService';
import type { AudioEngineSnapshot } from './audioEngine';
import type { StudioHardwareControlProfile } from './studioHardwareControlService';
import type { StudioMidiControlSnapshot } from './studioMidiControlService';
import type { TimelineInterchangeParityReport } from './timelineInterchangeParityService';
import type { VendorInterchangeBridgeRuntimeSnapshot } from './vendorInterchangeBridgeRuntime';
import type { StudioParityActionPlan } from './studioParityActionPlanService';
import { getSecureItem, removeSecureItem, setSecureItem } from './secureStorage';

export interface StudioSessionRecoveryBundleManifest {
  format: 'esl-studio-recovery-bundle';
  version: 1;
  exportedAt: number;
  exportedBy: 'echo-sound-lab';
}

export interface StudioSessionRecoveryBundle {
  manifest: StudioSessionRecoveryBundleManifest;
  sessionPackage: SessionInterchangePackage;
  timelineState: ReplayState;
  timelineCompareState: ReplayState | null;
  activeTimelineBranchId: string | null;
  timelineCompareBranchId: string | null;
  currentPlayheadSeconds: number;
  currentFileName: string | null;
  engineSnapshot: AudioEngineSnapshot;
  hardwareProfile: StudioHardwareControlProfile | null;
  midiSnapshot: StudioMidiControlSnapshot | null;
  parityReport: TimelineInterchangeParityReport;
  bridgeRuntime: VendorInterchangeBridgeRuntimeSnapshot;
  parityPlan: StudioParityActionPlan | null;
  notes: string[];
}

export interface StudioSessionRecoveryInput {
  session: SessionState;
  timelineState: ReplayState;
  timelineCompareState: ReplayState | null;
  activeTimelineBranchId: string | null;
  timelineCompareBranchId: string | null;
  currentPlayheadSeconds: number;
  currentFileName: string | null;
  engineSnapshot: AudioEngineSnapshot;
  hardwareProfile: StudioHardwareControlProfile | null;
  midiSnapshot: StudioMidiControlSnapshot | null;
  parityReport: TimelineInterchangeParityReport;
  bridgeRuntime: VendorInterchangeBridgeRuntimeSnapshot;
  parityPlan: StudioParityActionPlan | null;
  notes?: string[];
}

const RECOVERY_BUNDLE_KEY = 'esl-studio-recovery-bundle-v1';

function safeFileName(fileName: string | null | undefined): string {
  const base = (fileName || 'echo-studio-recovery').trim() || 'echo-studio-recovery';
  return base.replace(/[^a-z0-9._-]+/gi, '-').replace(/-+/g, '-').replace(/^-+|-+$/g, '');
}

export function buildStudioSessionRecoveryBundle(input: StudioSessionRecoveryInput): StudioSessionRecoveryBundle {
  return {
    manifest: {
      format: 'esl-studio-recovery-bundle',
      version: 1,
      exportedAt: Date.now(),
      exportedBy: 'echo-sound-lab',
    },
    sessionPackage: buildSessionInterchangePackage(
      input.session,
      input.engineSnapshot,
      input.notes || [
        'Recovery bundle includes the current session, timeline, compare state, and hardware surface.',
      ],
    ),
    timelineState: JSON.parse(JSON.stringify(input.timelineState)) as ReplayState,
    timelineCompareState: input.timelineCompareState ? JSON.parse(JSON.stringify(input.timelineCompareState)) as ReplayState : null,
    activeTimelineBranchId: input.activeTimelineBranchId,
    timelineCompareBranchId: input.timelineCompareBranchId,
    currentPlayheadSeconds: input.currentPlayheadSeconds,
    currentFileName: input.currentFileName,
    engineSnapshot: input.engineSnapshot,
    hardwareProfile: input.hardwareProfile ? JSON.parse(JSON.stringify(input.hardwareProfile)) as StudioHardwareControlProfile : null,
    midiSnapshot: input.midiSnapshot ? JSON.parse(JSON.stringify(input.midiSnapshot)) as StudioMidiControlSnapshot : null,
    parityReport: input.parityReport,
    bridgeRuntime: input.bridgeRuntime,
    parityPlan: input.parityPlan ? JSON.parse(JSON.stringify(input.parityPlan)) as StudioParityActionPlan : null,
    notes: input.notes || [
      'Use this bundle to recover a working studio state after an interruption.',
      'The bundle is safe to export and re-import without the original audio file.',
    ],
  };
}

export function serializeStudioSessionRecoveryBundleJson(bundle: StudioSessionRecoveryBundle): string {
  return JSON.stringify(bundle, null, 2);
}

export function parseStudioSessionRecoveryBundleJson(raw: string): StudioSessionRecoveryBundle | null {
  try {
    const parsed = JSON.parse(raw) as Partial<StudioSessionRecoveryBundle>;
    if (!parsed.manifest || parsed.manifest.format !== 'esl-studio-recovery-bundle' || parsed.manifest.version !== 1) {
      return null;
    }
    if (!parsed.sessionPackage || !parsed.timelineState || !parsed.engineSnapshot || !parsed.parityReport || !parsed.bridgeRuntime) {
      return null;
    }
    return parsed as StudioSessionRecoveryBundle;
  } catch {
    return null;
  }
}

export function downloadStudioSessionRecoveryBundle(bundle: StudioSessionRecoveryBundle, fileName?: string): void {
  const blob = new Blob([serializeStudioSessionRecoveryBundleJson(bundle)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${safeFileName(fileName || bundle.currentFileName || bundle.sessionPackage.session.fileName)}.esl-recovery.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function saveStudioSessionRecoveryBundle(bundle: StudioSessionRecoveryBundle): Promise<void> {
  await setSecureItem(RECOVERY_BUNDLE_KEY, bundle);
}

export async function loadStudioSessionRecoveryBundle(): Promise<StudioSessionRecoveryBundle | null> {
  return getSecureItem<StudioSessionRecoveryBundle>(RECOVERY_BUNDLE_KEY);
}

export async function clearStudioSessionRecoveryBundle(): Promise<void> {
  await removeSecureItem(RECOVERY_BUNDLE_KEY);
}
