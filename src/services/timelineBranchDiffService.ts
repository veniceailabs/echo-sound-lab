import type { ReplayAutomationLane, ReplayMarker, ReplayRegionState, ReplayState, ReplayTrackState } from './deterministicReplayService';

export interface TimelineHeatmapBin {
  index: number;
  startSec: number;
  endSec: number;
  score: number;
  intensity: number;
  currentHits: number;
  compareHits: number;
  labels: string[];
}

export interface TimelineBranchDiffSummary {
  durationSec: number;
  binSizeSec: number;
  bins: TimelineHeatmapBin[];
  maxScore: number;
  totalScore: number;
  changedTracks: number;
  changedRegions: number;
  changedMarkers: number;
  changedAutomationLanes: number;
  changedMidiNotes: number;
  addedTracks: number;
  removedTracks: number;
  addedRegions: number;
  removedRegions: number;
  addedMarkers: number;
  removedMarkers: number;
  addedAutomationLanes: number;
  removedAutomationLanes: number;
  addedMidiNotes: number;
  removedMidiNotes: number;
}

function regionEnd(region: ReplayRegionState): number {
  return Math.max(0, region.startTimeSec + region.durationSec);
}

function laneEnd(lane: ReplayAutomationLane): number {
  return lane.points.reduce((max, point) => Math.max(max, point.timeSec), 0);
}

function midiNoteEnd(note: { startTimeSec: number; durationSec: number }): number {
  return Math.max(0, note.startTimeSec + note.durationSec);
}

function markerTime(marker: ReplayMarker): number {
  return Math.max(0, marker.timeSec);
}

function getTimelineDuration(activeState: ReplayState, compareState: ReplayState | null): number {
  const activeRegionEnd = activeState.regions.reduce((max, region) => Math.max(max, regionEnd(region)), 0);
  const compareRegionEnd = compareState?.regions.reduce((max, region) => Math.max(max, regionEnd(region)), 0) || 0;
  const activeMarkerEnd = (activeState.markers || []).reduce((max, marker) => Math.max(max, markerTime(marker)), 0);
  const compareMarkerEnd = (compareState?.markers || []).reduce((max, marker) => Math.max(max, markerTime(marker)), 0) || 0;
  const activeAutomationEnd = activeState.automation.reduce((max, lane) => Math.max(max, laneEnd(lane)), 0);
  const compareAutomationEnd = compareState?.automation.reduce((max, lane) => Math.max(max, laneEnd(lane)), 0) || 0;
  const activeMidiEnd = (activeState.midiNotes || []).reduce((max, note) => Math.max(max, midiNoteEnd(note)), 0);
  const compareMidiEnd = (compareState?.midiNotes || []).reduce((max, note) => Math.max(max, midiNoteEnd(note)), 0) || 0;
  return Math.max(
    16,
    activeRegionEnd,
    compareRegionEnd,
    activeMarkerEnd,
    compareMarkerEnd,
    activeAutomationEnd,
    compareAutomationEnd,
    activeMidiEnd,
    compareMidiEnd
  );
}

function overlapScore(startA: number, endA: number, startB: number, endB: number): number {
  const overlap = Math.max(0, Math.min(endA, endB) - Math.max(startA, startB));
  if (overlap <= 0) return 0;
  const span = Math.max(0.000001, endA - startA);
  return overlap / span;
}

function buildRegionIndex(state: ReplayState): Map<string, ReplayRegionState> {
  return new Map(state.regions.map((region) => [region.regionId, region]));
}

function buildMarkerIndex(state: ReplayState): Map<string, ReplayMarker> {
  return new Map((state.markers || []).map((marker) => [marker.id, marker]));
}

function buildAutomationIndex(state: ReplayState): Map<string, ReplayAutomationLane> {
  return new Map(state.automation.map((lane) => [lane.laneId, lane]));
}

function buildMidiNoteIndex(state: ReplayState): Map<string, { noteId: string; trackId: string; startTimeSec: number; durationSec: number; pitch: number; velocity: number; channel?: number | null }> {
  return new Map((state.midiNotes || []).map((note) => [note.noteId, note]));
}

function buildTrackIndex(state: ReplayState): Map<string, ReplayTrackState> {
  return new Map(state.tracks.map((track) => [track.trackId, track]));
}

