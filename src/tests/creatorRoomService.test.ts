import { describe, expect, test } from 'vitest';
import type { ReplayState } from '../services/deterministicReplayService';
import type { ProcessingConfig } from '../types';
import {
  addCreatorRoomCollaborator,
  buildCreatorRoomShareManifest,
  commitCreatorRoomVersion,
  createCreatorRoom,
  forkCreatorRoom,
} from '../services/creatorRoomService';

function makeTimeline(): ReplayState {
  return {
    sessionId: 'session-room',
    workspaceId: 'workspace-room',
    tracks: [],
    regions: [],
    automation: [],
    markers: [],
    metadata: {},
  } as ReplayState;
}

describe('creatorRoomService', () => {
  test('creates rooms, commits revisions, forks remixes, and exports share manifests', () => {
    const owner = { userId: 'andra', displayName: 'Andra', role: 'owner' as const };
    const initialRoom = createCreatorRoom({
      name: 'Moon Session',
      owner,
      timelineState: makeTimeline(),
      processingConfig: {} as ProcessingConfig,
      visibility: 'unlisted',
      tags: ['rnb'],
    });

    const roomWithCollaborator = addCreatorRoomCollaborator(initialRoom, {
      userId: 'engineer-1',
      displayName: 'Engineer',
      role: 'collaborator',
    });
    const revisedRoom = commitCreatorRoomVersion(roomWithCollaborator, {
      label: 'Hook lift pass',
      createdBy: 'engineer-1',
      timelineState: makeTimeline(),
      processingConfig: { targetLufs: -10 } as ProcessingConfig,
      notes: ['Lifted hook arrangement.'],
    });
    const { parentRoom, fork } = forkCreatorRoom(revisedRoom, {
      forkName: 'Moon Session Remix A',
      createdBy: 'andra',
      remixIntent: 'remix',
    });
    const manifest = buildCreatorRoomShareManifest(parentRoom, { allowForks: true });

    expect(parentRoom.versions).toHaveLength(2);
    expect(parentRoom.collaborators).toHaveLength(2);
    expect(parentRoom.forks).toHaveLength(1);
    expect(fork.name).toBe('Moon Session Remix A');
    expect(manifest.allowForks).toBe(true);
    expect(manifest.shareToken).toMatch(/^room-share-/);
  });
});
