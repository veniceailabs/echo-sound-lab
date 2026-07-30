import type { SessionImportPackageGraph } from './sessionImportService';

export type ProofTrainerTrackKind = 'beat' | 'vocal' | 'reference' | 'other';

export interface ProofTrainerDecodedTrack {
  trackId: string;
  fileName: string;
  role: string;
  kind: ProofTrainerTrackKind;
  buffer: AudioBuffer;
}

export interface ProofTrainerTrackAnalysis {
  trackId: string;
  fileName: string;
  role: string;
  kind: ProofTrainerTrackKind;
  duration_ms: number;
  lead_in_ms: number;
  tail_out_ms: number;
  trim_start_ms: number;
  trim_end_ms: number;
  start_timestamp_ms: number;
  rms_db: number;
  peak_db: number;
  onset_confidence: number;
  alignment_score: number;
  selected: boolean;
  anchor: boolean;
  edit_density: number;
  activity_regions: ProofTrainerActivityRegion[];
  notes: string[];
}

export interface ProofTrainerWaveformOffsetEstimate {
  offset_ms: number;
  confidence: number;
  correlation: number;
  usedFallback: boolean;
}

export interface ProofTrainerActivityRegion {
  region_id: string;
  start_ms: number;
  end_ms: number;
  duration_ms: number;
  rms_db: number;
  peak_db: number;
  lane_role: string;
  section_name: string;
  label_confidence: number;
}

export interface ProofTrainerCompLaneCandidate {
  candidate_id: string;
  track_id: string;
  file_name: string;
  region_id: string;
  lane_role: string;
  section_name: string;
  start_ms: number;
  end_ms: number;
  duration_ms: number;
  score: number;
  reasons: string[];
}

export interface ProofTrainerCompLane {
  lane_id: string;
  lane_role: string;
  section_name: string;
  start_ms: number;
  end_ms: number;
  primary_candidate_id: string | null;
  candidates: ProofTrainerCompLaneCandidate[];
  assembled_segments: ProofTrainerCompSegment[];
}

export interface ProofTrainerCompSegment {
  segment_id: string;
  lane_id: string;
  candidate_id: string;
  track_id: string;
  file_name: string;
  section_name: string;
  lane_role: string;
  start_ms: number;
  end_ms: number;
  duration_ms: number;
  comp_start_ms: number;
  comp_end_ms: number;
  score: number;
}

export interface ProofTrainerSessionDuplicateGroup {
  file_name: string;
  count: number;
  track_ids: string[];
}

export interface ProofTrainerSessionManifest {
  format: 'esl-proof-trainer-session-manifest';
  version: 1;
  created_at_epoch: number;
  source_app?: string | null;
  source_package_confidence?: number | null;
  source_package_markers?: string[] | null;
  package_graph?: SessionImportPackageGraph | null;
  reference_style: string;
  request_text: string;
  accept_to_vault: boolean;
  sample_rate: number;
  anchor_track_id: string | null;
  session_zero_ms: number;
  duration_ms: number;
  tracks: ProofTrainerTrackAnalysis[];
  comp_lanes: ProofTrainerCompLane[];
  summary: {
    track_count: number;
    beat_count: number;
    vocal_count: number;
    reference_count: number;
    auto_trimmed_tracks: number;
    fragmented_track_count: number;
    max_regions_on_track: number;
    comp_lane_count: number;
    candidate_take_count: number;
    assembled_segment_count: number;
  };
  duplicate_groups: ProofTrainerSessionDuplicateGroup[];
}

export interface ProofTrainerAlignmentRequest {
  beatFile: ProofTrainerDecodedTrack | null;
  vocalFiles: ProofTrainerDecodedTrack[];
  referenceFile: ProofTrainerDecodedTrack | null;
  referenceStyle: string;
  requestText: string;
  acceptToVault: boolean;
}

export interface ProofTrainerSessionMetadata {
  referenceStyle: string;
  requestText: string;
  acceptToVault: boolean;
}

const ANALYSIS_BLOCK_SIZE = 1024;
const MIN_SILENCE_DB = -60;
const DEFAULT_LEAD_IN_PADDING_BLOCKS = 1;
const DEFAULT_TRAIL_PADDING_BLOCKS = 1;
const ALIGNMENT_WINDOW_BLOCKS = 96;
const ALIGNMENT_SEARCH_RADIUS_BLOCKS = 72;
const MIN_ALIGNMENT_CORRELATION = 0.52;
const MIN_ACTIVITY_BLOCKS = 2;
const MAX_ACTIVITY_GAP_BLOCKS = 3;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function dbToLinear(db: number): number {
  return Math.pow(10, db / 20);
}

function linearToDb(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return MIN_SILENCE_DB;
  return 20 * Math.log10(value);
}

function monoFromBuffer(buffer: AudioBuffer): Float32Array {
  const mono = new Float32Array(buffer.length);
  const channels = Math.max(1, buffer.numberOfChannels);
  for (let channel = 0; channel < channels; channel += 1) {
    const data = buffer.getChannelData(channel);
    for (let i = 0; i < buffer.length; i += 1) {
      mono[i] += (data[i] ?? 0) / channels;
    }
  }
  return mono;
}

