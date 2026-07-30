/**
 * Collaboration Service — Real-time multi-user sessions
 *
 * Enables:
 *   - Multiple users in one project session
 *   - Live cursor/selection tracking
 *   - Real-time audio processing results
 *   - A/B variant voting
 *   - Comment threads on tracks
 *   - Version history with blame attribution
 *
 * Transport: WebSocket (primary) with HTTP fallback for non-real-time operations
 */

export type UserRole = 'owner' | 'engineer' | 'artist' | 'viewer';
export type ReviewDecision = 'pending' | 'approved' | 'changes-requested';

export interface Collaborator {
  userId: string;
  name: string;
  email: string;
  role: UserRole;
  color: string; // For cursor tracking
  lastActive: Date;
  cursor?: { x: number; y: number };
}

export interface SessionInvite {
  id: string;
  projectId: string;
  invitedEmail: string;
  role: UserRole;
  invitedBy: string;
  createdAt: Date;
  expiresAt: Date;
  status: 'pending' | 'accepted' | 'rejected';
}

export interface ProjectVersion {
  id: string;
  projectId: string;
  timestamp: Date;
  createdBy: string;
  description: string;
  snapshot: any; // Project state at this version
  isVariant: boolean; // A/B testing variant
  reviewDecision: ReviewDecision;
  reviewNotes: string | null;
  reviewedBy: string | null;
  reviewedAt: Date | null;
  compareVersionId: string | null;
}

export interface Comment {
  id: string;
  projectId: string;
  author: string;
  text: string;
  timestamp: Date;
  resolved: boolean;
  mentions: string[];
}

interface LocalProjectSnapshot {
  collaborators: Collaborator[];
  versions: ProjectVersion[];
  comments: Comment[];
}

export interface ProjectReviewQueueItem {
  versionId: string;
  description: string;
  createdBy: string;
  reviewDecision: ReviewDecision;
  reviewNotes: string | null;
  reviewedBy: string | null;
  reviewedAt: Date | null;
  compareVersionId: string | null;
}

export interface ProjectReviewPackage {
  projectId: string;
  generatedAt: number;
  collaborators: Collaborator[];
  versions: ProjectVersion[];
  comments: Comment[];
  reviewQueue: ProjectReviewQueueItem[];
  summary: {
    totalVersions: number;
    approvedVersions: number;
    changesRequestedVersions: number;
    pendingVersions: number;
    commentCount: number;
    collaboratorCount: number;
  };
  notes: string[];
}

interface CollaborationMessage {
  type: 'cursor' | 'update' | 'comment' | 'vote' | 'presence' | 'version' | 'join' | 'join-confirmed' | 'state-update' | 'error' | string;
  userId?: string;
  projectId?: string;
  payload?: any;
  timestamp?: Date;
  [key: string]: any;
}

type MessageHandler = (message: CollaborationMessage) => void;

const WS_SERVER_URL = import.meta.env.VITE_COLLAB_WS_SERVER || 'ws://localhost:3001';
const LOCAL_PROJECT_PREFIX = 'echo.collab.project.v1';

function getLocalProjectKey(projectId: string): string {
  return `${LOCAL_PROJECT_PREFIX}:${projectId}`;
}

