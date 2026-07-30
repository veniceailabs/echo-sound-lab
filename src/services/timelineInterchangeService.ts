import type {
  ReplayCompLane,
  ReplayMarker,
  ReplayState,
  ReplayTrackGroup,
  ReplayTrackKind,
  ReplayTrackState,
} from './deterministicReplayService';

export interface TimelineAafAdapterPackage {
  format: 'AAF-ADAPTER';
  version: 1;
  exportedAt: number;
  sessionId: string;
  workspaceId: string;
  metadata?: Record<string, unknown>;
  tempoMap: Array<{
    timeSec: number;
    bpm: number;
    timeSignature: string | null;
  }>;
    tracks: Array<{
      trackId: string;
      trackName: string;
      kind: string;
      groupId: string | null | undefined;
      outputBusId: string | null | undefined;
      gainDb: number;
      pan: number;
      muted: boolean;
      solo: boolean;
      limiterThresholdDb: number | null;
      normalizedTargetLUFS: number | null;
      dcRemovalHz: number | null;
      inserts: ReplayTrackState['inserts'];
      sends: NonNullable<ReplayTrackState['sends']>;
      midiNotes: NonNullable<ReplayState['midiNotes']>;
      appliedProposalIds: string[];
      trackStateHash: string;
      regions: Array<{
        regionId: string;
        sourceId: string;
      startTimeSec: number;
      offsetSec: number;
      durationSec: number;
      gainDb: number;
      compLaneId: string | null | undefined;
      compTakeIndex: number | null | undefined;
      fadeInSec: number | null | undefined;
      fadeOutSec: number | null | undefined;
    }>;
  }>;
  trackGroups: ReplayTrackGroup[];
  compLanes: ReplayCompLane[];
  markers: ReplayMarker[];
  automation: ReplayState['automation'];
  fullState: ReplayState;
}

export interface TimelineOmfAdapterPackage {
  format: 'OMF-ADAPTER';
  version: 1;
  exportedAt: number;
  sessionId: string;
  workspaceId: string;
  metadata?: Record<string, unknown>;
  tempoMap: TimelineAafAdapterPackage['tempoMap'];
  markers: ReplayMarker[];
  trackGroups: ReplayTrackGroup[];
  compLanes: ReplayCompLane[];
  tracks: TimelineAafAdapterPackage['tracks'];
  automation: ReplayState['automation'];
  fullState: ReplayState;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function metadataAttr(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'string') return value;
  return '';
}

function buildTimelineTempoMap(state: ReplayState): TimelineAafAdapterPackage['tempoMap'] {
  const metadata = state.metadata || {};
  const tempoBpm = metadata.tempoBpm ?? metadata.bpm;
  const tempoMap = Array.isArray(metadata.tempoMap) ? metadata.tempoMap : [];
  if (typeof tempoBpm === 'number' && Number.isFinite(tempoBpm)) {
    return [{
      timeSec: 0,
      bpm: tempoBpm,
      timeSignature: typeof metadata.timeSignature === 'string' ? metadata.timeSignature : null,
    }];
  }

  return tempoMap
    .map((entry) => ({
      timeSec: Number((entry as { timeSec?: unknown }).timeSec ?? 0),
      bpm: Number((entry as { bpm?: unknown }).bpm ?? 120),
      timeSignature: typeof (entry as { timeSignature?: unknown }).timeSignature === 'string'
        ? String((entry as { timeSignature?: unknown }).timeSignature)
        : null,
    }))
    .filter((entry) => Number.isFinite(entry.timeSec) && Number.isFinite(entry.bpm));
}

export function buildTimelineAafAdapterPackage(state: ReplayState): TimelineAafAdapterPackage {
  const tempoMap = buildTimelineTempoMap(state);
  return {
    format: 'AAF-ADAPTER',
    version: 1,
    exportedAt: Date.now(),
    sessionId: state.sessionId,
    workspaceId: state.workspaceId,
    metadata: state.metadata ? { ...state.metadata } : undefined,
    tempoMap,
    tracks: state.tracks.map((track) => ({
      trackId: track.trackId,
      trackName: track.trackName,
      kind: track.kind,
      groupId: track.groupId ?? null,
      outputBusId: track.outputBusId ?? null,
      gainDb: track.gainDb,
      pan: track.pan,
      muted: track.muted,
      solo: track.solo,
      limiterThresholdDb: track.limiterThresholdDb,
      normalizedTargetLUFS: track.normalizedTargetLUFS,
      dcRemovalHz: track.dcRemovalHz,
      inserts: track.inserts ? track.inserts.map((insert) => ({ ...insert, parameters: { ...(insert.parameters || {}) } })) : [],
      sends: track.sends ? track.sends.map((send) => ({ ...send })) : [],
      midiNotes: (state.midiNotes || []).filter((note) => note.trackId === track.trackId).map((note) => ({ ...note })),
      appliedProposalIds: [...(track.appliedProposalIds || [])],
      trackStateHash: track.trackStateHash,
      regions: state.regions
        .filter((region) => region.trackId === track.trackId)
        .map((region) => ({
          regionId: region.regionId,
          sourceId: region.sourceId,
          startTimeSec: region.startTimeSec,
          offsetSec: region.offsetSec,
          durationSec: region.durationSec,
          gainDb: region.gainDb ?? 0,
          compLaneId: region.compLaneId ?? null,
          compTakeIndex: region.compTakeIndex ?? null,
          fadeInSec: region.fadeInSec ?? null,
          fadeOutSec: region.fadeOutSec ?? null,
        })),
    })),
    trackGroups: [...(state.trackGroups ?? [])],
    compLanes: [...(state.compLanes ?? [])],
    markers: [...(state.markers ?? [])],
    automation: [...state.automation],
    fullState: JSON.parse(JSON.stringify(state)) as ReplayState,
  };
}

