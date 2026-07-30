import type { ReplayMidiNote, ReplayState } from './deterministicReplayService';
import { deterministicId } from './deterministicJson';

export type SessionPlayerRole = 'drums' | 'bass' | 'keys' | 'pad';
export type SessionPlayerFeel = 'straight' | 'laid-back' | 'pushed' | 'half-time';

export interface SessionPlayerSection {
  sectionId: string;
  label: string;
  startBar: number;
  bars: number;
  energy: number;
  chord?: string;
}

export interface SessionPlayerProfile {
  role: SessionPlayerRole;
  enabled: boolean;
  feel: SessionPlayerFeel;
  complexity: number;
  octave?: number;
  velocity?: number;
}

export interface SessionPlayerArrangementInput {
  sessionId: string;
  bpm: number;
  key: string;
  sections: SessionPlayerSection[];
  players: SessionPlayerProfile[];
  beatsPerBar?: number;
}

export interface SessionPlayerArrangementPlan {
  planId: string;
  sessionId: string;
  bpm: number;
  key: string;
  beatsPerBar: number;
  generatedAt: number;
  tracks: Array<{
    trackId: string;
    role: SessionPlayerRole;
    name: string;
    noteCount: number;
  }>;
  midiNotes: ReplayMidiNote[];
  markers: ReplayState['markers'];
}