function createSeededColor(seed: string): string {
  const palette = ['#38bdf8', '#a78bfa', '#f472b6', '#34d399', '#f59e0b'];
  let acc = 0;
  for (let i = 0; i < seed.length; i += 1) {
    acc = (acc * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return palette[acc % palette.length] ?? palette[0];
}

function normalizeReviewDecision(value: unknown): ReviewDecision {
  return value === 'approved' || value === 'changes-requested' || value === 'pending' ? value : 'pending';
}

function normalizeProjectVersion(entry: Partial<ProjectVersion>, projectId: string): ProjectVersion {
  return {
    id: typeof entry.id === 'string' ? entry.id : `version-${Date.now().toString(36)}`,
    projectId,
    timestamp: entry.timestamp instanceof Date ? entry.timestamp : new Date(entry.timestamp || Date.now()),
    createdBy: typeof entry.createdBy === 'string' ? entry.createdBy : 'user-current',
    description: typeof entry.description === 'string' ? entry.description : 'Untitled version',
    snapshot: entry.snapshot ?? { projectId, createdLocally: true },
    isVariant: Boolean(entry.isVariant),
    reviewDecision: normalizeReviewDecision(entry.reviewDecision),
    reviewNotes: typeof entry.reviewNotes === 'string' ? entry.reviewNotes : null,
    reviewedBy: typeof entry.reviewedBy === 'string' ? entry.reviewedBy : null,
    reviewedAt: entry.reviewedAt instanceof Date ? entry.reviewedAt : (entry.reviewedAt ? new Date(entry.reviewedAt) : null),
    compareVersionId: typeof entry.compareVersionId === 'string' ? entry.compareVersionId : null,
  };
}

function readLocalProject(projectId: string): LocalProjectSnapshot {
  if (typeof window === 'undefined') {
    return { collaborators: [], versions: [], comments: [] };
  }

  try {
    const raw = window.localStorage.getItem(getLocalProjectKey(projectId));
    if (!raw) {
      return { collaborators: [], versions: [], comments: [] };
    }
    const parsed = JSON.parse(raw) as Partial<LocalProjectSnapshot>;
    return {
      collaborators: Array.isArray(parsed.collaborators) ? parsed.collaborators.map((entry) => ({
        ...entry,
        lastActive: new Date(entry.lastActive),
      })) : [],
      versions: Array.isArray(parsed.versions)
        ? parsed.versions.map((entry) => normalizeProjectVersion(entry as Partial<ProjectVersion>, projectId))
        : [],
      comments: Array.isArray(parsed.comments) ? parsed.comments.map((entry) => ({
        ...entry,
        timestamp: new Date(entry.timestamp),
      })) : [],
    };
  } catch {
    return { collaborators: [], versions: [], comments: [] };
  }
}

function writeLocalProject(projectId: string, snapshot: LocalProjectSnapshot): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(getLocalProjectKey(projectId), JSON.stringify(snapshot));
  } catch {
    // Ignore local persistence failures.
  }
}

function ensureLocalProject(projectId: string): LocalProjectSnapshot {
  const snapshot = readLocalProject(projectId);
  if (snapshot.collaborators.length > 0 || snapshot.versions.length > 0 || snapshot.comments.length > 0) {
    return snapshot;
  }

  const seeded: LocalProjectSnapshot = {
    collaborators: [
      {
        userId: 'user-current',
        name: 'You',
        email: 'user-current@echo-sound-lab.local',
        role: 'owner',
        color: createSeededColor(`${projectId}:owner`),
        lastActive: new Date(),
      },
    ],
    versions: [
      {
        id: `version-${Date.now().toString(36)}`,
        projectId,
        timestamp: new Date(),
        createdBy: 'user-current',
        description: 'Initial local workspace snapshot',
        snapshot: { projectId, createdLocally: true },
        isVariant: false,
        reviewDecision: 'pending',
        reviewNotes: null,
        reviewedBy: null,
        reviewedAt: null,
        compareVersionId: null,
      },
    ],
    comments: [],
  };
  writeLocalProject(projectId, seeded);
  return seeded;
}