export function buildTimelineOmfAdapterPackage(state: ReplayState): TimelineOmfAdapterPackage {
  return {
    format: 'OMF-ADAPTER',
    version: 1,
    exportedAt: Date.now(),
    sessionId: state.sessionId,
    workspaceId: state.workspaceId,
    metadata: state.metadata ? { ...state.metadata } : undefined,
    tempoMap: buildTimelineTempoMap(state),
    markers: [...(state.markers ?? [])],
    trackGroups: [...(state.trackGroups ?? [])],
    compLanes: [...(state.compLanes ?? [])],
    tracks: buildTimelineAafAdapterPackage(state).tracks,
    automation: [...state.automation],
    fullState: JSON.parse(JSON.stringify(state)) as ReplayState,
  };
}

export function serializeTimelineAafAdapterXml(state: ReplayState): string {
  const pkg = buildTimelineAafAdapterPackage(state);
  const trackXml = pkg.tracks.map((track) => `
    <track id="${escapeXml(track.trackId)}" name="${escapeXml(track.trackName)}" kind="${escapeXml(track.kind)}" groupId="${escapeXml(track.groupId ?? '')}" outputBusId="${escapeXml(track.outputBusId ?? '')}" gainDb="${track.gainDb.toFixed(3)}" pan="${track.pan.toFixed(3)}">
      <routing outputBusId="${escapeXml(track.outputBusId ?? '')}" />
      <sends>${track.sends.map((send) => `
        <send id="${escapeXml(send.sendId)}" targetTrackId="${escapeXml(send.targetTrackId)}" levelDb="${send.levelDb.toFixed(3)}" preFader="${send.preFader ? 'true' : 'false'}" enabled="${send.enabled ? 'true' : 'false'}" mode="${escapeXml(send.mode || 'aux')}" />
      `).join('')}
      </sends>
      <midiNotes>${track.midiNotes.map((note) => `
        <note id="${escapeXml(note.noteId)}" trackId="${escapeXml(note.trackId)}" start="${note.startTimeSec.toFixed(3)}" duration="${note.durationSec.toFixed(3)}" pitch="${note.pitch}" velocity="${note.velocity}" channel="${note.channel ?? ''}" />
      `).join('')}
      </midiNotes>
      ${track.regions.map((region) => `
        <region id="${escapeXml(region.regionId)}" sourceId="${escapeXml(region.sourceId)}" start="${region.startTimeSec.toFixed(3)}" offset="${region.offsetSec.toFixed(3)}" duration="${region.durationSec.toFixed(3)}" gainDb="${region.gainDb.toFixed(3)}" compLaneId="${escapeXml(region.compLaneId ?? '')}" compTakeIndex="${region.compTakeIndex ?? ''}" fadeInSec="${region.fadeInSec ?? ''}" fadeOutSec="${region.fadeOutSec ?? ''}" />
      `).join('')}
    </track>`).join('');

  const groupXml = (pkg.trackGroups ?? []).map((group) => `
    <trackGroup id="${escapeXml(group.groupId)}" name="${escapeXml(group.name)}" color="${escapeXml(group.color)}" trackIds="${escapeXml(group.trackIds.join(','))}" />
  `).join('');

  const markerXml = (pkg.markers ?? []).map((marker) => `
    <marker id="${escapeXml(marker.id)}" time="${marker.timeSec.toFixed(3)}" label="${escapeXml(marker.label)}" color="${escapeXml(marker.color)}" note="${escapeXml(marker.note ?? '')}" />
  `).join('');

  const tempoXml = (pkg.tempoMap ?? []).map((entry) => `
    <tempo time="${entry.timeSec.toFixed(3)}" bpm="${entry.bpm.toFixed(3)}" timeSignature="${escapeXml(entry.timeSignature ?? '')}" />
  `).join('');

  const compLaneXml = (pkg.compLanes ?? []).map((lane) => `
    <compLane id="${escapeXml(lane.laneId)}" trackId="${escapeXml(lane.trackId)}" name="${escapeXml(lane.name)}" activeRegionId="${escapeXml(lane.activeRegionId)}" regionIds="${escapeXml(lane.regionIds.join(','))}" />
  `).join('');

  const automationXml = (pkg.automation ?? []).map((lane) => `
    <automationLane id="${escapeXml(lane.laneId)}" trackId="${escapeXml(lane.trackId)}" parameter="${escapeXml(lane.parameter)}">
      ${(lane.points || []).map((point) => `
        <point id="${escapeXml(point.pointId)}" time="${point.timeSec.toFixed(3)}" value="${point.value.toFixed(3)}" curve="${escapeXml(point.curve ?? 'linear')}" />
      `).join('')}
    </automationLane>
  `).join('');

  const metadata = pkg.metadata || {};

  return `<?xml version="1.0" encoding="UTF-8"?>
<AAFAdapter version="1">
    <session id="${escapeXml(pkg.sessionId)}" workspaceId="${escapeXml(pkg.workspaceId)}" exportedAt="${pkg.exportedAt}" tempoBpm="${escapeXml(metadataAttr(metadata.tempoBpm))}" timeSignature="${escapeXml(metadataAttr(metadata.timeSignature))}" timeSignatureNumerator="${escapeXml(metadataAttr(metadata.timeSignatureNumerator))}" timeSignatureDenominator="${escapeXml(metadataAttr(metadata.timeSignatureDenominator))}" sampleRate="${escapeXml(metadataAttr(metadata.sampleRate))}" channelCount="${escapeXml(metadataAttr(metadata.channelCount))}">
    <metadata tempoBpm="${escapeXml(metadataAttr(metadata.tempoBpm))}" timeSignature="${escapeXml(metadataAttr(metadata.timeSignature))}" timeSignatureNumerator="${escapeXml(metadataAttr(metadata.timeSignatureNumerator))}" timeSignatureDenominator="${escapeXml(metadataAttr(metadata.timeSignatureDenominator))}" sampleRate="${escapeXml(metadataAttr(metadata.sampleRate))}" channelCount="${escapeXml(metadataAttr(metadata.channelCount))}" />
    <tempoMap>${tempoXml}
    </tempoMap>
    <trackGroups>${groupXml}
    </trackGroups>
    <compLanes>${compLaneXml}
    </compLanes>
    <markers>${markerXml}
    </markers>
    <automation>${automationXml}
    </automation>
    <tracks>${trackXml}
    </tracks>
  </session>
</AAFAdapter>\n`;
}

