import type { ProcessingConfig } from '../types';
import type { ReplayState } from './deterministicReplayService';
import { deterministicId, stableStringify } from './deterministicJson';

export type CreatorRoomVisibility = 'private' | 'unlisted' | 'public';
export type CreatorRoomRole = 'owner' | 'collaborator' | 'reviewer' | 'listener';

export interface CreatorIdentity {
  userId: string;
  displayName: string;
  role: CreatorRoomRole;
}

export interface CreatorRoomFork {
  forkId: string;
  parentRoomId: string;
  parentVersionId: string;
  forkName: string;
  createdBy: string;
  createdAt: number;
  remixIntent: 'revision' | 'remix' | 'client-alt' | 'template';
}

export interface CreatorRoomVersion {
  versionId: string;
  label: string;
  createdBy: string;
  createdAt: number;
  timelineState: ReplayState;
  processingConfig: ProcessingConfig;
  notes: string[];
  parentVersionId: string | null;
}

export interface CreatorRoom {
  roomId: string;
  name: string;
  visibility: CreatorRoomVisibility;
  ownerId: string;
  collaborators: CreatorIdentity[];
  versions: CreatorRoomVersion[];
  forks: CreatorRoomFork[];
  tags: string[];
  createdAt: number;
  updatedAt: number;
}

export interface CreatorRoomShareManifest {
  roomId: string;
  name: string;
  visibility: CreatorRoomVisibility;
  latestVersionId: string;
  collaboratorCount: number;
  forkCount: number;
  revisionCount: number;
  shareToken: string;
  allowForks: boolean;
  exportedAt: number;
}

function nowMs(): number {
  return Date.now();
}

function latestVersion(room: CreatorRoom): CreatorRoomVersion {
  const version = room.versions[room.versions.length - 1];
  if (!version) throw new Error(`CREATOR_ROOM_EMPTY: ${room.roomId}`);
  return version;
}

export function createCreatorRoom(input: {
  name: string;
  owner: CreatorIdentity;
  timelineState: ReplayState;
  processingConfig: ProcessingConfig;
  visibility?: CreatorRoomVisibility;
  tags?: string[];
  notes?: string[];
}): CreatorRoom {
  const createdAt = nowMs();
  const roomId = deterministicId('creator-room', {
    name: input.name,
    ownerId: input.owner.userId,
    sessionId: input.timelineState.sessionId,
    createdAt,
  });
  const initialVersion: CreatorRoomVersion = {
    versionId: deterministicId('room-version', {
      roomId,
      timelineState: input.timelineState,
      processingConfig: input.processingConfig,
      createdAt,
    }),
    label: 'Initial room version',
    createdBy: input.owner.userId,
    createdAt,
    timelineState: input.timelineState,
    processingConfig: input.processingConfig,
    notes: input.notes || [],
    parentVersionId: null,
  };

  return {
    roomId,
    name: input.name,
    visibility: input.visibility || 'private',
    ownerId: input.owner.userId,
    collaborators: [{ ...input.owner, role: 'owner' }],
    versions: [initialVersion],
    forks: [],
    tags: input.tags || [],
    createdAt,
    updatedAt: createdAt,
  };
}

export function addCreatorRoomCollaborator(room: CreatorRoom, collaborator: CreatorIdentity): CreatorRoom {
  const existing = room.collaborators.filter((entry) => entry.userId !== collaborator.userId);
  return {
    ...room,
    collaborators: [...existing, collaborator],
    updatedAt: nowMs(),
  };
}

export function commitCreatorRoomVersion(
  room: CreatorRoom,
  input: {
    label: string;
    createdBy: string;
    timelineState: ReplayState;
    processingConfig: ProcessingConfig;
    notes?: string[];
  }
): CreatorRoom {
  const parent = latestVersion(room);
  const createdAt = nowMs();
  const version: CreatorRoomVersion = {
    versionId: deterministicId('room-version', {
      roomId: room.roomId,
      parentVersionId: parent.versionId,
      label: input.label,
      timelineState: input.timelineState,
      processingConfig: input.processingConfig,
      createdAt,
    }),
    label: input.label,
    createdBy: input.createdBy,
    createdAt,
    timelineState: input.timelineState,
    processingConfig: input.processingConfig,
    notes: input.notes || [],
    parentVersionId: parent.versionId,
  };

  return {
    ...room,
    versions: [...room.versions, version],
    updatedAt: createdAt,
  };
}

export function forkCreatorRoom(
  room: CreatorRoom,
  input: {
    forkName: string;
    createdBy: string;
    remixIntent?: CreatorRoomFork['remixIntent'];
  }
): { parentRoom: CreatorRoom; fork: CreatorRoom } {
  const source = latestVersion(room);
  const createdAt = nowMs();
  const forkRecord: CreatorRoomFork = {
    forkId: deterministicId('creator-fork', {
      parentRoomId: room.roomId,
      parentVersionId: source.versionId,
      forkName: input.forkName,
      createdBy: input.createdBy,
      createdAt,
    }),
    parentRoomId: room.roomId,
    parentVersionId: source.versionId,
    forkName: input.forkName,
    createdBy: input.createdBy,
    createdAt,
    remixIntent: input.remixIntent || 'remix',
  };
  const forkOwner =
    room.collaborators.find((collaborator) => collaborator.userId === input.createdBy) ||
    ({ userId: input.createdBy, displayName: input.createdBy, role: 'owner' } satisfies CreatorIdentity);
  const fork = createCreatorRoom({
    name: input.forkName,
    owner: { ...forkOwner, role: 'owner' },
    timelineState: source.timelineState,
    processingConfig: source.processingConfig,
    visibility: 'private',
    tags: [...room.tags, 'fork'],
    notes: [`Forked from ${room.name} / ${source.label}`],
  });

  return {
    parentRoom: {
      ...room,
      forks: [...room.forks, forkRecord],
      updatedAt: createdAt,
    },
    fork,
  };
}

export function buildCreatorRoomShareManifest(
  room: CreatorRoom,
  options: { allowForks?: boolean } = {}
): CreatorRoomShareManifest {
  const latest = latestVersion(room);
  return {
    roomId: room.roomId,
    name: room.name,
    visibility: room.visibility,
    latestVersionId: latest.versionId,
    collaboratorCount: room.collaborators.length,
    forkCount: room.forks.length,
    revisionCount: room.versions.length,
    shareToken: deterministicId('room-share', {
      roomId: room.roomId,
      latestVersionId: latest.versionId,
      visibility: room.visibility,
      allowForks: options.allowForks ?? room.visibility !== 'private',
      digest: stableStringify({
        collaborators: room.collaborators.map((collaborator) => collaborator.userId).sort(),
        versions: room.versions.map((version) => version.versionId),
      }),
    }),
    allowForks: options.allowForks ?? room.visibility !== 'private',
    exportedAt: nowMs(),
  };
}

export function serializeCreatorRoom(room: CreatorRoom): string {
  return JSON.stringify(room, null, 2);
}
