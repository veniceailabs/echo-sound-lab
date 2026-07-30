import type { ReplayState } from './deterministicReplayService';
import {
  parseTimelineAafBinary,
  parseTimelineOmfBinary,
  serializeTimelineAafBinary,
  serializeTimelineOmfBinary,
} from './timelineInterchangeService';

export type VendorInterchangeFormat = 'AAF' | 'OMF';
export type VendorInterchangeProvider = 'esl-fallback' | 'native-sdk';

export interface VendorInterchangeBridgeAdapterDescriptor {
  id: string;
  label: string;
  format: VendorInterchangeFormat;
  provider: VendorInterchangeProvider;
  available: boolean;
  nativeSdkRequired: boolean;
  notes: string[];
}

interface VendorInterchangeBridgeAdapter extends VendorInterchangeBridgeAdapterDescriptor {
  exportBinary: (state: ReplayState) => ArrayBuffer;
  importBinary: (buffer: ArrayBuffer) => ReplayState;
}

export interface VendorInterchangeBridgeRuntimeSnapshot {
  generatedAt: number;
  sessionId: string;
  workspaceId: string;
  activeMode: 'esl-fallback' | 'hybrid' | 'native-sdk';
  nativeAdaptersRegistered: number;
  activeAdapters: Record<VendorInterchangeFormat, VendorInterchangeBridgeAdapterDescriptor>;
  availableAdapters: VendorInterchangeBridgeAdapterDescriptor[];
  sdkReady: boolean;
  notes: string[];
}

export interface VendorInterchangeBridgeAdapterInput {
  id: string;
  label: string;
  format: VendorInterchangeFormat;
  provider?: VendorInterchangeProvider | string;
  available?: boolean;
  nativeSdkRequired?: boolean;
  notes?: string[];
  exportBinary: (state: ReplayState) => ArrayBuffer;
  importBinary: (buffer: ArrayBuffer) => ReplayState;
}

export interface VendorInterchangeBridgeWindowPayload {
  adapters?: VendorInterchangeBridgeAdapterInput[] | Partial<Record<VendorInterchangeFormat, VendorInterchangeBridgeAdapterInput>>;
  aaf?: VendorInterchangeBridgeAdapterInput;
  omf?: VendorInterchangeBridgeAdapterInput;
  registerAdapter?: (adapter: VendorInterchangeBridgeAdapterInput) => void;
}

declare global {
  interface Window {
    __ESL_VENDOR_INTERCHANGE_BRIDGE__?: VendorInterchangeBridgeWindowPayload;
    __ESL_NATIVE_AAF__?: VendorInterchangeBridgeAdapterInput;
    __ESL_NATIVE_OMF__?: VendorInterchangeBridgeAdapterInput;
    __ESL_NATIVE_VENDOR_INTERCHANGE_ADAPTERS__?: VendorInterchangeBridgeAdapterInput[];
  }
}

const registeredAdapters: VendorInterchangeBridgeAdapter[] = [];

function buildFallbackAdapter(format: VendorInterchangeFormat): VendorInterchangeBridgeAdapter {
  if (format === 'AAF') {
    return {
      id: 'esl-aaf-fallback',
      label: 'ESL AAF Fallback',
      format,
      provider: 'esl-fallback',
      available: true,
      nativeSdkRequired: false,
      notes: [
        'Uses the ESL interchange layer.',
        'Preserves the full in-app session snapshot.',
        'Not a vendor-native binary SDK implementation.',
      ],
      exportBinary: serializeTimelineAafBinary,
      importBinary: parseTimelineAafBinary,
    };
  }

  return {
    id: 'esl-omf-fallback',
    label: 'ESL OMF Fallback',
    format,
    provider: 'esl-fallback',
    available: true,
    nativeSdkRequired: false,
    notes: [
      'Uses the ESL interchange layer.',
      'Preserves the full in-app session snapshot.',
      'Not a vendor-native binary SDK implementation.',
    ],
    exportBinary: serializeTimelineOmfBinary,
    importBinary: parseTimelineOmfBinary,
  };
}

const fallbackAdapters: VendorInterchangeBridgeAdapter[] = [
  buildFallbackAdapter('AAF'),
  buildFallbackAdapter('OMF'),
];

function snapshotAdapter(adapter: VendorInterchangeBridgeAdapter): VendorInterchangeBridgeAdapterDescriptor {
  return {
    id: adapter.id,
    label: adapter.label,
    format: adapter.format,
    provider: adapter.provider,
    available: adapter.available,
    nativeSdkRequired: adapter.nativeSdkRequired,
    notes: [...adapter.notes],
  };
}

function emitBridgeChangeEvent(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('esl-vendor-interchange-bridge-changed'));
}

function normalizeAdapter(adapter: VendorInterchangeBridgeAdapterInput): VendorInterchangeBridgeAdapter {
  return {
    id: adapter.id,
    label: adapter.label,
    format: adapter.format,
    provider: adapter.provider === 'native-sdk' || adapter.provider === 'esl-fallback'
      ? adapter.provider
      : 'native-sdk',
    available: adapter.available ?? true,
    nativeSdkRequired: adapter.nativeSdkRequired ?? true,
    notes: [...(adapter.notes || [])],
    exportBinary: adapter.exportBinary,
    importBinary: adapter.importBinary,
  };
}