export function serializeTimelineOmfAdapterJson(state: ReplayState): string {
  return JSON.stringify(buildTimelineOmfAdapterPackage(state), null, 2);
}

export function downloadTimelineAafAdapter(state: ReplayState, fileName = 'echo-session'): void {
  downloadTimelineAafAdapterBinary(state, fileName);
}

export function downloadTimelineOmfAdapter(state: ReplayState, fileName = 'echo-session'): void {
  downloadTimelineOmfAdapterBinary(state, fileName);
}

export function exportTimelineMarkersCsv(markers: ReplayMarker[]): string {
  const rows = ['timeSec,label,color,note'];
  for (const marker of markers) {
    rows.push([
      marker.timeSec.toFixed(3),
      JSON.stringify(marker.label),
      JSON.stringify(marker.color),
      JSON.stringify(marker.note ?? ''),
    ].join(','));
  }
  return `${rows.join('\n')}\n`;
}

export function serializeTimelineMarkersJson(markers: ReplayMarker[]): string {
  return JSON.stringify({
    format: 'TIMELINE-MARKERS',
    version: 1,
    exportedAt: Date.now(),
    markers,
  }, null, 2);
}

export function parseTimelineMarkersJson(raw: string): ReplayMarker[] {
  const parsed = JSON.parse(raw) as { format?: string; version?: number; markers?: ReplayMarker[] };
  if (parsed.format !== 'TIMELINE-MARKERS' || parsed.version !== 1 || !Array.isArray(parsed.markers)) {
    throw new Error('Invalid marker package');
  }
  return parsed.markers
    .map((marker) => ({
      ...marker,
      note: marker.note || undefined,
    }))
    .sort((a, b) => a.timeSec - b.timeSec);
}

export function parseTimelineMarkersCsv(raw: string): ReplayMarker[] {
  const lines = raw.trim().split(/\r?\n/);
  if (lines.length <= 1) return [];
  const markers: ReplayMarker[] = [];
  for (const line of lines.slice(1)) {
    const [timeSecRaw, labelRaw, colorRaw, noteRaw] = line.split(',');
    if (!timeSecRaw) continue;
    const timeSec = Number(timeSecRaw);
    if (!Number.isFinite(timeSec)) continue;
    markers.push({
      id: `marker-${Date.now().toString(36)}-${markers.length.toString(36)}`,
      timeSec,
      label: JSON.parse(labelRaw || '""'),
      color: JSON.parse(colorRaw || '"cyan"'),
      note: JSON.parse(noteRaw || '""') || undefined,
    });
  }
  return markers.sort((a, b) => a.timeSec - b.timeSec);
}

