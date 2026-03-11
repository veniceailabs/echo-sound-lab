import { describe, expect, test } from 'vitest';
import { ProposalMapper } from '../services/logic/LogicTemplates';

describe('Timeline Execution Mapper', () => {
  test('maps deterministic timeline actions to executable templates', () => {
    const timelineActions = ['ADD_TRACK', 'MOVE_REGION', 'SPLIT_REGION', 'SET_AUTOMATION_POINT'] as const;

    for (const actionType of timelineActions) {
      const mapper = ProposalMapper[actionType];
      expect(typeof mapper).toBe('function');
      const script = mapper({ actionType, regionId: 'region-main-1' });
      expect(script).toContain('tell application "Logic Pro X"');
      expect(script).toContain('Timeline action');
    }
  });
});
