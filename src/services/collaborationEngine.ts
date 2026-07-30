/**
 * Collaboration Engine
 * Manages artist ↔ engineer mastering workflow with revisions
 */

export type CollaborationRole = 'artist' | 'engineer' | string;
export type RevisionStatus = 'pending' | 'in-progress' | 'approved' | 'rejected';

export interface CollaborationSession {
  sessionId: string;
  trackName: string;
  artistName: string;
  createdAt: string;
  artistFeedback: string; // "warm", "bright", "aggressive", etc.
  variants: Record<string, { lufs: number; character: string; votes: number }>;
  revisionHistory: RevisionEntry[];
  status: RevisionStatus;
  shareUrl: string;
  approved: boolean;
  approvedVariant?: 'variant1' | 'variant2' | 'variant3';
  approvedAt?: string;
}

export interface RevisionEntry {
  timestamp: string;
  role: CollaborationRole;
  action: string; // "created variant", "requested revision", "approved"
  feedback?: string;
  variant?: string;
}

/**
 * Create a new collaboration session
 */
export const createCollaborationSession = (
  trackName: string,
  artistName: string,
  artistFeedback: string
): CollaborationSession => {
  const sessionId = `collab-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  return {
    sessionId,
    trackName,
    artistName,
    createdAt: new Date().toISOString(),
    artistFeedback,
    variants: {
      variant1: { lufs: -14, character: 'Streaming', votes: 0 },
      variant2: { lufs: -13, character: 'Radio', votes: 0 },
      variant3: { lufs: -7, character: 'Dynamic', votes: 0 },
    },
    revisionHistory: [
      {
        timestamp: new Date().toISOString(),
        role: 'artist',
        action: 'created session',
        feedback: artistFeedback,
      },
    ],
    status: 'pending',
    shareUrl: `${window.location.origin}/collab/${sessionId}`,
    approved: false,
  };
};

/**
 * Vote for a variant (artist preference)
 */
export const voteForVariant = (
  session: CollaborationSession,
  variantKey: 'variant1' | 'variant2' | 'variant3'
): CollaborationSession => {
  const updated = {
    ...session,
    variants: {
      ...session.variants,
      [variantKey]: {
        ...session.variants[variantKey],
        votes: session.variants[variantKey].votes + 1,
      },
    },
    revisionHistory: [
      ...session.revisionHistory,
      {
        timestamp: new Date().toISOString(),
        role: 'artist',
        action: `voted for ${variantKey}`,
      },
    ],
  };

  return updated;
};

/**
 * Engineer submits revised variants
 */
export const submitRevision = (
  session: CollaborationSession,
  newVariants: Record<
    string,
    { lufs: number; character: string; votes: number }
  >,
  engineerFeedback: string
): CollaborationSession => {
  return {
    ...session,
    variants: newVariants,
    status: 'in-progress',
    revisionHistory: [
      ...session.revisionHistory,
      {
        timestamp: new Date().toISOString(),
        role: 'engineer',
        action: 'submitted revised variants',
        feedback: engineerFeedback,
      },
    ],
  };
};

/**
 * Artist approves final master
 */
export const approveVariant = (
  session: CollaborationSession,
  variantKey: 'variant1' | 'variant2' | 'variant3'
): CollaborationSession => {
  return {
    ...session,
    approved: true,
    approvedVariant: variantKey,
    approvedAt: new Date().toISOString(),
    status: 'approved',
    revisionHistory: [
      ...session.revisionHistory,
      {
        timestamp: new Date().toISOString(),
        role: 'artist',
        action: `approved ${variantKey}`,
      },
    ],
  };
};

/**
 * Request revisions with feedback
 */
export const requestRevision = (
  session: CollaborationSession,
  feedback: string
): CollaborationSession => {
  return {
    ...session,
    status: 'in-progress',
    revisionHistory: [
      ...session.revisionHistory,
      {
        timestamp: new Date().toISOString(),
        role: 'artist',
        action: 'requested revisions',
        feedback,
      },
    ],
  };
};

/**
 * Get session summary for sharing
 */
export const getCollaborationSummary = (session: CollaborationSession): string => {
  const winners = Object.entries(session.variants)
    .sort((a, b) => b[1].votes - a[1].votes)
    .slice(0, 1)[0];

  return `
MASTERING COLLABORATION: ${session.trackName}
Artist: ${session.artistName}
Status: ${session.status.toUpperCase()}

📊 VARIANT VOTES:
${Object.entries(session.variants)
  .map(([key, v]) => `  ${key}: ${v.character} (${v.lufs} LUFS) - ${v.votes} votes`)
  .join('\n')}

🏆 Leading: ${winners?.[0]} (${winners?.[1]?.character})

🔗 Share URL: ${session.shareUrl}
  `.trim();
};

/**
 * Persist session to localStorage
 */
export const saveCollaborationSession = (session: CollaborationSession): void => {
  const key = `collab:${session.sessionId}`;
  localStorage.setItem(key, JSON.stringify(session));
};

/**
 * Load session from localStorage
 */
export const loadCollaborationSession = (
  sessionId: string
): CollaborationSession | null => {
  const key = `collab:${sessionId}`;
  const stored = localStorage.getItem(key);
  return stored ? JSON.parse(stored) : null;
};