function blockRms(samples: Float32Array, start: number, end: number): number {
  let sumSquares = 0;
  let count = 0;
  for (let i = start; i < end; i += 1) {
    const sample = samples[i] ?? 0;
    sumSquares += sample * sample;
    count += 1;
  }
  if (count === 0) return 0;
  return Math.sqrt(sumSquares / count);
}

function analyzeBlocks(samples: Float32Array, blockSize = ANALYSIS_BLOCK_SIZE): number[] {
  const blockCount = Math.max(1, Math.ceil(samples.length / blockSize));
  const blocks: number[] = [];
  for (let block = 0; block < blockCount; block += 1) {
    const start = block * blockSize;
    const end = Math.min(samples.length, start + blockSize);
    blocks.push(blockRms(samples, start, end));
  }
  return blocks;
}

interface TrackTimingProfile {
  blocks: number[];
  overallRms: number;
  peak: number;
  adaptiveThreshold: number;
  firstActiveBlock: number;
  lastActiveBlock: number;
}

interface BlockRegion {
  startBlock: number;
  endBlock: number;
}

interface RegionDescriptor {
  startMs: number;
  endMs: number;
  durationMs: number;
  rmsDb: number;
  peakDb: number;
}

interface CompCandidateSeed {
  candidateId: string;
  trackId: string;
  fileName: string;
  regionId: string;
  laneRole: string;
  sectionName: string;
  startMs: number;
  endMs: number;
  durationMs: number;
  score: number;
  reasons: string[];
}

function percentile(values: number[], ratio: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const idx = clamp(Math.floor(sorted.length * ratio), 0, sorted.length - 1);
  return sorted[idx] ?? 0;
}

function estimateOnsetThreshold(blocks: number[], overallRms: number, peak: number): number {
  const activeBlocks = blocks.filter((value) => value > 0);
  const activeFloor = percentile(activeBlocks, 0.15);
  return Math.max(
    dbToLinear(-48),
    overallRms * 0.35,
    peak * 0.18,
    activeFloor * 0.45,
  );
}

function buildTrackTimingProfile(track: ProofTrainerDecodedTrack): TrackTimingProfile {
  const mono = monoFromBuffer(track.buffer);
  const blocks = analyzeBlocks(mono);
  const overallRms = blockRms(mono, 0, mono.length);
  const peak = mono.reduce((max, sample) => Math.max(max, Math.abs(sample)), 0);
  const adaptiveThreshold = estimateOnsetThreshold(blocks, overallRms, peak);
  const firstActiveBlock = findFirstAbove(blocks, adaptiveThreshold);
  const lastActiveBlock = findLastAbove(blocks, adaptiveThreshold);
  return {
    blocks,
    overallRms,
    peak,
    adaptiveThreshold,
    firstActiveBlock,
    lastActiveBlock,
  };
}

function detectActivityBlockRegions(profile: TrackTimingProfile): BlockRegion[] {
  const threshold = Math.max(dbToLinear(-54), profile.adaptiveThreshold * 0.55);
  const rawRegions: BlockRegion[] = [];
  let regionStart = -1;

  for (let block = 0; block < profile.blocks.length; block += 1) {
    const isActive = (profile.blocks[block] ?? 0) >= threshold;
    if (isActive) {
      if (regionStart < 0) regionStart = block;
      continue;
    }
    if (regionStart >= 0) {
      rawRegions.push({ startBlock: regionStart, endBlock: block - 1 });
      regionStart = -1;
    }
  }
  if (regionStart >= 0) {
    rawRegions.push({ startBlock: regionStart, endBlock: profile.blocks.length - 1 });
  }

  const merged: BlockRegion[] = [];
  for (const region of rawRegions) {
    const last = merged[merged.length - 1];
    if (last && region.startBlock - last.endBlock - 1 <= MAX_ACTIVITY_GAP_BLOCKS) {
      last.endBlock = region.endBlock;
      continue;
    }
    merged.push({ ...region });
  }

  return merged.filter((region) => region.endBlock - region.startBlock + 1 >= MIN_ACTIVITY_BLOCKS);
}

