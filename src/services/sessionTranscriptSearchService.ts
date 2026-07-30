import type { ReplayMarker, ReplayRegionState, ReplayState } from './deterministicReplayService';
import { deterministicId } from './deterministicJson';

export interface TranscriptWord {
  word: string;
  startSec: number;
  endSec: number;
  confidence?: number;
  speakerId?: string;
}

export interface TranscriptSegment {
  segmentId: string;
  startSec: number;
  endSec: number;
  text: string;
  speakerId?: string;
  words?: TranscriptWord[];
}

export interface SessionTranscriptIndexEntry {
  entryId: string;
  kind: 'transcript' | 'marker' | 'region';
  text: string;
  normalizedText: string;
  startSec: number;
  endSec: number;
  sourceId: string;
  speakerId?: string;
  confidence: number;
}

export interface SessionTranscriptSearchHit {
  entry: SessionTranscriptIndexEntry;
  score: number;
  matchedTerms: string[];
  jumpToSec: number;
  context: string;
}

export interface SessionTranscriptSearchIndex {
  generatedAt: number;
  sessionId: string;
  workspaceId: string;
  entries: SessionTranscriptIndexEntry[];
  speakers: string[];
  durationSec: number;
}

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9#@:.+\-\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(text: string): string[] {
  return normalizeText(text)
    .split(' ')
    .map((term) => term.trim())
    .filter((term) => term.length > 1);
}

function markerToEntry(marker: ReplayMarker): SessionTranscriptIndexEntry {
  const text = [marker.label, marker.note].filter(Boolean).join(' ');
  return {
    entryId: deterministicId('marker-entry', marker),
    kind: 'marker',
    text,
    normalizedText: normalizeText(text),
    startSec: marker.timeSec,
    endSec: marker.timeSec,
    sourceId: marker.id,
    confidence: 1,
  };
}

function regionToEntry(region: ReplayRegionState): SessionTranscriptIndexEntry {
  const text = `${region.regionId} ${region.sourceId}`;
  return {
    entryId: deterministicId('region-entry', region),
    kind: 'region',
    text,
    normalizedText: normalizeText(text),
    startSec: region.startTimeSec,
    endSec: region.startTimeSec + region.durationSec,
    sourceId: region.regionId,
    confidence: 0.65,
  };
}

function transcriptToEntry(segment: TranscriptSegment): SessionTranscriptIndexEntry {
  const wordConfidence = segment.words?.length
    ? segment.words.reduce((sum, word) => sum + (word.confidence ?? 1), 0) / segment.words.length
    : 1;
  return {
    entryId: deterministicId('transcript-entry', segment),
    kind: 'transcript',
    text: segment.text,
    normalizedText: normalizeText(segment.text),
    startSec: segment.startSec,
    endSec: segment.endSec,
    sourceId: segment.segmentId,
    speakerId: segment.speakerId,
    confidence: Number(wordConfidence.toFixed(4)),
  };
}

export function buildSessionTranscriptSearchIndex(
  timelineState: ReplayState,
  transcriptSegments: TranscriptSegment[] = []
): SessionTranscriptSearchIndex {
  const transcriptEntries = transcriptSegments.map(transcriptToEntry);
  const markerEntries = (timelineState.markers || [])
    .filter((marker) => marker.label || marker.note)
    .map(markerToEntry);
  const regionEntries = timelineState.regions.map(regionToEntry);
  const entries = [...transcriptEntries, ...markerEntries, ...regionEntries].sort((left, right) => {
    if (left.startSec !== right.startSec) return left.startSec - right.startSec;
    return left.entryId.localeCompare(right.entryId);
  });
  const speakers = Array.from(new Set(entries.map((entry) => entry.speakerId).filter(Boolean) as string[])).sort();
  const durationSec = entries.reduce((max, entry) => Math.max(max, entry.endSec), 0);

  return {
    generatedAt: Date.now(),
    sessionId: timelineState.sessionId,
    workspaceId: timelineState.workspaceId,
    entries,
    speakers,
    durationSec,
  };
}

export function searchSessionTranscriptIndex(
  index: SessionTranscriptSearchIndex,
  query: string,
  options: { speakerId?: string; limit?: number; includeRegions?: boolean } = {}
): SessionTranscriptSearchHit[] {
  const terms = tokenize(query);
  if (terms.length === 0) return [];

  return index.entries
    .filter((entry) => options.includeRegions !== false || entry.kind !== 'region')
    .filter((entry) => !options.speakerId || entry.speakerId === options.speakerId)
    .map((entry) => {
      const matchedTerms = terms.filter((term) => entry.normalizedText.includes(term));
      const exactPhrase = entry.normalizedText.includes(normalizeText(query));
      const termScore = matchedTerms.length / terms.length;
      const kindBoost = entry.kind === 'transcript' ? 0.18 : entry.kind === 'marker' ? 0.08 : 0;
      const coverageBoost = matchedTerms.length > 1 ? 0.08 : 0;
      const score = exactPhrase || (entry.kind === 'transcript' && matchedTerms.length === terms.length)
        ? 1
        : Math.min(0.98, termScore + kindBoost + coverageBoost);
      return {
        entry,
        score: Number((entry.kind === 'transcript' ? score : score * entry.confidence).toFixed(4)),
        matchedTerms,
        jumpToSec: entry.startSec,
        context: entry.text.length > 160 ? `${entry.text.slice(0, 157)}...` : entry.text,
      };
    })
    .filter((hit) => hit.matchedTerms.length > 0)
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      return left.jumpToSec - right.jumpToSec;
    })
    .slice(0, options.limit ?? 12);
}

export function buildWordSpotMarkers(
  transcriptSegments: TranscriptSegment[],
  query: string,
  color = '#22d3ee'
): ReplayMarker[] {
  const terms = new Set(tokenize(query));
  const markers: ReplayMarker[] = [];
  for (const segment of transcriptSegments) {
    const wordMatches = (segment.words || []).filter((word) => terms.has(normalizeText(word.word)));
    if (wordMatches.length === 0 && !terms.has(normalizeText(segment.text))) continue;
    const firstWord = wordMatches[0];
    const timeSec = firstWord?.startSec ?? segment.startSec;
    markers.push({
      id: deterministicId('word-spot', { segmentId: segment.segmentId, query, timeSec }),
      timeSec,
      label: `Word spot: ${query}`,
      color,
      note: segment.text,
    });
  }
  return markers;
}

export function serializeSessionTranscriptSearchIndex(index: SessionTranscriptSearchIndex): string {
  return JSON.stringify(index, null, 2);
}
