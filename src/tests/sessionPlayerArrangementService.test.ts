import { describe, expect, test } from 'vitest';
import type { ReplayState } from '../services/deterministicReplayService';
import {
  applySessionPlayerArrangementToTimeline,
  buildSessionPlayerArrangement,
} from '../services/sessionPlayerArrangementService';

function makeTimeline(): ReplayState {
  return {
    sessionId: 'session-player',
    workspaceId: 'workspace-player',
    tracks: [],
    regions: [],
    midiNotes: [],
    automation: [],
    markers: [],
    metadata: {},
  };
}

describe('sessionPlayerArrangementService', () => {
  test('generates deterministic player tracks, MIDI notes, and section markers', () => {
    const plan = buildSessionPlayerArrangement({
      sessionId: 'session-player',
      bpm: 96,
      key: 'C',
      sections: [
        { sectionId: 'verse', label: 'Verse', startBar: 0, bars: 4, energy: 0.45, chord: 'Am' },
        { sectionId: 'hook', label: 'Hook', startBar: 4, bars: 4, energy: 0.9, chord: 'Fmaj7' },
      ],
      players: [
        { role: 'drums', enabled: true, feel: 'laid-back', complexity: 0.7 },
        { role: 'bass', enabled: true, feel: 'straight', complexity: 0.55, octave: -1 },
        { role: 'keys', enabled: true, feel: 'pushed', complexity: 0.6 },
        { role: 'pad', enabled: false, feel: 'straight', complexity: 0.2 },
      ],
    });

    expect(plan.tracks.map((track) => track.role)).toEqual(['drums', 'bass', 'keys']);
    expect(plan.midiNotes.length).toBeGreaterThan(30);
    expect(plan.markers).toHaveLength(2);

    const applied = applySessionPlayerArrangementToTimeline(makeTimeline(), plan);
    expect(applied.tracks).toHaveLength(3);
    expect(applied.midiNotes?.length).toBe(plan.midiNotes.length);
    expect(applied.metadata?.sessionPlayerPlanId).toBe(plan.planId);
  });
});
