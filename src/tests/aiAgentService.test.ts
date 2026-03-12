import { describe, expect, test } from 'vitest';
import { AI_AGENT_SYSTEM_PROMPT, aiAgentService } from '../services/AIAgentService';

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

  test('includes multilingual strict orchestration system prompt directive', () => {
    expect(aiAgentService.getSystemPrompt()).toBe(AI_AGENT_SYSTEM_PROMPT);
    expect(AI_AGENT_SYSTEM_PROMPT).toContain('strictly defined English JSON APL schema');
    expect(AI_AGENT_SYSTEM_PROMPT).toContain('may speak any language');
  });

  test('maps spanish intent to same deterministic plugin actions', async () => {
    const actions = await aiAgentService.generateActionSequence('Haz las voces más agresivas con más aire', {
      trackId: 'track-vocal',
      trackName: 'Lead Vocal',
      workspaceId: 'workspace-main',
    });

    expect(actions.some((action) => action.type === 'ADD_PLUGIN' && action.parameters.manifestId === 'echo.vocal.comp.fet')).toBe(true);
    expect(actions.some((action) => action.type === 'ADD_PLUGIN' && action.parameters.manifestId === 'echo.vocal.eq.air')).toBe(true);
  });

  test('maps korean intent to same deterministic plugin actions', async () => {
    const actions = await aiAgentService.generateActionSequence('보컬을 더 공격적으로 만들고 밝게 해줘', {
      trackId: 'track-vocal',
      trackName: 'Lead Vocal',
      workspaceId: 'workspace-main',
    });

    expect(actions.some((action) => action.type === 'ADD_PLUGIN' && action.parameters.manifestId === 'echo.vocal.comp.fet')).toBe(true);
    expect(actions.some((action) => action.type === 'ADD_PLUGIN' && action.parameters.manifestId === 'echo.vocal.eq.air')).toBe(true);
  });
});
