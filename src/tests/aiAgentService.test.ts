import { describe, expect, test } from 'vitest';
import { aiAgentService } from '../services/AIAgentService';

describe('AIAgentService', () => {
  test('maps natural language intent to deterministic JSON APL action sequence', async () => {
    const actions = await aiAgentService.generateActionSequence('Make vocals aggressive with more air', {
      trackId: 'track-vocal',
      trackName: 'Lead Vocal',
      workspaceId: 'workspace-main',
    });

    expect(actions.length).toBeGreaterThan(0);
    expect(JSON.parse(JSON.stringify(actions))).toEqual(actions);
    expect(actions.some((action) => action.type === 'ADD_PLUGIN' && action.parameters.manifestId === 'echo.vocal.comp.fet')).toBe(true);
    expect(actions.some((action) => action.type === 'SET_PLUGIN_PARAM' && action.parameters.paramId === 'threshold')).toBe(true);
    expect(actions.some((action) => action.type === 'ADD_PLUGIN' && action.parameters.manifestId === 'echo.vocal.eq.air')).toBe(true);
  });

  test('generates stable proposal IDs for identical intent/context input', async () => {
    const context = {
      trackId: 'track-main',
      trackName: 'Main',
      workspaceId: 'workspace-main',
    };

    const run1 = await aiAgentService.generateProposals('make vocals aggressive', context);
    const run2 = await aiAgentService.generateProposals('make vocals aggressive', context);

    expect(run1.map((proposal) => proposal.proposalId)).toEqual(run2.map((proposal) => proposal.proposalId));
    expect(run1.every((proposal) => typeof proposal.action.type === 'string')).toBe(true);
  });
});