function buildActivityRegions(
  track: ProofTrainerDecodedTrack,
  timingProfile: TrackTimingProfile,
): ProofTrainerActivityRegion[] {
  const regions = detectActivityBlockRegions(timingProfile);
  const descriptors: RegionDescriptor[] = regions.map((region) => {
    const startSample = Math.max(0, region.startBlock * ANALYSIS_BLOCK_SIZE);
    const endSample = Math.min(track.buffer.length, (region.endBlock + 1) * ANALYSIS_BLOCK_SIZE);
    const samples = monoFromBuffer(track.buffer).subarray(startSample, endSample);
    const rms = blockRms(samples, 0, samples.length);
    const peak = samples.reduce((max, sample) => Math.max(max, Math.abs(sample)), 0);
    return {
      startMs: Math.round(startSample * 1000 / track.buffer.sampleRate),
      endMs: Math.round(endSample * 1000 / track.buffer.sampleRate),
      durationMs: Math.max(0, Math.round((endSample - startSample) * 1000 / track.buffer.sampleRate)),
      rmsDb: linearToDb(rms),
      peakDb: linearToDb(peak),
    };
  });

  const maxPeakDb = descriptors.reduce((max, region) => Math.max(max, region.peakDb), MIN_SILENCE_DB);

  return descriptors.map((descriptor, index) => {
    const sectionInference = inferRegionSectionName(
      descriptor,
      track.buffer.duration * 1000,
      descriptors,
      index,
      maxPeakDb,
    );
    const laneInference = inferRegionLaneRole(track, descriptors, index, sectionInference.sectionName);
    return {
      region_id: `${track.trackId}-region-${index + 1}`,
      start_ms: descriptor.startMs,
      end_ms: descriptor.endMs,
      duration_ms: descriptor.durationMs,
      rms_db: descriptor.rmsDb,
      peak_db: descriptor.peakDb,
      lane_role: laneInference.laneRole,
      section_name: sectionInference.sectionName,
      label_confidence: Math.min(sectionInference.confidence, laneInference.confidence),
    };
  });
}

function inferRegionSectionName(
  region: RegionDescriptor,
  totalDurationMs: number,
  allRegions: RegionDescriptor[],
  index: number,
  maxPeakDb: number,
): { sectionName: string; confidence: number } {
  const midpointMs = region.startMs + region.durationMs / 2;
  const position = clamp(midpointMs / Math.max(totalDurationMs, 1), 0, 1);
  const relativePeak = clamp((region.peakDb - MIN_SILENCE_DB) / Math.max(1, maxPeakDb - MIN_SILENCE_DB), 0, 1);
  const isLoudest = region.peakDb >= maxPeakDb - 1.5;

  if (position <= 0.18) {
    return { sectionName: 'intro', confidence: 0.9 };
  }
  if (position >= 0.86) {
    return { sectionName: 'outro', confidence: 0.9 };
  }
  if (isLoudest && position >= 0.28 && position <= 0.85) {
    return { sectionName: 'hook', confidence: 0.78 };
  }
  if (position >= 0.2 && position <= 0.38 && relativePeak < 0.75) {
    return { sectionName: 'verse', confidence: 0.7 };
  }
  if (position > 0.38 && position < 0.55) {
    return { sectionName: 'pre-hook', confidence: 0.62 };
  }
  if (position >= 0.55 && position < 0.82) {
    return { sectionName: allRegions.length > 2 && index === allRegions.length - 1 ? 'bridge' : 'hook', confidence: 0.58 };
  }
  return { sectionName: 'verse', confidence: 0.52 };
}

function inferRegionLaneRole(
  track: ProofTrainerDecodedTrack,
  allRegions: RegionDescriptor[],
  index: number,
  sectionName: string,
): { laneRole: string; confidence: number } {
  if (track.kind === 'beat') return { laneRole: 'beat', confidence: 0.98 };
  if (track.kind === 'reference') return { laneRole: 'reference', confidence: 0.98 };
  if (track.role === 'bass') return { laneRole: 'bass', confidence: 0.95 };
  if (track.role === 'double' || track.role === 'adlib' || track.role === 'harmony' || track.role === 'throw') {
    return { laneRole: track.role, confidence: 0.92 };
  }
  if (track.role === 'intro' || sectionName === 'intro') return { laneRole: 'intro', confidence: 0.78 };
  if (track.role === 'outro' || sectionName === 'outro') return { laneRole: 'outro', confidence: 0.78 };
  if (track.role === 'lead') {
    if (sectionName === 'hook') return { laneRole: 'lead-hook', confidence: 0.72 };
    if (sectionName === 'pre-hook') return { laneRole: 'lead-pre-hook', confidence: 0.68 };
    if (sectionName === 'verse') return { laneRole: 'lead-verse', confidence: 0.68 };
    return { laneRole: 'lead', confidence: 0.64 };
  }
  if (track.role === 'support') {
    if (allRegions.length > 1 && index > 0) return { laneRole: 'support-stack', confidence: 0.6 };
    return { laneRole: 'support', confidence: 0.56 };
  }
  return { laneRole: track.role || 'support', confidence: 0.5 };
}

