import { describe, expect, test, vi } from 'vitest';
import { RenderQueueService } from '../services/renderQueueService';

describe('RenderQueueService', () => {
  test('serializes jobs and runs cleanup after each render', async () => {
    const queue = new RenderQueueService();
    const events: string[] = [];
    const cleanup = vi.fn(async (label: string) => {
      events.push(`cleanup:${label}`);
    });

    const jobA = queue.enqueue({
      jobId: 'job-a',
      label: 'A',
      run: async () => {
        events.push('start:A');
        await new Promise((resolve) => setTimeout(resolve, 10));
        events.push('end:A');
        return 'A';
      },
      cleanup: () => cleanup('A'),
    });

    const jobB = queue.enqueue({
      jobId: 'job-b',
      label: 'B',
      run: async () => {
        events.push('start:B');
        await new Promise((resolve) => setTimeout(resolve, 1));
        events.push('end:B');
        return 'B';
      },
      cleanup: () => cleanup('B'),
    });

    expect(queue.getActiveJobs().map((job) => job.jobId)).toEqual(['job-a', 'job-b']);

    await expect(jobA).resolves.toBe('A');
    await expect(jobB).resolves.toBe('B');

    expect(events).toEqual(['start:A', 'end:A', 'cleanup:A', 'start:B', 'end:B', 'cleanup:B']);
    expect(cleanup).toHaveBeenCalledTimes(2);
    expect(queue.getActiveJobs()).toHaveLength(0);
  });
});
