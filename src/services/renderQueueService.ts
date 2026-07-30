export interface RenderQueueJob<T> {
  jobId: string;
  label: string;
  run: () => Promise<T>;
  cleanup?: () => void | Promise<void>;
}

export interface RenderQueueEntry<T> extends RenderQueueJob<T> {
  startedAt: number;
  finishedAt: number | null;
}

export class RenderQueueService {
  private tail: Promise<void> = Promise.resolve();
  private readonly activeJobs = new Map<string, RenderQueueEntry<unknown>>();

  getActiveJobs(): RenderQueueEntry<unknown>[] {
    return Array.from(this.activeJobs.values()).sort((left, right) => left.startedAt - right.startedAt);
  }

  async enqueue<T>(job: RenderQueueJob<T>): Promise<T> {
    const startedAt = Date.now();
    const entry: RenderQueueEntry<T> = {
      ...job,
      startedAt,
      finishedAt: null,
    };

    this.activeJobs.set(job.jobId, entry as RenderQueueEntry<unknown>);

    const previous = this.tail;
    let resolveCurrent: (() => void) | null = null;
    this.tail = new Promise<void>((resolve) => {
      resolveCurrent = resolve;
    });

    await previous;

    try {
      return await job.run();
    } finally {
      entry.finishedAt = Date.now();
      this.activeJobs.delete(job.jobId);
      try {
        await job.cleanup?.();
      } finally {
        resolveCurrent?.();
      }
    }
  }
}

export const renderQueueService = new RenderQueueService();