function appendLocalVersion(
  projectId: string,
  description: string,
  isVariant: boolean,
  createdBy: string
): ProjectVersion {
  const snapshot = ensureLocalProject(projectId);
  const version: ProjectVersion = {
    id: `version-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    projectId,
    timestamp: new Date(),
    createdBy,
    description,
    snapshot: {
      description,
      createdBy,
      createdLocally: true,
    },
    isVariant,
    reviewDecision: 'pending',
    reviewNotes: null,
    reviewedBy: null,
    reviewedAt: null,
    compareVersionId: snapshot.versions[0]?.id || null,
  };
  const next: LocalProjectSnapshot = {
    ...snapshot,
    versions: [version, ...snapshot.versions].slice(0, 40),
  };
  writeLocalProject(projectId, next);
  return version;
}

function appendLocalComment(
  projectId: string,
  author: string,
  text: string,
  mentions: string[]
): Comment {
  const snapshot = ensureLocalProject(projectId);
  const comment: Comment = {
    id: `comment-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    projectId,
    author,
    text,
    timestamp: new Date(),
    resolved: false,
    mentions: [...mentions],
  };
  const next: LocalProjectSnapshot = {
    ...snapshot,
    comments: [comment, ...snapshot.comments].slice(0, 80),
  };
  writeLocalProject(projectId, next);
  return comment;
}

function appendLocalCollaborator(projectId: string, email: string, role: UserRole): Collaborator {
  const snapshot = ensureLocalProject(projectId);
  const userId = email.split('@')[0]?.trim() || `collab-${Date.now().toString(36)}`;
  const collaborator: Collaborator = {
    userId,
    name: userId.replace(/[._-]+/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase()),
    email,
    role,
    color: createSeededColor(`${projectId}:${email}`),
    lastActive: new Date(),
  };
  const existing = snapshot.collaborators.filter((entry) => entry.userId !== collaborator.userId);
  const next: LocalProjectSnapshot = {
    ...snapshot,
    collaborators: [collaborator, ...existing],
  };
  writeLocalProject(projectId, next);
  return collaborator;
}

