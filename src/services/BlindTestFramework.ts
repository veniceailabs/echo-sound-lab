/**
 * BlindTestFramework — Phase 2E
 * Double-blind audio comparison sessions stored in localStorage
 */

const STORAGE_KEY = 'echo.blindTests.v1';

export interface BlindTestSession {
  id: string;
  createdAt: number;
  labelA: string;
  labelB: string;
  /** Which session slot (1 or 2) maps to A/B — hidden until reveal */
  _mapping: { slot1: 'A' | 'B'; slot2: 'A' | 'B' };
  votes: Array<{ voter: string; choice: 1 | 2; timestamp: number }>;
  resolved: boolean;
}

export interface BlindTestResult {
  sessionId: string;
  votes1: number;
  votes2: number;
  totalVotes: number;
  winner: 'A' | 'B' | 'tie';
  winnerLabel: string;
  slot1Label: string;
  slot2Label: string;
  mapping: { slot1: 'A' | 'B'; slot2: 'A' | 'B' };
}

function loadSessions(): Record<string, BlindTestSession> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // ignore
  }
  return {};
}

function saveSessions(sessions: Record<string, BlindTestSession>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
  } catch {
    // ignore
  }
}

/**
 * Create a new blind test session.
 * The mapping between slot 1/2 and A/B is randomly assigned and hidden.
 */
export function createBlindSession(
  _bufferA: AudioBuffer | null,
  labelA: string,
  _bufferB: AudioBuffer | null,
  labelB: string
): BlindTestSession {
  const id = `blind-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const flip = Math.random() < 0.5;

  const session: BlindTestSession = {
    id,
    createdAt: Date.now(),
    labelA,
    labelB,
    _mapping: flip
      ? { slot1: 'B', slot2: 'A' }
      : { slot1: 'A', slot2: 'B' },
    votes: [],
    resolved: false,
  };

  const sessions = loadSessions();
  sessions[id] = session;
  saveSessions(sessions);

  return session;
}

/**
 * Record a vote for slot 1 or slot 2.
 */
export function recordVote(
  sessionId: string,
  choice: 1 | 2,
  voter: string = 'anonymous'
): void {
  const sessions = loadSessions();
  const session = sessions[sessionId];
  if (!session) return;

  session.votes.push({ voter, choice, timestamp: Date.now() });
  saveSessions(sessions);
}

/**
 * Resolve a session — reveals the A/B mapping and tallies votes.
 */
export function resolveResults(sessionId: string): BlindTestResult | null {
  const sessions = loadSessions();
  const session = sessions[sessionId];
  if (!session) return null;

  // Mark resolved
  session.resolved = true;
  saveSessions(sessions);

  const votes1 = session.votes.filter(v => v.choice === 1).length;
  const votes2 = session.votes.filter(v => v.choice === 2).length;
  const total = session.votes.length;

  let winner: 'A' | 'B' | 'tie';
  if (votes1 > votes2) {
    winner = session._mapping.slot1; // winner is whatever slot1 maps to
  } else if (votes2 > votes1) {
    winner = session._mapping.slot2;
  } else {
    winner = 'tie';
  }

  const winnerLabel = winner === 'tie'
    ? 'Tie'
    : winner === 'A' ? session.labelA : session.labelB;

  return {
    sessionId,
    votes1,
    votes2,
    totalVotes: total,
    winner,
    winnerLabel,
    slot1Label: session._mapping.slot1 === 'A' ? session.labelA : session.labelB,
    slot2Label: session._mapping.slot2 === 'A' ? session.labelA : session.labelB,
    mapping: session._mapping,
  };
}

/**
 * Get all sessions (for history/listing)
 */
export function getAllSessions(): BlindTestSession[] {
  const sessions = loadSessions();
  return Object.values(sessions).sort((a, b) => b.createdAt - a.createdAt);
}

/**
 * Get a single session by ID
 */
export function getSession(sessionId: string): BlindTestSession | null {
  const sessions = loadSessions();
  return sessions[sessionId] ?? null;
}

/**
 * Delete a session
 */
export function deleteSession(sessionId: string): void {
  const sessions = loadSessions();
  delete sessions[sessionId];
  saveSessions(sessions);
}