function buildCompLaneCandidates(tracks: ProofTrainerTrackAnalysis[]): CompCandidateSeed[] {
  const candidates: CompCandidateSeed[] = [];
  for (const track of tracks) {
    if (track.kind !== 'vocal') continue;
    for (const region of track.activity_regions) {
      const reasons: string[] = [];
      let score = 0.25;
      score += clamp(track.alignment_score, 0, 1) * 0.25;
      reasons.push(`alignment ${(track.alignment_score * 100).toFixed(0)}%`);
      score += clamp(region.label_confidence, 0, 1) * 0.25;
      reasons.push(`label ${(region.label_confidence * 100).toFixed(0)}%`);
      const durationWeight = clamp(region.duration_ms / 320, 0, 1) * 0.2;
      score += durationWeight;
      if (durationWeight > 0.05) reasons.push(`duration ${region.duration_ms} ms`);
      const peakWeight = clamp((region.peak_db + 18) / 20, 0, 1) * 0.15;
      score += peakWeight;
      if (peakWeight > 0.05) reasons.push(`peak ${region.peak_db.toFixed(1)} dB`);
      const rmsWeight = clamp((region.rms_db + 24) / 22, 0, 1) * 0.1;
      score += rmsWeight;
      if (rmsWeight > 0.04) reasons.push(`rms ${region.rms_db.toFixed(1)} dB`);
      if (track.role === 'lead' && region.lane_role.startsWith('lead')) {
        score += 0.1;
        reasons.push('lead lane priority');
      }
      if (track.role === 'double' || track.role === 'harmony' || track.role === 'adlib') {
        score += 0.05;
        reasons.push(`${track.role} support lane`);
      }

      candidates.push({
        candidateId: `${track.trackId}:${region.region_id}`,
        trackId: track.trackId,
        fileName: track.fileName,
        regionId: region.region_id,
        laneRole: region.lane_role,
        sectionName: region.section_name,
        startMs: track.start_timestamp_ms + region.start_ms,
        endMs: track.start_timestamp_ms + region.end_ms,
        durationMs: region.duration_ms,
        score: Number(clamp(score, 0, 1).toFixed(3)),
        reasons,
      });
    }
  }
  return candidates;
}

function buildCompLanes(tracks: ProofTrainerTrackAnalysis[]): ProofTrainerCompLane[] {
  const grouped = new Map<string, CompCandidateSeed[]>();
  for (const candidate of buildCompLaneCandidates(tracks)) {
    const key = `${candidate.sectionName}::${candidate.laneRole}`;
    const list = grouped.get(key);
    if (list) {
      list.push(candidate);
    } else {
      grouped.set(key, [candidate]);
    }
  }

  return Array.from(grouped.entries())
    .map(([key, seeds]) => {
      const [sectionName, laneRole] = key.split('::');
      const sorted = seeds
        .slice()
        .sort((left, right) => right.score - left.score || left.startMs - right.startMs || left.fileName.localeCompare(right.fileName));
      const laneStartMs = Math.min(...sorted.map((candidate) => candidate.startMs));
      const laneEndMs = Math.max(...sorted.map((candidate) => candidate.endMs));
      const assembledSegments = buildAssembledCompSegments(
        `lane-${sectionName}-${laneRole}`.replace(/[^a-z0-9_-]+/gi, '-').toLowerCase(),
        sorted,
      );
      return {
        lane_id: `lane-${sectionName}-${laneRole}`.replace(/[^a-z0-9_-]+/gi, '-').toLowerCase(),
        lane_role: laneRole,
        section_name: sectionName,
        start_ms: laneStartMs,
        end_ms: laneEndMs,
        primary_candidate_id: sorted[0]?.candidateId ?? null,
        candidates: sorted.map((candidate) => ({
          candidate_id: candidate.candidateId,
          track_id: candidate.trackId,
          file_name: candidate.fileName,
          region_id: candidate.regionId,
          lane_role: candidate.laneRole,
          section_name: candidate.sectionName,
          start_ms: candidate.startMs,
          end_ms: candidate.endMs,
          duration_ms: candidate.durationMs,
          score: candidate.score,
          reasons: candidate.reasons,
        })),
        assembled_segments: assembledSegments,
      } satisfies ProofTrainerCompLane;
    })
    .sort((left, right) => left.start_ms - right.start_ms || left.lane_role.localeCompare(right.lane_role));
}

function buildAssembledCompSegments(
  laneId: string,
  sortedCandidates: CompCandidateSeed[],
): ProofTrainerCompSegment[] {
  const chosen: CompCandidateSeed[] = [];
  for (const candidate of sortedCandidates) {
    const overlapsExisting = chosen.some((existing) => {
      const overlapStart = Math.max(existing.startMs, candidate.startMs);
      const overlapEnd = Math.min(existing.endMs, candidate.endMs);
      return overlapEnd - overlapStart > 35;
    });
    if (!overlapsExisting) {
      chosen.push(candidate);
    }
  }

  const timelineOrdered = chosen
    .slice()
    .sort((left, right) => left.startMs - right.startMs || right.score - left.score || left.fileName.localeCompare(right.fileName));

  return timelineOrdered.map((candidate, index) => {
    const prev = timelineOrdered[index - 1] ?? null;
    const next = timelineOrdered[index + 1] ?? null;
    const compStartMs = prev ? Math.max(candidate.startMs, Math.round((prev.endMs + candidate.startMs) / 2)) : candidate.startMs;
    const compEndMs = next ? Math.min(candidate.endMs, Math.round((candidate.endMs + next.startMs) / 2)) : candidate.endMs;
    const boundedStart = Math.max(candidate.startMs, compStartMs);
    const boundedEnd = Math.max(boundedStart, Math.min(candidate.endMs, compEndMs));

    return {
      segment_id: `${laneId}-segment-${index + 1}`,
      lane_id: laneId,
      candidate_id: candidate.candidateId,
      track_id: candidate.trackId,
      file_name: candidate.fileName,
      section_name: candidate.sectionName,
      lane_role: candidate.laneRole,
      start_ms: candidate.startMs,
      end_ms: candidate.endMs,
      duration_ms: candidate.durationMs,
      comp_start_ms: boundedStart,
      comp_end_ms: boundedEnd,
      score: candidate.score,
    };
  });
}

