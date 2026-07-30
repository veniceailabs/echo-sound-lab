import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

describe('ExecutionService default mode', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalOverride = process.env.ESL_EXECUTION_SIMULATION;

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.resetModules();
    process.env.NODE_ENV = originalNodeEnv;
    if (originalOverride === undefined) {
      delete process.env.ESL_EXECUTION_SIMULATION;
    } else {
      process.env.ESL_EXECUTION_SIMULATION = originalOverride;
    }
  });

  test('defaults to real mode when NODE_ENV=production and no override is set', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.ESL_EXECUTION_SIMULATION;

    const { executionService } = await import('../services/ExecutionService');
    expect(executionService.getSimulationMode()).toBe(false);
  });

  test('can be forced back to simulation with ESL_EXECUTION_SIMULATION=1', async () => {
    process.env.NODE_ENV = 'production';
    process.env.ESL_EXECUTION_SIMULATION = '1';

    const { executionService } = await import('../services/ExecutionService');
    expect(executionService.getSimulationMode()).toBe(true);
  });

  test('can be forced into real mode with ESL_EXECUTION_SIMULATION=0', async () => {
    process.env.NODE_ENV = 'development';
    process.env.ESL_EXECUTION_SIMULATION = '0';

    const { executionService } = await import('../services/ExecutionService');
    expect(executionService.getSimulationMode()).toBe(false);
  });
});
