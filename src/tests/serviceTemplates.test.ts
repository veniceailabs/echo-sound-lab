import { describe, expect, test } from 'vitest';
import {
  buildServiceTemplateProposals,
  getServiceTemplate,
  listServiceTemplates,
} from '../services/ServiceTemplates';

describe('ServiceTemplates', () => {
  test('registers the Fiverr 3 service templates', () => {
    const templates = listServiceTemplates();
    expect(templates).toHaveLength(3);
    expect(templates.map((template) => template.templateId).sort()).toEqual([
      'master-fast',
      'podcast-cleanup',
      'pro-vocal-polish',
    ]);
  });

  test('podcast cleanup contains expected chain and builds deterministic APL proposals', () => {
    const template = getServiceTemplate('podcast-cleanup');
    expect(template).toBeTruthy();
    if (!template) return;

    const manifestIds = template.actions
      .map(
      (action) => String((action.parameters as Record<string, unknown>).manifestId || '')
      )
      .filter(Boolean);
    expect(manifestIds).toEqual([
      'echo.vocal.gate',
      'echo.vocal.eq.proximity',
      'echo.vocal.comp.opto',
      'echo.master.limiter.brick',
    ]);

    const proposals = buildServiceTemplateProposals(template, {
      trackId: 'track-main',
      trackName: 'Main',
      generatorId: 'test/service-template',
    });

    expect(proposals).toHaveLength(template.actions.length);
    expect(proposals.map((proposal) => proposal.action.type)).toEqual([
      'ADD_PLUGIN',
      'ADD_PLUGIN',
      'ADD_PLUGIN',
      'ADD_PLUGIN',
      'GAIN_ADJUSTMENT',
      'NORMALIZATION',
      'LIMITING',
    ]);
    expect(proposals.every((proposal) => typeof proposal.proposalId === 'string' && proposal.proposalId.length > 8)).toBe(true);
  });
});