const BINARY_TEXT_ENCODER = new TextEncoder();
const BINARY_TEXT_DECODER = new TextDecoder();
const BINARY_MAGIC_AAF = 0x46464145; // "EAAF"
const BINARY_MAGIC_OMF = 0x464d4f45; // "EOMF"
const BINARY_VERSION = 1;

type TimelineBinaryFormat = 'AAF' | 'OMF';

interface TimelineBinaryChunk {
  type: string;
  bytes: Uint8Array;
}

interface TimelineBinaryEnvelope {
  format: TimelineBinaryFormat;
  version: number;
  exportedAt: number;
  sessionId: string;
  workspaceId: string;
  chunks: TimelineBinaryChunk[];
}

function utf8(input: string): Uint8Array {
  return BINARY_TEXT_ENCODER.encode(input);
}

function utf8Decode(input: Uint8Array): string {
  return BINARY_TEXT_DECODER.decode(input);
}

function toFixedChunkType(type: string): string {
  return type.padEnd(4, ' ').slice(0, 4);
}

function isArrayBufferLike(value: unknown): value is ArrayBuffer {
  return value instanceof ArrayBuffer;
}

function downloadBinary(content: ArrayBuffer, filename: string, mime = 'application/octet-stream'): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function encodeBinaryEnvelope(envelope: TimelineBinaryEnvelope): ArrayBuffer {
  const chunkPayloads = envelope.chunks.map((chunk) => ({
    type: toFixedChunkType(chunk.type),
    bytes: chunk.bytes,
  }));

  const totalBytes = 4 + 2 + 2 + 8 + 4 + chunkPayloads.reduce((sum, chunk) => sum + 8 + chunk.bytes.byteLength, 0);
  const buffer = new ArrayBuffer(totalBytes);
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  let offset = 0;

  view.setUint32(offset, envelope.format === 'AAF' ? BINARY_MAGIC_AAF : BINARY_MAGIC_OMF, true);
  offset += 4;
  view.setUint16(offset, envelope.version, true);
  offset += 2;
  view.setUint16(offset, envelope.format === 'AAF' ? 1 : 2, true);
  offset += 2;
  view.setFloat64(offset, envelope.exportedAt, true);
  offset += 8;
  view.setUint32(offset, chunkPayloads.length, true);
  offset += 4;

  for (const chunk of chunkPayloads) {
    const typeBytes = utf8(chunk.type);
    bytes.set(typeBytes.slice(0, 4), offset);
    offset += 4;
    view.setUint32(offset, chunk.bytes.byteLength, true);
    offset += 4;
    bytes.set(chunk.bytes, offset);
    offset += chunk.bytes.byteLength;
  }

  return buffer;
}

function decodeBinaryEnvelope(buffer: ArrayBuffer): TimelineBinaryEnvelope {
  const view = new DataView(buffer);
  if (buffer.byteLength < 18) {
    throw new Error('Invalid timeline binary package');
  }

  let offset = 0;
  const magic = view.getUint32(offset, true);
  offset += 4;
  const version = view.getUint16(offset, true);
  offset += 2;
  const formatCode = view.getUint16(offset, true);
  offset += 2;
  const exportedAt = view.getFloat64(offset, true);
  offset += 8;
  const chunkCount = view.getUint32(offset, true);
  offset += 4;

  if (version !== BINARY_VERSION) {
    throw new Error(`Unsupported timeline binary version: ${version}`);
  }
  if (magic !== BINARY_MAGIC_AAF && magic !== BINARY_MAGIC_OMF) {
    throw new Error('Unrecognized timeline binary magic');
  }
  if ((magic === BINARY_MAGIC_AAF && formatCode !== 1) || (magic === BINARY_MAGIC_OMF && formatCode !== 2)) {
    throw new Error('Timeline binary format mismatch');
  }

  const chunks: TimelineBinaryChunk[] = [];
  for (let index = 0; index < chunkCount; index += 1) {
    if (offset + 8 > buffer.byteLength) {
      throw new Error('Truncated timeline binary chunk header');
    }
    const type = utf8Decode(new Uint8Array(buffer.slice(offset, offset + 4))).trim();
    offset += 4;
    const length = view.getUint32(offset, true);
    offset += 4;
    if (offset + length > buffer.byteLength) {
      throw new Error('Truncated timeline binary chunk payload');
    }
    chunks.push({
      type,
      bytes: new Uint8Array(buffer.slice(offset, offset + length)),
    });
    offset += length;
  }

  const metaChunk = chunks.find((chunk) => chunk.type === 'META');
  if (!metaChunk) {
    throw new Error('Timeline binary package is missing metadata');
  }
  const meta = JSON.parse(utf8Decode(metaChunk.bytes)) as { sessionId: string; workspaceId: string };

  return {
    format: magic === BINARY_MAGIC_AAF ? 'AAF' : 'OMF',
    version,
    exportedAt,
    sessionId: meta.sessionId,
    workspaceId: meta.workspaceId,
    chunks,
  };
}