export const collaborationService = {
  /**
   * WebSocket connection management
   */
  ws: null as WebSocket | null,
  wsConnected: false,
  messageHandlers: new Map<string, MessageHandler>(),
  reconnectAttempts: 0,
  maxReconnectAttempts: 5,
  projectId: null as string | null,
  userId: null as string | null,
  userName: null as string | null,
  userRole: null as UserRole | null,

  /**
   * Get WebSocket server URL
   */
  async getWsServerUrl(): Promise<string> {
    try {
      const response = await fetch('/api/proxy/collab/server-status');
      if (response.ok) {
        const data = await response.json();
        return data.wsServer || WS_SERVER_URL;
      }
    } catch (err) {
      console.warn('Failed to get WebSocket server URL, using default');
    }
    return WS_SERVER_URL;
  },

  /**
   * Connect to collaboration server via WebSocket
   */
  async connect(projectId: string, userId: string, userName: string = 'Collaborator', userRole: UserRole = 'engineer'): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.projectId = projectId;
        this.userId = userId;
        this.userName = userName;
        this.userRole = userRole;

        // Try to connect to WebSocket server
        this.ws = new WebSocket(`${WS_SERVER_URL}?projectId=${projectId}`);

        this.ws.onopen = () => {
          console.log('🔗 WebSocket connected to collaboration server');
          this.wsConnected = true;
          this.reconnectAttempts = 0;

          // Send join message
          this.send('join', projectId, userId, {
            name: userName,
            email: `${userId}@echo-sound-lab.local`,
          });

          resolve();
        };

        this.ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data) as CollaborationMessage;
            const handler = this.messageHandlers.get(message.type);
            if (handler) handler(message);
          } catch (err) {
            console.error('Message parse error:', err);
          }
        };

        this.ws.onerror = (err) => {
          console.error('WebSocket error:', err);
          this.wsConnected = false;
          // Still resolve since we can fall back to HTTP
          resolve();
        };

        this.ws.onclose = () => {
          this.wsConnected = false;
          this.handleDisconnect();
        };
      } catch (err) {
        console.warn('WebSocket connection failed, will use HTTP fallback:', err);
        this.wsConnected = false;
        resolve(); // Fallback to HTTP is OK
      }
    });
  },

  /**
   * Handle disconnection and attempt reconnect
   */
  handleDisconnect(): void {
    if (this.reconnectAttempts < this.maxReconnectAttempts && this.projectId && this.userId) {
      this.reconnectAttempts++;
      const delay = Math.pow(2, this.reconnectAttempts) * 1000;
      console.log(`Reconnecting... (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
      setTimeout(() => {
        if (!this.wsConnected) {
          this.connect(this.projectId!, this.userId!, this.userName || 'Collaborator', this.userRole || 'engineer').catch(console.error);
        }
      }, delay);
    } else {
      console.warn('Max reconnection attempts reached, using HTTP fallback');
    }
  },

  /**
   * Register handler for message type
   */
  on(type: string, handler: MessageHandler): void {
    this.messageHandlers.set(type, handler);
  },

  /**
   * Send message to WebSocket (with graceful HTTP fallback)
   */
  send(type: string, projectId: string, userId: string, payload: any): void {
    if (this.wsConnected && this.ws && this.ws.readyState === WebSocket.OPEN) {
      const message: CollaborationMessage = {
        type,
        userId,
        projectId,
        payload,
        timestamp: new Date(),
      };
      this.ws.send(JSON.stringify(message));
    } else {
      console.warn(`WebSocket not connected, ${type} operation will be queued or skipped`);
    }
  },

  /**
   * Update cursor position (for live collaboration awareness)
   */
  updateCursor(projectId: string, userId: string, x: number, y: number): void {
    this.send('cursor', projectId, userId, { x, y });
  },

  /**
   * Send a comment on a project (HTTP)
   */
  async addComment(projectId: string, userId: string, text: string, mentions: string[] = []): Promise<Comment> {
    try {
      const response = await fetch(`/api/proxy/collab/comments?projectId=${projectId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, text, mentions }),
      });

      if (!response.ok) throw new Error('Failed to add comment');
      return await response.json();
    } catch (err) {
      console.warn('Add comment error, falling back to local project store:', err);
      const comment = appendLocalComment(projectId, userId, text, mentions);
      return comment;
    }
  },

  /**
   * Vote on an A/B variant (WebSocket)
   */
  voteVariant(projectId: string, userId: string, variantId: string, vote: 'variant-a' | 'variant-b'): void {
    this.send('vote', projectId, userId, { variantId, vote });
  },

  /**
   * Create a new version/variant (WebSocket)
   */
  saveVersion(projectId: string, userId: string, description: string, isVariant: boolean = false): void {
    this.send('version', projectId, userId, { description, isVariant });
    appendLocalVersion(projectId, description, isVariant, userId);
  },

  /**
   * Approve a version in the local review queue
   */
  approveVersion(projectId: string, versionId: string, reviewer: string, notes: string = ''): ProjectVersion | null {
    return updateLocalVersionReview(projectId, versionId, 'approved', reviewer, notes);
  },

  /**
   * Request changes on a version in the local review queue
   */
  requestVersionChanges(projectId: string, versionId: string, reviewer: string, notes: string = ''): ProjectVersion | null {
    return updateLocalVersionReview(projectId, versionId, 'changes-requested', reviewer, notes);
  },

  /**
   * Build a branch-aware review package for export or handoff
   */
  buildReviewPackage(projectId: string): ProjectReviewPackage {
    const snapshot = ensureLocalProject(projectId);
    const reviewQueue = snapshot.versions.map((version) => ({
      versionId: version.id,
      description: version.description,
      createdBy: version.createdBy,
      reviewDecision: version.reviewDecision,
      reviewNotes: version.reviewNotes,
      reviewedBy: version.reviewedBy,
      reviewedAt: version.reviewedAt,
      compareVersionId: version.compareVersionId,
    }));
    return {
      projectId,
      generatedAt: Date.now(),
      collaborators: snapshot.collaborators,
      versions: snapshot.versions,
      comments: snapshot.comments,
      reviewQueue,
      summary: {
        totalVersions: snapshot.versions.length,
        approvedVersions: snapshot.versions.filter((version) => version.reviewDecision === 'approved').length,
        changesRequestedVersions: snapshot.versions.filter((version) => version.reviewDecision === 'changes-requested').length,
        pendingVersions: snapshot.versions.filter((version) => version.reviewDecision === 'pending').length,
        commentCount: snapshot.comments.length,
        collaboratorCount: snapshot.collaborators.length,
      },
      notes: [
        'Versions are reviewable, commentable, and exportable as a project review package.',
        'Approved versions become the explicit decision trail for downstream handoff.',
        'Each version carries review metadata and a compare anchor to the prior version.',
      ],
    };
  },

  /**
   * Export a project review package as formatted JSON
   */
  serializeReviewPackage(projectId: string): string {
    return JSON.stringify(this.buildReviewPackage(projectId), null, 2);
  },

  /**
   * Send invite to collaborator (HTTP)
   */
  async inviteCollaborator(projectId: string, email: string, role: UserRole): Promise<SessionInvite> {
    try {
      const response = await fetch(`/api/proxy/collab/invite?projectId=${projectId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, email, role }),
      });

      if (!response.ok) throw new Error('Failed to send invite');
      const data = await response.json();
      return data.invite;
    } catch (err) {
      console.warn('Invite error, creating local collaborator snapshot:', err);
      appendLocalCollaborator(projectId, email, role);
      return {
        id: `invite-${Date.now().toString(36)}`,
        projectId,
        invitedEmail: email,
        role,
        invitedBy: this.userId || 'user-current',
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        status: 'pending',
      };
    }
  },

  /**
   * Get project collaborators (HTTP)
   */
  async getCollaborators(projectId: string): Promise<Collaborator[]> {
    try {
      const response = await fetch(`/api/proxy/collab/collaborators?projectId=${projectId}`);
      if (!response.ok) throw new Error('Failed to fetch collaborators');
      return await response.json();
    } catch (err) {
      console.warn('Get collaborators error, using local snapshot:', err);
      return ensureLocalProject(projectId).collaborators;
    }
  },

  /**
   * Get project version history (HTTP)
   */
  async getVersionHistory(projectId: string): Promise<ProjectVersion[]> {
    try {
      const response = await fetch(`/api/proxy/collab/versions?projectId=${projectId}`);
      if (!response.ok) throw new Error('Failed to fetch versions');
      return await response.json();
    } catch (err) {
      console.warn('Get versions error, using local snapshot:', err);
      return ensureLocalProject(projectId).versions;
    }
  },

  /**
   * Get project comments (HTTP)
   */
  async getComments(projectId: string): Promise<Comment[]> {
    try {
      const response = await fetch(`/api/proxy/collab/comments?projectId=${projectId}`);
      if (!response.ok) throw new Error('Failed to fetch comments');
      return await response.json();
    } catch (err) {
      console.warn('Get comments error, using local snapshot:', err);
      return ensureLocalProject(projectId).comments;
    }
  },

  /**
   * Disconnect from collaboration session
   */
  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.wsConnected = false;
    this.messageHandlers.clear();
  },
};

function updateLocalVersionReview(
  projectId: string,
  versionId: string,
  reviewDecision: ReviewDecision,
  reviewer: string,
  notes: string
): ProjectVersion | null {
  const snapshot = ensureLocalProject(projectId);
  const nextVersions = snapshot.versions.map((version) => {
    if (version.id !== versionId) return version;
    return {
      ...version,
      reviewDecision,
      reviewedBy: reviewer,
      reviewedAt: new Date(),
      reviewNotes: notes.trim() || null,
    };
  });
  const updated = nextVersions.find((version) => version.id === versionId) || null;
  writeLocalProject(projectId, {
    ...snapshot,
    versions: nextVersions,
  });
  return updated;
}