function findFirstAbove(blocks: number[], threshold: number): number {
  for (let i = 0; i < blocks.length; i += 1) {
    if ((blocks[i] ?? 0) > threshold) return i;
  }
  return 0;
}

function findLastAbove(blocks: number[], threshold: number): number {
  for (let i = blocks.length - 1; i >= 0; i -= 1) {
    if ((blocks[i] ?? 0) > threshold) return i;
  }
  return Math.max(0, blocks.length - 1);
}

function guessTrackKind(fileName: string, role: string): ProofTrainerTrackKind {
  const text = `${fileName} ${role}`.toLowerCase();
  if (/(^|[\s._-])(beat|instrumental|session|logic|protools|pro tools|reftrack|reference)([\s._-]|$)/.test(text)) {
    return text.includes('reference') ? 'reference' : 'beat';
  }
  if (/(^|[\s._-])(lead|main|verse|hook|vocal|vox)([\s._-]|$)/.test(text)) return 'vocal';
  if (/(^|[\s._-])(master|mix|bounce|final)([\s._-]|$)/.test(text)) return 'reference';
  return 'other';
}

function guessAnchorPriority(kind: ProofTrainerTrackKind): number {
  switch (kind) {
    case 'beat':
      return 3;
    case 'reference':
      return 2;
    case 'vocal':
      return 1;
    default:
      return 0;
  }
}

function normalizedCorrelation(
  anchorBlocks: number[],
  trackBlocks: number[],
  anchorStart: number,
  anchorEnd: number,
  offsetBlocks: number,
): number {
  let dot = 0;
  let anchorEnergy = 0;
  let trackEnergy = 0;
  let overlapCount = 0;

  for (let i = anchorStart; i < anchorEnd; i += 1) {
    const otherIndex = i + offsetBlocks;
    if (otherIndex < 0 || otherIndex >= trackBlocks.length) continue;
    const anchorValue = anchorBlocks[i] ?? 0;
    const trackValue = trackBlocks[otherIndex] ?? 0;
    dot += anchorValue * trackValue;
    anchorEnergy += anchorValue * anchorValue;
    trackEnergy += trackValue * trackValue;
    overlapCount += 1;
  }

  if (overlapCount < 8 || anchorEnergy <= 0 || trackEnergy <= 0) return -1;
  return dot / Math.sqrt(anchorEnergy * trackEnergy);
}

export function estimateProofTrainerWaveformOffset(
  anchorTrack: ProofTrainerDecodedTrack,
  candidateTrack: ProofTrainerDecodedTrack,
): ProofTrainerWaveformOffsetEstimate {
  const anchorProfile = buildTrackTimingProfile(anchorTrack);
  const candidateProfile = buildTrackTimingProfile(candidateTrack);
  const coarseOffsetBlocks = candidateProfile.firstActiveBlock - anchorProfile.firstActiveBlock;
  const anchorWindowStart = Math.max(0, anchorProfile.firstActiveBlock - 2);
  const anchorWindowEnd = Math.min(
    anchorProfile.blocks.length,
    Math.max(anchorWindowStart + 8, Math.min(anchorProfile.lastActiveBlock + 8, anchorWindowStart + ALIGNMENT_WINDOW_BLOCKS)),
  );

  let bestOffsetBlocks = coarseOffsetBlocks;
  let bestCorrelation = normalizedCorrelation(
    anchorProfile.blocks,
    candidateProfile.blocks,
    anchorWindowStart,
    anchorWindowEnd,
    coarseOffsetBlocks,
  );

  for (let offsetBlocks = coarseOffsetBlocks - ALIGNMENT_SEARCH_RADIUS_BLOCKS; offsetBlocks <= coarseOffsetBlocks + ALIGNMENT_SEARCH_RADIUS_BLOCKS; offsetBlocks += 1) {
    const correlation = normalizedCorrelation(
      anchorProfile.blocks,
      candidateProfile.blocks,
      anchorWindowStart,
      anchorWindowEnd,
      offsetBlocks,
    );
    if (correlation > bestCorrelation) {
      bestCorrelation = correlation;
      bestOffsetBlocks = offsetBlocks;
    }
  }

  const blockMs = ANALYSIS_BLOCK_SIZE * 1000 / Math.min(anchorTrack.buffer.sampleRate, candidateTrack.buffer.sampleRate);
  const confidence = clamp((bestCorrelation - MIN_ALIGNMENT_CORRELATION) / (1 - MIN_ALIGNMENT_CORRELATION), 0, 1);
  if (bestCorrelation < MIN_ALIGNMENT_CORRELATION) {
    return {
      offset_ms: coarseOffsetBlocks * blockMs,
      confidence: 0,
      correlation: bestCorrelation,
      usedFallback: true,
    };
  }

  return {
    offset_ms: bestOffsetBlocks * blockMs,
    confidence,
    correlation: bestCorrelation,
    usedFallback: false,
  };
}