function chunkToJsonChunk(type: string, payload: unknown): TimelineBinaryChunk {
  return {
    type,
    bytes: utf8(JSON.stringify(payload)),
  };
}

function getChunkJson<T>(chunks: TimelineBinaryChunk[], type: string, fallback: T): T {
  const chunk = chunks.find((entry) => entry.type === type);
  if (!chunk) return fallback;
  return JSON.parse(utf8Decode(chunk.bytes)) as T;
}

function buildBinaryEnvelope(state: ReplayState, format: TimelineBinaryFormat): TimelineBinaryEnvelope {
  const exportedAt = Date.now();
  return {
    format,
    version: BINARY_VERSION,
    exportedAt,
    sessionId: state.sessionId,
    workspaceId: state.workspaceId,
    chunks: [
      chunkToJsonChunk('META', {
        format,
        version: BINARY_VERSION,
        exportedAt,
        sessionId: state.sessionId,
        workspaceId: state.workspaceId,
        metadata: state.metadata || null,
      }),
      chunkToJsonChunk('STATE', state),
      chunkToJsonChunk('TEMP', buildTimelineTempoMap(state)),
      chunkToJsonChunk('TRKS', state.tracks),
      chunkToJsonChunk('REGS', state.regions),
      chunkToJsonChunk('MIDI', state.midiNotes ?? []),
      chunkToJsonChunk('GRPS', state.trackGroups ?? []),
      chunkToJsonChunk('MKRS', state.markers ?? []),
      chunkToJsonChunk('COMP', state.compLanes ?? []),
      chunkToJsonChunk('AUTO', state.automation),
    ],
  };
}

function envelopeToReplayState(envelope: TimelineBinaryEnvelope): ReplayState {
  const fullState = getChunkJson<ReplayState | null>(envelope.chunks, 'STATE', null);
  if (fullState) {
    return {
      ...fullState,
      sessionId: fullState.sessionId || envelope.sessionId,
      workspaceId: fullState.workspaceId || envelope.workspaceId,
      metadata: {
        ...(fullState.metadata || {}),
        exportedAt: envelope.exportedAt,
        binaryFormat: envelope.format,
        tempoMap: getChunkJson(envelope.chunks, 'TEMP', []),
      },
    };
  }
  const metaChunk = envelope.chunks.find((chunk) => chunk.type === 'META');
  const meta = metaChunk
    ? JSON.parse(utf8Decode(metaChunk.bytes)) as {
      sessionId: string;
      workspaceId: string;
      metadata?: Record<string, unknown> | null;
    }
    : {
        sessionId: envelope.sessionId,
        workspaceId: envelope.workspaceId,
        metadata: null,
      };
  return {
    sessionId: meta.sessionId || envelope.sessionId,
    workspaceId: meta.workspaceId || envelope.workspaceId,
    tracks: getChunkJson(envelope.chunks, 'TRKS', []),
    regions: getChunkJson(envelope.chunks, 'REGS', []),
    midiNotes: getChunkJson(envelope.chunks, 'MIDI', []),
    automation: getChunkJson(envelope.chunks, 'AUTO', []),
    trackGroups: getChunkJson(envelope.chunks, 'GRPS', []),
    markers: getChunkJson(envelope.chunks, 'MKRS', []),
    compLanes: getChunkJson(envelope.chunks, 'COMP', []),
    metadata: {
      ...(meta.metadata || {}),
      exportedAt: envelope.exportedAt,
      binaryFormat: envelope.format,
    },
  };
}

export function serializeTimelineAafBinary(state: ReplayState): ArrayBuffer {
  return encodeBinaryEnvelope(buildBinaryEnvelope(state, 'AAF'));
}

export function serializeTimelineOmfBinary(state: ReplayState): ArrayBuffer {
  return encodeBinaryEnvelope(buildBinaryEnvelope(state, 'OMF'));
}

export function parseTimelineAafBinary(buffer: ArrayBuffer): ReplayState {
  const envelope = decodeBinaryEnvelope(buffer);
  if (envelope.format !== 'AAF') {
    throw new Error('Expected an AAF binary package');
  }
  return envelopeToReplayState(envelope);
}

export function parseTimelineOmfBinary(buffer: ArrayBuffer): ReplayState {
  const envelope = decodeBinaryEnvelope(buffer);
  if (envelope.format !== 'OMF') {
    throw new Error('Expected an OMF binary package');
  }
  return envelopeToReplayState(envelope);
}

