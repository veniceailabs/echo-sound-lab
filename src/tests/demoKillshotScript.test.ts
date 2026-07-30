import { describe, expect, it } from 'vitest';
import { DemoScript } from '../services/demo/DemoScript';

describe('DemoScript killshot preset', () => {
  it('builds a short, decisive script from killshot intent', () => {
    const script = DemoScript.fromPrompt('Killshot demo for a hip-hop vocal');
    const config = script.getConfig();

    expect(config.genre).toBe('hip-hop');
    expect(config.trackType).toBe('vocal');
    expect(config.duration).toBe('short');
    expect(config.refinement).toBe(false);
    expect(config.features).toEqual(['eq', 'compression']);
  });
});
