import path from 'node:path';
import {
  buildWorkspaceSandboxDeliveryPlan,
  type WorkspaceSandboxCleanupResult,
  type WorkspaceSandboxDeliveryResult,
  type WorkspaceSandboxManifest,
} from './workspaceSandboxService';

function normalizeRoot(root: string): string {
  return path.resolve(root);
}

function ensureInsideRoot(root: string, targetPath: string): boolean {
  const normalizedRoot = normalizeRoot(root);
  const normalizedTarget = path.resolve(targetPath);
  return normalizedTarget === normalizedRoot || normalizedTarget.startsWith(`${normalizedRoot}${path.sep}`);
}

export async function cleanupWorkspaceSandboxes(
  manifests: WorkspaceSandboxManifest[],
  options: { root?: string } = {}
): Promise<WorkspaceSandboxCleanupResult> {
  const fs = await import('node:fs/promises');
  const root = path.resolve(options.root || 'tests/fixtures/workspaces');
  const cleaned: string[] = [];
  const skipped: string[] = [];

  for (const manifest of manifests) {
    const candidatePaths = [
      manifest.cleanupPath,
      manifest.renderPath,
      manifest.deliverPath,
      manifest.jobPath,
      manifest.workspaceRoot,
    ];

    for (const targetPath of candidatePaths) {
      if (!ensureInsideRoot(root, targetPath)) {
        skipped.push(targetPath);
        continue;
      }
      await fs.rm(targetPath, { recursive: true, force: true });
      cleaned.push(targetPath);
    }
  }

  return { cleaned, skipped };
}

export async function deliverWorkspaceSandboxArchive(
  manifest: WorkspaceSandboxManifest,
  archivePath: string,
  options: { root?: string; vaultRoot?: string } = {}
): Promise<WorkspaceSandboxDeliveryResult> {
  const fs = await import('node:fs/promises');
  const root = path.resolve(options.root || 'tests/fixtures/workspaces');
  const deliveryPlan = buildWorkspaceSandboxDeliveryPlan(manifest, { root, vaultRoot: options.vaultRoot });
  if (!ensureInsideRoot(root, archivePath)) {
    throw new Error(`Archive path is outside the sandbox root: ${archivePath}`);
  }

  const vaultArchivePath = deliveryPlan.vaultArchivePath;
  await fs.mkdir(path.dirname(vaultArchivePath), { recursive: true });
  await fs.copyFile(archivePath, vaultArchivePath);
  const cleanup = await cleanupWorkspaceSandboxes([manifest], { root });
  return {
    archivePath,
    vaultArchivePath,
    cleanup,
  };
}