function parseTimelineAdapterXml(raw: string): ReplayState | null {
  if (!raw.includes('<AAFAdapter') && !raw.includes('<OMFAdapter')) return null;

  const extract = (source: string, tag: string): string[] => {
    const regex = new RegExp(`<${tag}\\b([^>]*)\\/>`, 'g');
    const results: string[] = [];
    let match: RegExpExecArray | null;
    while ((match = regex.exec(source))) {
      results.push(match[1] || '');
    }
    return results;
  };
  const extractBlocks = (source: string, tag: string): Array<{ attrs: string; inner: string }> => {
    const regex = new RegExp(`<${tag}\\b([^>]*)>([\\s\\S]*?)<\\/${tag}>`, 'g');
    const results: Array<{ attrs: string; inner: string }> = [];
    let match: RegExpExecArray | null;
    while ((match = regex.exec(source))) {
      results.push({ attrs: match[1] || '', inner: match[2] || '' });
    }
    return results;
  };
  const readAttr = (attrs: string, key: string): string => {
    const match = attrs.match(new RegExp(`${key}="([^"]*)"`));
    return match ? match[1] : '';
  };
  const readNum = (attrs: string, key: string, fallback = 0): number => {
    const value = Number(readAttr(attrs, key));
    return Number.isFinite(value) ? value : fallback;
  };

  const sessionMatch = raw.match(/<session\b[^>]*id="([^"]*)"[^>]*workspaceId="([^"]*)"[^>]*>/);
  const sessionId = sessionMatch?.[1] || 'timeline-session';
  const workspaceId = sessionMatch?.[2] || 'timeline-workspace';
  const metadataMatch = raw.match(/<metadata\b([^>]*)\/>/);
  const metadataAttrs = metadataMatch?.[1] || '';
  const readMetaAttr = (key: string): string => readAttr(metadataAttrs, key);
  const tempoBpm = readMetaAttr('tempoBpm');
  const timeSignature = readMetaAttr('timeSignature');
  const timeSignatureNumerator = readMetaAttr('timeSignatureNumerator');
  const timeSignatureDenominator = readMetaAttr('timeSignatureDenominator');
  const sampleRate = readMetaAttr('sampleRate');
  const channelCount = readMetaAttr('channelCount');

  const trackGroups = extract(raw, 'trackGroup').map((attrs) => ({
    groupId: readAttr(attrs, 'id'),
    name: readAttr(attrs, 'name'),
    color: readAttr(attrs, 'color') || 'cyan',
    trackIds: readAttr(attrs, 'trackIds').split(',').filter(Boolean),
  })).filter((group) => Boolean(group.groupId));

  const compLanes = extract(raw, 'compLane').map((attrs) => ({
    laneId: readAttr(attrs, 'id'),
    trackId: readAttr(attrs, 'trackId'),
    name: readAttr(attrs, 'name'),
    activeRegionId: readAttr(attrs, 'activeRegionId'),
    regionIds: readAttr(attrs, 'regionIds').split(',').filter(Boolean),
  })).filter((lane) => Boolean(lane.laneId));

  const tempoMap = extract(raw, 'tempo').map((attrs) => ({
    timeSec: readNum(attrs, 'time', 0),
    bpm: readNum(attrs, 'bpm', 120),
    timeSignature: readAttr(attrs, 'timeSignature') || null,
  })).filter((entry) => Number.isFinite(entry.timeSec) && Number.isFinite(entry.bpm));

  const automation = extractBlocks(raw, 'automationLane').map(({ attrs, inner }) => ({
    laneId: readAttr(attrs, 'id'),
    trackId: readAttr(attrs, 'trackId'),
    parameter: readAttr(attrs, 'parameter'),
    points: extract(inner, 'point').map((pointAttrs) => ({
      pointId: readAttr(pointAttrs, 'id'),
      timeSec: readNum(pointAttrs, 'time', 0),
      value: readNum(pointAttrs, 'value', 0),
      curve: (readAttr(pointAttrs, 'curve') || 'linear') as 'step' | 'linear' | 'bezier',
    })).filter((point) => Boolean(point.pointId)),
  })).filter((lane) => Boolean(lane.laneId));

  const markers = extract(raw, 'marker').map((attrs) => ({
    id: readAttr(attrs, 'id'),
    timeSec: readNum(attrs, 'time', 0),
    label: readAttr(attrs, 'label'),
    color: readAttr(attrs, 'color') || 'cyan',
    note: readAttr(attrs, 'note') || undefined,
  })).filter((marker) => Boolean(marker.id));

  const tracks = extract(raw, 'track').map((attrs): ReplayTrackState => ({
    trackId: readAttr(attrs, 'id'),
    trackName: readAttr(attrs, 'name'),
    kind: (readAttr(attrs, 'kind') || 'audio') as ReplayTrackKind,
    groupId: readAttr(attrs, 'groupId') || null,
    gainDb: readNum(attrs, 'gainDb', 0),
    pan: readNum(attrs, 'pan', 0),
    muted: false,
    solo: false,
    limiterThresholdDb: null,
    normalizedTargetLUFS: null,
    dcRemovalHz: null,
    outputBusId: readAttr(attrs, 'outputBusId') || readAttr(attrs, 'routingOutputBusId') || null,
    sends: [],
    appliedProposalIds: [],
    trackStateHash: '',
  })).filter((track) => Boolean(track.trackId));

  const midiNotes = extractBlocks(raw, 'midiNotes').flatMap(({ inner }) =>
    extract(inner, 'note').map((noteAttrs) => ({
      noteId: readAttr(noteAttrs, 'id'),
      trackId: readAttr(noteAttrs, 'trackId') || tracks[0]?.trackId || 'track-main',
      startTimeSec: readNum(noteAttrs, 'start', 0),
      durationSec: readNum(noteAttrs, 'duration', 0.5),
      pitch: readNum(noteAttrs, 'pitch', 60),
      velocity: readNum(noteAttrs, 'velocity', 96),
      channel: readAttr(noteAttrs, 'channel') ? Number(readAttr(noteAttrs, 'channel')) : null,
    }))
  ).filter((note) => Boolean(note.noteId));

  const regionMatches = raw.match(/<region\b([^>]*)\/>/g) || [];
  const regions = regionMatches.map((entry) => {
    const attrs = entry.replace(/^<region\b/, '').replace(/\/>$/, '');
    return {
      regionId: readAttr(attrs, 'id'),
      trackId: readAttr(attrs, 'trackId') || readAttr(attrs, 'track') || tracks[0]?.trackId || 'track-main',
      sourceId: readAttr(attrs, 'sourceId') || readAttr(attrs, 'assetId') || readAttr(attrs, 'id'),
      startTimeSec: readNum(attrs, 'start', 0),
      offsetSec: readNum(attrs, 'offset', 0),
      durationSec: readNum(attrs, 'duration', 1),
      gainDb: readNum(attrs, 'gainDb', 0),
      compLaneId: readAttr(attrs, 'compLaneId') || null,
      compTakeIndex: readAttr(attrs, 'compTakeIndex') ? Number(readAttr(attrs, 'compTakeIndex')) : null,
      fadeInSec: readAttr(attrs, 'fadeInSec') ? Number(readAttr(attrs, 'fadeInSec')) : null,
      fadeOutSec: readAttr(attrs, 'fadeOutSec') ? Number(readAttr(attrs, 'fadeOutSec')) : null,
    };
  }).filter((region) => Boolean(region.regionId));

  return {
    sessionId,
    workspaceId,
    tracks,
    regions,
    midiNotes,
    automation: [],
    trackGroups,
    markers,
    compLanes,
    metadata: {
      ...(tempoBpm ? { tempoBpm: Number(tempoBpm) } : {}),
      ...(timeSignature ? { timeSignature } : {}),
      ...(timeSignatureNumerator ? { timeSignatureNumerator: Number(timeSignatureNumerator) } : {}),
      ...(timeSignatureDenominator ? { timeSignatureDenominator: Number(timeSignatureDenominator) } : {}),
      ...(sampleRate ? { sampleRate: Number(sampleRate) } : {}),
      ...(channelCount ? { channelCount: Number(channelCount) } : {}),
      ...(tempoMap.length > 0 ? { tempoMap } : {}),
    },
  };
}