const ROOT_TO_MIDI: Record<string, number> = {
  C: 60,
  'C#': 61,
  Db: 61,
  D: 62,
  'D#': 63,
  Eb: 63,
  E: 64,
  F: 65,
  'F#': 66,
  Gb: 66,
  G: 67,
  'G#': 68,
  Ab: 68,
  A: 69,
  'A#': 70,
  Bb: 70,
  B: 71,
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function beatSec(bpm: number): number {
  return 60 / clamp(bpm, 40, 240);
}

function rootFromChord(chord: string | undefined, fallbackKey: string): string {
  const source = chord || fallbackKey || 'C';
  const match = source.match(/^[A-G](#|b)?/);
  return match?.[0] || 'C';
}

function chordTones(rootMidi: number, chord: string | undefined): number[] {
  const lower = (chord || '').toLowerCase();
  if (lower.includes('dim')) return [rootMidi, rootMidi + 3, rootMidi + 6];
  if (lower.includes('aug') || lower.includes('+')) return [rootMidi, rootMidi + 4, rootMidi + 8];
  if (lower.includes('m') && !lower.includes('maj')) return [rootMidi, rootMidi + 3, rootMidi + 7];
  return [rootMidi, rootMidi + 4, rootMidi + 7];
}

function sectionStartSec(section: SessionPlayerSection, beatsPerBar: number, secPerBeat: number): number {
  return section.startBar * beatsPerBar * secPerBeat;
}

function note(
  trackId: string,
  role: SessionPlayerRole,
  pitch: number,
  startTimeSec: number,
  durationSec: number,
  velocity: number
): ReplayMidiNote {
  return {
    noteId: deterministicId('player-note', {
      trackId,
      role,
      pitch,
      startTimeSec: Number(startTimeSec.toFixed(4)),
      durationSec: Number(durationSec.toFixed(4)),
      velocity,
    }),
    trackId,
    startTimeSec: Number(startTimeSec.toFixed(4)),
    durationSec: Number(durationSec.toFixed(4)),
    pitch: clamp(Math.round(pitch), 0, 127),
    velocity: clamp(Math.round(velocity), 1, 127),
    channel: 1,
  };
}

function generateRoleNotes(
  profile: SessionPlayerProfile,
  sections: SessionPlayerSection[],
  key: string,
  bpm: number,
  beatsPerBar: number
): ReplayMidiNote[] {
  const secPerBeat = beatSec(bpm);
  const trackId = `session-player-${profile.role}`;
  const notes: ReplayMidiNote[] = [];
  const complexity = clamp(profile.complexity, 0, 1);
  const baseVelocity = profile.velocity ?? 82;
  const feelOffset =
    profile.feel === 'laid-back' ? secPerBeat * 0.035 : profile.feel === 'pushed' ? -secPerBeat * 0.025 : 0;

  for (const section of sections) {
    const root = rootFromChord(section.chord, key);
    const rootMidi = (ROOT_TO_MIDI[root] ?? 60) + ((profile.octave ?? 0) * 12);
    const tones = chordTones(rootMidi, section.chord);
    const start = sectionStartSec(section, beatsPerBar, secPerBeat);
    const bars = Math.max(1, section.bars);
    const energy = clamp(section.energy, 0, 1);

    for (let bar = 0; bar < bars; bar++) {
      const barStart = start + bar * beatsPerBar * secPerBeat;
      if (profile.role === 'drums') {
        const kick = rootMidi - 24;
        const snare = rootMidi - 12;
        const hat = rootMidi + 18;
        notes.push(note(trackId, profile.role, kick, barStart + feelOffset, secPerBeat * 0.45, baseVelocity + energy * 18));
        notes.push(note(trackId, profile.role, snare, barStart + secPerBeat * 2 + feelOffset, secPerBeat * 0.45, baseVelocity + 8));
        const hatSteps = complexity > 0.65 ? 8 : 4;
        for (let step = 0; step < hatSteps; step++) {
          notes.push(note(trackId, profile.role, hat, barStart + step * (beatsPerBar / hatSteps) * secPerBeat, secPerBeat * 0.18, baseVelocity - 24 + energy * 14));
        }
      }
      if (profile.role === 'bass') {
        notes.push(note(trackId, profile.role, rootMidi - 24, barStart + feelOffset, secPerBeat * 1.7, baseVelocity + energy * 16));
        if (complexity > 0.45) {
          notes.push(note(trackId, profile.role, tones[2] - 24, barStart + secPerBeat * 2.5 + feelOffset, secPerBeat * 0.8, baseVelocity - 6));
        }
      }
      if (profile.role === 'keys' || profile.role === 'pad') {
        const duration = profile.role === 'pad' ? beatsPerBar * secPerBeat * 0.92 : secPerBeat * (complexity > 0.5 ? 1.65 : 3.4);
        const repeats = profile.role === 'pad' ? 1 : complexity > 0.5 ? 2 : 1;
        for (let repeat = 0; repeat < repeats; repeat++) {
          const chordStart = barStart + repeat * 2 * secPerBeat + feelOffset;
          for (const tone of tones) {
            notes.push(note(trackId, profile.role, tone, chordStart, duration, baseVelocity - (profile.role === 'pad' ? 20 : 8) + energy * 10));
          }
        }
      }
    }
  }
  return notes;
}

export function buildSessionPlayerArrangement(input: SessionPlayerArrangementInput): SessionPlayerArrangementPlan {
  const beatsPerBar = input.beatsPerBar || 4;
  const activePlayers = input.players.filter((player) => player.enabled);
  const midiNotes = activePlayers.flatMap((profile) =>
    generateRoleNotes(profile, input.sections, input.key, input.bpm, beatsPerBar)
  );
  const tracks = activePlayers.map((profile) => {
    const trackId = `session-player-${profile.role}`;
    return {
      trackId,
      role: profile.role,
      name: `Session Player ${profile.role}`,
      noteCount: midiNotes.filter((entry) => entry.trackId === trackId).length,
    };
  });

  return {
    planId: deterministicId('session-player-plan', input),
    sessionId: input.sessionId,
    bpm: input.bpm,
    key: input.key,
    beatsPerBar,
    generatedAt: Date.now(),
    tracks,
    midiNotes,
    markers: input.sections.map((section) => ({
      id: deterministicId('player-section-marker', section),
      timeSec: sectionStartSec(section, beatsPerBar, beatSec(input.bpm)),
      label: section.label,
      color: section.energy > 0.72 ? '#f97316' : '#22d3ee',
      note: section.chord ? `Chord: ${section.chord}` : undefined,
    })),
  };
}

export function applySessionPlayerArrangementToTimeline(
  timelineState: ReplayState,
  plan: SessionPlayerArrangementPlan
): ReplayState {
  const existingTrackIds = new Set(timelineState.tracks.map((track) => track.trackId));
  const playerTracks = plan.tracks
    .filter((track) => !existingTrackIds.has(track.trackId))
    .map((track) => ({
      trackId: track.trackId,
      trackName: track.name,
      kind: 'midi' as const,
      groupId: 'session-players',
      gainDb: 0,
      pan: 0,
      muted: false,
      solo: false,
      limiterThresholdDb: null,
      normalizedTargetLUFS: null,
      dcRemovalHz: null,
      inserts: [],
      appliedProposalIds: [],
      trackStateHash: '',
    }));

  return {
    ...timelineState,
    tracks: [...timelineState.tracks, ...playerTracks],
    midiNotes: [...(timelineState.midiNotes || []), ...plan.midiNotes],
    markers: [...(timelineState.markers || []), ...(plan.markers || [])],
    metadata: {
      ...(timelineState.metadata || {}),
      sessionPlayerPlanId: plan.planId,
      sessionPlayerGeneratedAt: plan.generatedAt,
    },
  };
}

export function serializeSessionPlayerArrangementPlan(plan: SessionPlayerArrangementPlan): string {
  return JSON.stringify(plan, null, 2);
}
