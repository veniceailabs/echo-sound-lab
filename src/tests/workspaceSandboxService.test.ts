import { afterEach, describe, expect, test } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import {
  buildWorkspaceSandboxManifest,
} from '../services/workspaceSandboxService';
import {
  cleanupWorkspaceSandboxes,
  deliverWorkspaceSandboxArchive,
} from '../services/workspaceSandboxNode';

const tempRoots: string[] = [];

afterEach(async () => {
  for (const root of tempRoots.splice(0)) {
    await fs.rm(root, { recursive: true, force: true }).catch(() => {});
  }
});

describe('workspaceSandboxService', () => {
  test('cleans multiple job sandboxes without touching outside paths', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'esl-sandbox-'));
    tempRoots.push(root);
    const vaultRoot = path.join(root, 'vault');

    const jobs = [
      buildWorkspaceSandboxManifest({ clientUuid: 'client-a', jobId: 'job-a', renderKind: 'master', root }),
      buildWorkspaceSandboxManifest({ clientUuid: 'client-a', jobId: 'job-b', renderKind: 'stems', root }),
    ];

    const outsidePath = path.join(os.tmpdir(), 'esl-outside-preserve.txt');
    await fs.writeFile(outsidePath, 'keep me', 'utf8');

    for (const manifest of jobs) {
      await fs.mkdir(manifest.renderPath, { recursive: true });
      await fs.mkdir(manifest.deliverPath, { recursive: true });
      await fs.mkdir(manifest.cleanupPath, { recursive: true });
      await fs.writeFile(path.join(manifest.cleanupPath, 'scratch.txt'), 'scratch', 'utf8');
    }

    const archivePath = path.join(jobs[0].renderPath, 'job-a.zip');
    await fs.writeFile(archivePath, 'archive', 'utf8');

    const result = await cleanupWorkspaceSandboxes(jobs, { root });

    expect(result.cleaned.length).toBeGreaterThanOrEqual(10);
    expect(result.skipped).toHaveLength(0);
    for (const manifest of jobs) {
      await expect(fs.stat(manifest.workspaceRoot)).rejects.toThrow();
      await expect(fs.stat(manifest.renderPath)).rejects.toThrow();
      await expect(fs.stat(manifest.cleanupPath)).rejects.toThrow();
    }
    expect(await fs.readFile(outsidePath, 'utf8')).toBe('keep me');

    await fs.mkdir(jobs[0].workspaceRoot, { recursive: true });
    await fs.mkdir(path.dirname(archivePath), { recursive: true });
    await fs.writeFile(archivePath, 'archive', 'utf8');
    const delivery = await deliverWorkspaceSandboxArchive(jobs[0], archivePath, { root, vaultRoot });
    expect(delivery.vaultArchivePath).toBe(path.join(vaultRoot, jobs[0].clientUuid, 'job-a.zip'));
    expect(await fs.readFile(delivery.vaultArchivePath, 'utf8')).toBe('archive');
    expect(delivery.cleanup.cleaned.length).toBeGreaterThan(0);
    await fs.rm(outsidePath, { force: true });
  });
});