function resolveBridgeAdapter(format: VendorInterchangeFormat): VendorInterchangeBridgeAdapter {
  const native = [...registeredAdapters].reverse().find((adapter) => adapter.format === format && adapter.provider === 'native-sdk');
  if (native) return native;

  const registered = [...registeredAdapters].reverse().find((adapter) => adapter.format === format);
  if (registered) return registered;

  const fallback = fallbackAdapters.find((adapter) => adapter.format === format);
  if (!fallback) {
    throw new Error(`No vendor interchange adapter registered for ${format}`);
  }
  return fallback;
}

export function registerVendorInterchangeBridgeAdapter(adapter: VendorInterchangeBridgeAdapter): void {
  const index = registeredAdapters.findIndex((entry) => entry.id === adapter.id);
  if (index >= 0) {
    registeredAdapters.splice(index, 1, adapter);
    emitBridgeChangeEvent();
    return;
  }
  registeredAdapters.push(adapter);
  emitBridgeChangeEvent();
}

export function unregisterVendorInterchangeBridgeAdapter(adapterId: string): void {
  const index = registeredAdapters.findIndex((entry) => entry.id === adapterId);
  if (index >= 0) {
    registeredAdapters.splice(index, 1);
    emitBridgeChangeEvent();
  }
}

export function exportVendorInterchangeBinary(
  state: ReplayState,
  format: VendorInterchangeFormat
): ArrayBuffer {
  return resolveBridgeAdapter(format).exportBinary(state);
}

export function importVendorInterchangeBinary(
  buffer: ArrayBuffer,
  format: VendorInterchangeFormat
): ReplayState {
  return resolveBridgeAdapter(format).importBinary(buffer);
}

export function buildVendorInterchangeBridgeRuntimeSnapshot(
  state: ReplayState
): VendorInterchangeBridgeRuntimeSnapshot {
  const activeAaf = resolveBridgeAdapter('AAF');
  const activeOmf = resolveBridgeAdapter('OMF');
  const availableAdapters = [
    snapshotAdapter(activeAaf),
    snapshotAdapter(activeOmf),
    ...registeredAdapters
      .filter((adapter) => adapter.provider === 'native-sdk')
      .map(snapshotAdapter),
  ];
  const nativeAdaptersRegistered = registeredAdapters.filter((adapter) => adapter.provider === 'native-sdk').length;
  const sdkReady = activeAaf.provider === 'native-sdk' && activeOmf.provider === 'native-sdk';

  const activeMode = sdkReady
    ? 'native-sdk'
    : nativeAdaptersRegistered > 0
      ? 'hybrid'
      : 'esl-fallback';

  return {
    generatedAt: Date.now(),
    sessionId: state.sessionId,
    workspaceId: state.workspaceId,
    activeMode,
    nativeAdaptersRegistered,
    activeAdapters: {
      AAF: snapshotAdapter(activeAaf),
      OMF: snapshotAdapter(activeOmf),
    },
    availableAdapters,
    sdkReady,
    notes: [
      sdkReady
        ? 'Native vendor bridge adapters are active for both AAF and OMF.'
        : 'ESL is using its fallback interchange adapters.',
      nativeAdaptersRegistered > 0
        ? 'At least one native SDK adapter is registered.'
        : 'No native SDK adapters are registered yet.',
      'The runtime seam is ready for a licensed SDK implementation.',
    ],
  };
}

export function serializeVendorInterchangeBridgeRuntimeSnapshotJson(
  snapshot: VendorInterchangeBridgeRuntimeSnapshot
): string {
  return JSON.stringify(snapshot, null, 2);
}

export function bootstrapVendorInterchangeBridgeFromWindow(): number {
  if (typeof window === 'undefined') return 0;

  const payload = window.__ESL_VENDOR_INTERCHANGE_BRIDGE__;
  const adapters: VendorInterchangeBridgeAdapterInput[] = [];

  if (Array.isArray(window.__ESL_NATIVE_VENDOR_INTERCHANGE_ADAPTERS__)) {
    adapters.push(...window.__ESL_NATIVE_VENDOR_INTERCHANGE_ADAPTERS__);
  }
  if (window.__ESL_NATIVE_AAF__) {
    adapters.push(window.__ESL_NATIVE_AAF__);
  }
  if (window.__ESL_NATIVE_OMF__) {
    adapters.push(window.__ESL_NATIVE_OMF__);
  }
  if (Array.isArray(payload?.adapters)) {
    adapters.push(...payload.adapters);
  } else if (payload?.adapters) {
    const mapped = payload.adapters as Partial<Record<VendorInterchangeFormat, VendorInterchangeBridgeAdapterInput>>;
    if (mapped.AAF) adapters.push(mapped.AAF);
    if (mapped.OMF) adapters.push(mapped.OMF);
  }
  if (payload?.aaf) adapters.push(payload.aaf);
  if (payload?.omf) adapters.push(payload.omf);

  const normalized = adapters.filter(Boolean).map(normalizeAdapter);
  for (const adapter of normalized) {
    registerVendorInterchangeBridgeAdapter(adapter);
  }

  if (payload?.registerAdapter) {
    for (const adapter of normalized) {
      payload.registerAdapter(adapter);
    }
  }

  if (normalized.length > 0) {
    emitBridgeChangeEvent();
  }

  return normalized.length;
}