function buildTrackAnalysis(
  track: ProofTrainerDecodedTrack,
  sessionZeroMs: number,
  timingProfile: TrackTimingProfile,
  alignmentOverrideMs?: number,
  waveformAlignment?: ProofTrainerWaveformOffsetEstimate | null,
): ProofTrainerTrackAnalysis {
  const activityRegions = buildActivityRegions(track, timingProfile);
  const peakDb = linearToDb(timingProfile.peak);
  const rmsDb = linearToDb(timingProfile.overallRms);
  const firstActiveBlock = timingProfile.firstActiveBlock;
  const lastActiveBlock = timingProfile.lastActiveBlock;
  const leadInMs = Math.max(0, (firstActiveBlock - DEFAULT_LEAD_IN_PADDING_BLOCKS) * ANALYSIS_BLOCK_SIZE * 1000 / track.buffer.sampleRate);
  const tailOutMs = Math.max(0, Math.max(0, timingProfile.blocks.length - 1 - lastActiveBlock - DEFAULT_TRAIL_PADDING_BLOCKS) * ANALYSIS_BLOCK_SIZE * 1000 / track.buffer.sampleRate);
  const trimStartMs = Math.max(0, Math.round(leadInMs));
  const trimEndMs = Math.max(trimStartMs, Math.round(track.buffer.duration * 1000 - tailOutMs));
  const resolvedLeadInMs = typeof alignmentOverrideMs === 'number' && Number.isFinite(alignmentOverrideMs)
    ? Math.max(0, alignmentOverrideMs)
    : leadInMs;
  const startTimestampMs = Math.max(0, Math.round(resolvedLeadInMs - sessionZeroMs));
  const activeSpanMs = Math.max(1, trimEndMs - trimStartMs);
  const silenceRatio = clamp((trimStartMs + tailOutMs) / Math.max(1, track.buffer.duration * 1000), 0, 1);
  const onsetConfidence = clamp(1 - silenceRatio * 0.75 + Math.min(0.35, Math.max(0, (peakDb - rmsDb) / 48)), 0, 1);
  const offsetPenalty = clamp(startTimestampMs / Math.max(track.buffer.duration * 1000, 1), 0, 1);
  const waveformConfidence = waveformAlignment?.confidence ?? 0;
  const editDensity = Number(
    (
      activityRegions.length /
      Math.max(track.buffer.duration / 60, 0.25)
    ).toFixed(3),
  );
  const alignmentScore = clamp(0.3 + onsetConfidence * 0.35 + waveformConfidence * 0.25 + (1 - offsetPenalty) * 0.1, 0, 1);

  const notes: string[] = [];
  if (trimStartMs > 0) {
    notes.push(`Detected ${trimStartMs} ms of leading silence.`);
  }
  if (tailOutMs > 0) {
    notes.push(`Detected ${Math.round(tailOutMs)} ms of trailing silence.`);
  }
  if (track.kind === 'reference') {
    notes.push('Reference lane kept for comparison context.');
  }
  if (activityRegions.length > 1) {
    notes.push(`Detected ${activityRegions.length} active regions inside the file, suggesting internal edits or phrase-separated takes.`);
  }
  if (waveformAlignment && !waveformAlignment.usedFallback) {
    notes.push(`Waveform alignment refined offset with ${(waveformAlignment.correlation * 100).toFixed(1)}% correlation confidence.`);
  } else if (waveformAlignment?.usedFallback) {
    notes.push('Waveform alignment fell back to silence-based placement.');
  }

  return {
    trackId: track.trackId,
    fileName: track.fileName,
    role: track.role,
    kind: track.kind,
    duration_ms: Math.round(track.buffer.duration * 1000),
    lead_in_ms: Math.round(leadInMs),
    tail_out_ms: Math.round(tailOutMs),
    trim_start_ms: trimStartMs,
    trim_end_ms: trimEndMs,
    start_timestamp_ms: startTimestampMs,
    rms_db: rmsDb,
    peak_db: peakDb,
    onset_confidence: onsetConfidence,
    alignment_score: alignmentScore,
    selected: true,
    anchor: false,
    edit_density: editDensity,
    activity_regions: activityRegions,
    notes: notes.length > 0 ? notes : ['No substantial silence detected.'],
  };
}