export function buildTimelineBranchDiffSummary(
  activeState: ReplayState,
  compareState: ReplayState | null,
  binCount = 48
): TimelineBranchDiffSummary {
  const durationSec = getTimelineDuration(activeState, compareState);
  const normalizedBinCount = Math.max(16, Math.floor(binCount));
  const binSizeSec = durationSec / normalizedBinCount;
  const bins: TimelineHeatmapBin[] = Array.from({ length: normalizedBinCount }, (_, index) => ({
    index,
    startSec: index * binSizeSec,
    endSec: (index + 1) * binSizeSec,
    score: 0,
    intensity: 0,
    currentHits: 0,
    compareHits: 0,
    labels: [],
  }));

  if (!compareState) {
    return {
      durationSec,
      binSizeSec,
      bins,
      maxScore: 0,
      totalScore: 0,
      changedTracks: 0,
      changedRegions: 0,
      changedMarkers: 0,
      changedAutomationLanes: 0,
      changedMidiNotes: 0,
      addedTracks: 0,
      removedTracks: 0,
      addedRegions: 0,
      removedRegions: 0,
      addedMarkers: 0,
      removedMarkers: 0,
      addedAutomationLanes: 0,
      removedAutomationLanes: 0,
      addedMidiNotes: 0,
      removedMidiNotes: 0,
    };
  }

  const compareRegionsById = buildRegionIndex(compareState);
  const activeRegionsById = buildRegionIndex(activeState);
  const compareMarkersById = buildMarkerIndex(compareState);
  const activeMarkersById = buildMarkerIndex(activeState);
  const compareAutomationById = buildAutomationIndex(compareState);
  const activeAutomationById = buildAutomationIndex(activeState);
  const compareMidiNotesById = buildMidiNoteIndex(compareState);
  const activeMidiNotesById = buildMidiNoteIndex(activeState);
  const compareTracksById = buildTrackIndex(compareState);
  const activeTracksById = buildTrackIndex(activeState);

  let changedTracks = 0;
  let changedRegions = 0;
  let changedMarkers = 0;
  let changedAutomationLanes = 0;
  let changedMidiNotes = 0;
  let addedTracks = 0;
  let removedTracks = 0;
  let addedRegions = 0;
  let removedRegions = 0;
  let addedMarkers = 0;
  let removedMarkers = 0;
  let addedAutomationLanes = 0;
  let removedAutomationLanes = 0;
  let addedMidiNotes = 0;
  let removedMidiNotes = 0;

  for (const track of activeState.tracks) {
    const compareTrack = compareTracksById.get(track.trackId);
    const delta = compareTrack
      ? compareTrack.trackStateHash !== track.trackStateHash ||
        compareTrack.trackName !== track.trackName ||
        compareTrack.kind !== track.kind ||
        compareTrack.groupId !== track.groupId ||
        compareTrack.outputBusId !== track.outputBusId ||
        compareTrack.gainDb !== track.gainDb ||
        compareTrack.pan !== track.pan ||
        compareTrack.muted !== track.muted ||
        compareTrack.solo !== track.solo ||
        compareTrack.limiterThresholdDb !== track.limiterThresholdDb ||
        compareTrack.normalizedTargetLUFS !== track.normalizedTargetLUFS ||
        compareTrack.dcRemovalHz !== track.dcRemovalHz ||
        JSON.stringify(compareTrack.sends || []) !== JSON.stringify(track.sends || [])
      : true;
    if (!compareTrack) {
      addedTracks += 1;
    } else if (delta) {
      changedTracks += 1;
    }
  }

  for (const note of activeState.midiNotes || []) {
    const compareNote = compareMidiNotesById.get(note.noteId);
    const isChanged = compareNote
      ? compareNote.trackId !== note.trackId ||
        compareNote.startTimeSec !== note.startTimeSec ||
        compareNote.durationSec !== note.durationSec ||
        compareNote.pitch !== note.pitch ||
        compareNote.velocity !== note.velocity ||
        compareNote.channel !== note.channel
      : true;
    if (!compareNote) {
      addedMidiNotes += 1;
    } else if (isChanged) {
      changedMidiNotes += 1;
    }
  }

  for (const note of compareState.midiNotes || []) {
    if (!activeMidiNotesById.has(note.noteId)) {
      removedMidiNotes += 1;
    }
  }

  for (const track of compareState.tracks) {
    if (!activeTracksById.has(track.trackId)) {
      removedTracks += 1;
    }
  }

  for (const region of activeState.regions) {
    const compareRegion = compareRegionsById.get(region.regionId);
    const start = region.startTimeSec;
    const end = regionEnd(region);
    const delta = compareRegion
      ? compareRegion.trackId !== region.trackId ||
        compareRegion.startTimeSec !== region.startTimeSec ||
        compareRegion.durationSec !== region.durationSec ||
        compareRegion.offsetSec !== region.offsetSec ||
        compareRegion.gainDb !== region.gainDb ||
        compareRegion.compLaneId !== region.compLaneId ||
        compareRegion.compTakeIndex !== region.compTakeIndex ||
        compareRegion.fadeInSec !== region.fadeInSec ||
        compareRegion.fadeOutSec !== region.fadeOutSec
      : true;
    if (!compareRegion) {
      addedRegions += 1;
    } else if (delta) {
      changedRegions += 1;
    }
    for (const bin of bins) {
      const share = overlapScore(start, end, bin.startSec, bin.endSec);
      if (!share) continue;
      bin.currentHits += 1;
      if (!compareRegion) {
        bin.score += 2 * share;
        bin.labels.push(`Added region ${region.regionId}`);
      } else if (delta) {
        bin.score += 1.4 * share;
        bin.labels.push(`Changed region ${region.regionId}`);
      } else {
        bin.score += 0.35 * share;
      }
    }
  }

  for (const region of compareState.regions) {
    const activeRegion = activeRegionsById.get(region.regionId);
    if (!activeRegion) {
      removedRegions += 1;
      const start = region.startTimeSec;
      const end = regionEnd(region);
      for (const bin of bins) {
        const share = overlapScore(start, end, bin.startSec, bin.endSec);
        if (!share) continue;
        bin.compareHits += 1;
        bin.score += 2 * share;
        bin.labels.push(`Removed region ${region.regionId}`);
      }
    }
  }

  for (const marker of activeState.markers || []) {
    const compareMarker = compareMarkersById.get(marker.id);
    const isChanged = compareMarker
      ? compareMarker.timeSec !== marker.timeSec ||
        compareMarker.label !== marker.label ||
        compareMarker.color !== marker.color ||
        (compareMarker.note || '') !== (marker.note || '')
      : true;
    if (!compareMarker) {
      addedMarkers += 1;
    } else if (isChanged) {
      changedMarkers += 1;
    }
    for (const bin of bins) {
      const isHit = marker.timeSec >= bin.startSec && marker.timeSec < bin.endSec;
      if (!isHit) continue;
      bin.currentHits += 1;
      if (!compareMarker) {
        bin.score += 1.6;
        bin.labels.push(`Added marker ${marker.label}`);
      } else if (isChanged) {
        bin.score += 1.05;
        bin.labels.push(`Changed marker ${marker.label}`);
      }
    }
  }

  for (const marker of compareState.markers || []) {
    const activeMarker = activeMarkersById.get(marker.id);
    if (!activeMarker) {
      removedMarkers += 1;
      for (const bin of bins) {
        const isHit = marker.timeSec >= bin.startSec && marker.timeSec < bin.endSec;
        if (!isHit) continue;
        bin.compareHits += 1;
        bin.score += 1.6;
        bin.labels.push(`Removed marker ${marker.label}`);
      }
    }
  }

  for (const lane of activeState.automation) {
    const compareLane = compareAutomationById.get(lane.laneId);
    const laneChanged = compareLane
      ? compareLane.trackId !== lane.trackId || compareLane.parameter !== lane.parameter || compareLane.points.length !== lane.points.length
      : true;
    if (!compareLane) {
      addedAutomationLanes += 1;
    } else if (laneChanged) {
      changedAutomationLanes += 1;
    }
    const laneStart = lane.points[0]?.timeSec ?? 0;
    const laneEndSec = lane.points[lane.points.length - 1]?.timeSec ?? laneStart;
    for (const bin of bins) {
      const share = overlapScore(laneStart, Math.max(laneEndSec, laneStart + 0.001), bin.startSec, bin.endSec);
      if (!share) continue;
      bin.currentHits += 1;
      if (!compareLane) {
        bin.score += 0.7 * share;
        bin.labels.push(`Added automation ${lane.parameter}`);
      } else if (laneChanged) {
        bin.score += 0.45 * share;
        bin.labels.push(`Changed automation ${lane.parameter}`);
      } else {
        bin.score += 0.12 * share;
      }
    }
  }

  for (const lane of compareState.automation) {
    const activeLane = activeAutomationById.get(lane.laneId);
    if (!activeLane) {
      removedAutomationLanes += 1;
      const laneStart = lane.points[0]?.timeSec ?? 0;
      const laneEndSec = lane.points[lane.points.length - 1]?.timeSec ?? laneStart;
      for (const bin of bins) {
        const share = overlapScore(laneStart, Math.max(laneEndSec, laneStart + 0.001), bin.startSec, bin.endSec);
        if (!share) continue;
        bin.compareHits += 1;
        bin.score += 0.7 * share;
        bin.labels.push(`Removed automation ${lane.parameter}`);
      }
    }
  }

  const maxScore = bins.reduce((max, bin) => Math.max(max, bin.score), 0);
  let totalScore = 0;
  for (const bin of bins) {
    totalScore += bin.score;
    bin.intensity = maxScore > 0 ? Math.min(1, bin.score / maxScore) : 0;
  }

  return {
    durationSec,
    binSizeSec,
    bins,
    maxScore,
    totalScore,
    changedTracks,
    changedRegions,
    changedMarkers,
    changedAutomationLanes,
    changedMidiNotes,
    addedTracks,
    removedTracks,
    addedRegions,
    removedRegions,
    addedMarkers,
    removedMarkers,
    addedAutomationLanes,
    removedAutomationLanes,
    addedMidiNotes,
    removedMidiNotes,
  };
}
