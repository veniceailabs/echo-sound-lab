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

    const manifestIds = template.actions.map(
      (action) => String((action.parameters as Record<string, unknown>).manifestId || '')
    );
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

    expect(proposals).toHaveLength(4);
    for (const proposal of proposals) {
      expect(proposal.action.type).toBe('ADD_PLUGIN');
      expect(typeof proposal.proposalId).toBe('string');
      expect(proposal.proposalId.length).toBeGreaterThan(8);
    }
  });
});