export function analyzeProofTrainerTrack(track: ProofTrainerDecodedTrack): ProofTrainerTrackAnalysis {
  return buildTrackAnalysis(track, 0, buildTrackTimingProfile(track));
}

export function buildProofTrainerSessionManifestFromTracks(
  tracks: ProofTrainerDecodedTrack[],
  metadata: ProofTrainerSessionMetadata,
): ProofTrainerSessionManifest {

  if (tracks.length === 0) {
    return {
      format: 'esl-proof-trainer-session-manifest',
      version: 1,
      created_at_epoch: Date.now(),
      reference_style: metadata.referenceStyle,
      request_text: metadata.requestText,
      accept_to_vault: metadata.acceptToVault,
      sample_rate: 44100,
      anchor_track_id: null,
      session_zero_ms: 0,
      duration_ms: 0,
      tracks: [],
      comp_lanes: [],
      summary: {
        track_count: 0,
        beat_count: 0,
        vocal_count: 0,
        reference_count: 0,
        auto_trimmed_tracks: 0,
        fragmented_track_count: 0,
        max_regions_on_track: 0,
        comp_lane_count: 0,
        candidate_take_count: 0,
        assembled_segment_count: 0,
      },
      duplicate_groups: [],
    };
  }

  const timingProfiles = new Map<string, TrackTimingProfile>();
  for (const track of tracks) {
    timingProfiles.set(track.trackId, buildTrackTimingProfile(track));
  }

  const leadIns = tracks.map((track) => {
    const profile = timingProfiles.get(track.trackId);
    const firstActiveBlock = profile?.firstActiveBlock ?? 0;
    return Math.max(0, (firstActiveBlock - DEFAULT_LEAD_IN_PADDING_BLOCKS) * ANALYSIS_BLOCK_SIZE * 1000 / track.buffer.sampleRate);
  });

  const preliminaryAnalyses = tracks.map((track, index) => {
    const profile = timingProfiles.get(track.trackId) ?? buildTrackTimingProfile(track);
    return buildTrackAnalysis(track, 0, profile, leadIns[index] ?? 0, null);
  });

  const anchorTrack = preliminaryAnalyses
    .slice()
    .sort((left, right) => {
      const priorityGap = guessAnchorPriority(right.kind) - guessAnchorPriority(left.kind);
      if (priorityGap !== 0) return priorityGap;
      if (left.lead_in_ms !== right.lead_in_ms) return left.lead_in_ms - right.lead_in_ms;
      return left.fileName.localeCompare(right.fileName);
    })[0] || null;

  const anchorSourceTrack = anchorTrack
    ? tracks.find((candidate) => candidate.trackId === anchorTrack.trackId) ?? null
    : null;
  const anchorLeadInMs = anchorTrack?.lead_in_ms ?? 0;

  const resolvedLeadIns = new Map<string, number>();
  const waveformOffsets = new Map<string, ProofTrainerWaveformOffsetEstimate | null>();
  for (let index = 0; index < tracks.length; index += 1) {
    const track = tracks[index];
    const coarseLeadInMs = leadIns[index] ?? 0;
    if (!anchorTrack || !anchorSourceTrack || track.trackId === anchorTrack.trackId) {
      resolvedLeadIns.set(track.trackId, coarseLeadInMs);
      waveformOffsets.set(track.trackId, null);
      continue;
    }

    const waveformOffset = estimateProofTrainerWaveformOffset(anchorSourceTrack, track);
    waveformOffsets.set(track.trackId, waveformOffset);
    const resolvedLeadInMs = anchorLeadInMs + waveformOffset.offset_ms;
    resolvedLeadIns.set(track.trackId, Math.max(0, resolvedLeadInMs));
  }

  const sessionZeroMs = Math.max(0, Math.min(...Array.from(resolvedLeadIns.values())));
  const analyses = tracks.map((track, index) => {
    const profile = timingProfiles.get(track.trackId) ?? buildTrackTimingProfile(track);
    return buildTrackAnalysis(
      track,
      sessionZeroMs,
      profile,
      resolvedLeadIns.get(track.trackId) ?? leadIns[index] ?? 0,
      waveformOffsets.get(track.trackId) ?? null,
    );
  });

  if (anchorTrack) {
    const anchorIndex = analyses.findIndex((track) => track.trackId === anchorTrack.trackId);
    if (anchorIndex >= 0) {
      analyses[anchorIndex] = { ...analyses[anchorIndex], anchor: true };
    }
  }

  const duplicateMap = new Map<string, ProofTrainerSessionDuplicateGroup>();
  for (const track of analyses) {
    const key = track.fileName.toLowerCase();
    const existing = duplicateMap.get(key);
    if (existing) {
      existing.count += 1;
      existing.track_ids.push(track.trackId);
      continue;
    }
    duplicateMap.set(key, {
      file_name: track.fileName,
      count: 1,
      track_ids: [track.trackId],
    });
  }

  const duplicateGroups = Array.from(duplicateMap.values()).filter((group) => group.count > 1);
  const sampleRates = analyses.map((track) => tracks.find((candidate) => candidate.trackId === track.trackId)?.buffer.sampleRate ?? 44100);
  const durationMs = Math.max(
    ...analyses.map((track) => track.start_timestamp_ms + track.duration_ms),
  );
  const compLanes = buildCompLanes(analyses);

  return {
    format: 'esl-proof-trainer-session-manifest',
    version: 1,
    created_at_epoch: Date.now(),
    reference_style: metadata.referenceStyle,
    request_text: metadata.requestText,
    accept_to_vault: metadata.acceptToVault,
    sample_rate: sampleRates[0] ?? 44100,
    anchor_track_id: anchorTrack?.trackId ?? null,
    session_zero_ms: Math.round(sessionZeroMs),
    duration_ms: Math.round(durationMs),
    tracks: analyses.sort((left, right) => {
      if (left.start_timestamp_ms !== right.start_timestamp_ms) {
        return left.start_timestamp_ms - right.start_timestamp_ms;
      }
      return left.fileName.localeCompare(right.fileName);
    }),
    comp_lanes: compLanes,
    summary: {
      track_count: analyses.length,
      beat_count: analyses.filter((track) => track.kind === 'beat').length,
      vocal_count: analyses.filter((track) => track.kind === 'vocal').length,
      reference_count: analyses.filter((track) => track.kind === 'reference').length,
      auto_trimmed_tracks: analyses.filter((track) => track.trim_start_ms > 0 || track.tail_out_ms > 0).length,
      fragmented_track_count: analyses.filter((track) => track.activity_regions.length > 1).length,
      max_regions_on_track: analyses.reduce((max, track) => Math.max(max, track.activity_regions.length), 0),
      comp_lane_count: compLanes.length,
      candidate_take_count: compLanes.reduce((count, lane) => count + lane.candidates.length, 0),
      assembled_segment_count: compLanes.reduce((count, lane) => count + lane.assembled_segments.length, 0),
    },
    duplicate_groups: duplicateGroups,
  };
}