function parseTimelineAdapterJson(raw: string): ReplayState | null {
  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== 'object') return null;
  if (parsed.format === 'TIMELINE-MARKERS' && Array.isArray(parsed.markers)) {
    return {
      sessionId: 'timeline-session-import',
      workspaceId: 'timeline-workspace-import',
      tracks: [],
      regions: [],
      midiNotes: [],
      automation: [],
      markers: parsed.markers,
      trackGroups: [],
      compLanes: [],
    };
  }

  if ((parsed.format === 'AAF-ADAPTER' || parsed.format === 'OMF-ADAPTER') && Array.isArray(parsed.tracks)) {
    if (parsed.fullState && typeof parsed.fullState === 'object') {
      return {
        ...(parsed.fullState as ReplayState),
        sessionId: parsed.sessionId || (parsed.fullState as ReplayState).sessionId || 'timeline-session-import',
        workspaceId: parsed.workspaceId || (parsed.fullState as ReplayState).workspaceId || 'timeline-workspace-import',
        metadata: parsed.metadata && typeof parsed.metadata === 'object'
          ? { ...(parsed.fullState as ReplayState).metadata || {}, ...(parsed.metadata as Record<string, unknown>) }
          : (parsed.fullState as ReplayState).metadata,
      };
    }
    const tracks = parsed.tracks.map((track: any) => ({
      trackId: track.trackId,
      trackName: track.trackName,
      kind: track.kind || 'audio',
      groupId: track.groupId ?? null,
      gainDb: Number(track.gainDb || 0),
      pan: Number(track.pan || 0),
      muted: false,
      solo: false,
      limiterThresholdDb: null,
      normalizedTargetLUFS: null,
      dcRemovalHz: null,
      outputBusId: track.outputBusId ?? track.routing?.outputBusId ?? null,
      sends: Array.isArray(track.sends)
        ? track.sends.map((send: any) => ({
            sendId: send.sendId || send.id,
            targetTrackId: send.targetTrackId || 'master',
            levelDb: Number(send.levelDb ?? -12),
            preFader: Boolean(send.preFader),
            enabled: send.enabled !== false,
            mode: send.mode === 'sidechain' ? 'sidechain' : 'aux',
          })).filter((send: any) => Boolean(send.sendId))
        : [],
      appliedProposalIds: [],
      trackStateHash: '',
    })) as ReplayTrackState[];
    const regions = (parsed.tracks as Array<{ trackId?: string; regions?: Array<Record<string, any>> }>).flatMap((track) =>
      Array.isArray(track.regions)
        ? track.regions.map((region) => ({
            regionId: region.regionId,
            trackId: track.trackId || 'track-main',
            sourceId: region.sourceId || region.regionId,
            startTimeSec: Number(region.startTimeSec || 0),
            offsetSec: Number(region.offsetSec || 0),
            durationSec: Number(region.durationSec || 1),
            gainDb: Number(region.gainDb || 0),
            compLaneId: region.compLaneId || null,
            compTakeIndex: region.compTakeIndex === null || region.compTakeIndex === undefined
              ? null
              : Number(region.compTakeIndex),
            fadeInSec: region.fadeInSec === null || region.fadeInSec === undefined
              ? null
              : Number(region.fadeInSec),
            fadeOutSec: region.fadeOutSec === null || region.fadeOutSec === undefined
              ? null
              : Number(region.fadeOutSec),
          }))
        : []
    );
    const midiNotes = (parsed.tracks as Array<{ trackId?: string; midiNotes?: Array<Record<string, any>> }>).flatMap((track) =>
      Array.isArray(track.midiNotes)
        ? track.midiNotes.map((note) => ({
            noteId: note.noteId,
            trackId: track.trackId || 'track-main',
            startTimeSec: Number(note.startTimeSec || 0),
            durationSec: Number(note.durationSec || 0.5),
            pitch: Number(note.pitch || 60),
            velocity: Number(note.velocity || 96),
            channel: note.channel === null || note.channel === undefined ? null : Number(note.channel),
          }))
        : []
    );

    return {
      sessionId: parsed.sessionId || 'timeline-session-import',
      workspaceId: parsed.workspaceId || 'timeline-workspace-import',
      tracks,
      regions,
      midiNotes,
      automation: Array.isArray(parsed.automation) ? parsed.automation : [],
      trackGroups: Array.isArray(parsed.trackGroups) ? parsed.trackGroups : [],
      markers: Array.isArray(parsed.markers) ? parsed.markers : [],
      compLanes: Array.isArray(parsed.compLanes) ? parsed.compLanes : [],
      metadata: {
        ...(parsed.metadata && typeof parsed.metadata === 'object' ? parsed.metadata : {}),
        ...(Array.isArray(parsed.tempoMap) ? { tempoMap: parsed.tempoMap } : {}),
      },
    };
  }

  if (!Array.isArray(parsed.tracks) || !Array.isArray(parsed.regions)) return null;

  return {
    sessionId: parsed.sessionId || 'timeline-session-import',
    workspaceId: parsed.workspaceId || 'timeline-workspace-import',
    tracks: parsed.tracks,
    regions: parsed.regions,
    midiNotes: Array.isArray(parsed.midiNotes) ? parsed.midiNotes : [],
    automation: Array.isArray(parsed.automation) ? parsed.automation : [],
    trackGroups: Array.isArray(parsed.trackGroups) ? parsed.trackGroups : [],
    markers: Array.isArray(parsed.markers) ? parsed.markers : [],
    compLanes: Array.isArray(parsed.compLanes) ? parsed.compLanes : [],
    metadata: {
      ...(parsed.metadata && typeof parsed.metadata === 'object' ? parsed.metadata : {}),
      ...(Array.isArray(parsed.tempoMap) ? { tempoMap: parsed.tempoMap } : {}),
    },
  };
}

function parseTimelineInterchangeText(raw: string): ReplayState | null {
  const xmlState = parseTimelineAdapterXml(raw);
  if (xmlState) return xmlState;
  return parseTimelineAdapterJson(raw);
}

export async function importTimelineInterchangeFile(file: File): Promise<ReplayState> {
  const bytes = await file.arrayBuffer();
  try {
    const envelope = decodeBinaryEnvelope(bytes);
    return envelopeToReplayState(envelope);
  } catch {
    // Not a binary ESL interchange package. Fall back to text parsing.
  }

  const raw = utf8Decode(new Uint8Array(bytes));
  const state = parseTimelineInterchangeText(raw);
  if (!state) {
    throw new Error('Unsupported timeline interchange file');
  }
  return state;
}

export function downloadTimelineAafAdapterBinary(state: ReplayState, fileName = 'echo-session'): void {
  downloadBinary(serializeTimelineAafBinary(state), `${fileName}.aaf`);
}

export function downloadTimelineOmfAdapterBinary(state: ReplayState, fileName = 'echo-session'): void {
  downloadBinary(serializeTimelineOmfBinary(state), `${fileName}.omf`);
}