export function buildProofTrainerSessionManifest(request: ProofTrainerAlignmentRequest): ProofTrainerSessionManifest {
  const tracks: ProofTrainerDecodedTrack[] = [
    ...(request.beatFile ? [request.beatFile] : []),
    ...request.vocalFiles,
    ...(request.referenceFile ? [request.referenceFile] : []),
  ];

  return buildProofTrainerSessionManifestFromTracks(tracks, {
    referenceStyle: request.referenceStyle,
    requestText: request.requestText,
    acceptToVault: request.acceptToVault,
  });
}

export function buildProofTrainerTracksFromFiles(
  beatFile: File | null,
  vocalFiles: File[],
  referenceFile: File | null,
  decodedBuffers: Map<string, AudioBuffer>,
): ProofTrainerDecodedTrack[] {
  const tracks: ProofTrainerDecodedTrack[] = [];

  if (beatFile) {
    const buffer = decodedBuffers.get(beatFile.name);
    if (buffer) {
      tracks.push({
        trackId: `beat-${beatFile.name}`,
        fileName: beatFile.name,
        role: 'beat',
        kind: guessTrackKind(beatFile.name, 'beat'),
        buffer,
      });
    }
  }

  vocalFiles.forEach((file, index) => {
    const buffer = decodedBuffers.get(file.name);
    if (!buffer) return;
    tracks.push({
      trackId: `vocal-${index}-${file.name}`,
      fileName: file.name,
      role: inferRoleFromName(file.name, index),
      kind: guessTrackKind(file.name, inferRoleFromName(file.name, index)),
      buffer,
    });
  });

  if (referenceFile) {
    const buffer = decodedBuffers.get(referenceFile.name);
    if (buffer) {
      tracks.push({
        trackId: `reference-${referenceFile.name}`,
        fileName: referenceFile.name,
        role: 'reference',
        kind: guessTrackKind(referenceFile.name, 'reference'),
        buffer,
      });
    }
  }

  return tracks;
}

function inferRoleFromName(name: string, index: number): string {
  const lower = name.toLowerCase();
  if (/(^|[\s._-])(lead|main|verse|hook)([\s._-]|$)/.test(lower)) return 'lead';
  if (/(^|[\s._-])(intro|opening)([\s._-]|$)/.test(lower)) return 'intro';
  if (/(^|[\s._-])(outro|ending)([\s._-]|$)/.test(lower)) return 'outro';
  if (/(^|[\s._-])(double|dbl|dbls)([\s._-]|$)/.test(lower)) return 'double';
  if (/(^|[\s._-])(adlib|ad-lib|adlibs|ad-libs)([\s._-]|$)/.test(lower)) return 'adlib';
  if (/(^|[\s._-])(harmony|harm)([\s._-]|$)/.test(lower)) return 'harmony';
  if (/(^|[\s._-])(throw|fx|effect)([\s._-]|$)/.test(lower)) return 'throw';
  if (index === 0) return 'lead';
  return 'support';
}
