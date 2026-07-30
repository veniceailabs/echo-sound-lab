export interface WorkspaceSandboxManifest {
  clientUuid: string;
  jobId: string;
  workspaceRoot: string;
  jobPath: string;
  renderPath: string;
  deliverPath: string;
  cleanupPath: string;
  cleanupActions: string[];
}

export interface WorkspaceSandboxCleanupResult {
  cleaned: string[];
  skipped: string[];
}

export interface WorkspaceSandboxDeliveryResult {
  archivePath: string;
  vaultArchivePath: string;
  cleanup: WorkspaceSandboxCleanupResult;
}

export interface WorkspaceSandboxDeliveryPlan {
  vaultRoot: string;
  vaultArchivePath: string;
  cleanupActions: string[];
}

function normalizeRoot(root: string): string {
  return normalizeSandboxPath(root);
}

function ensureInsideRoot(root: string, targetPath: string): boolean {
  const normalizedRoot = normalizeRoot(root);
  const normalizedTarget = normalizeRoot(targetPath);
  return normalizedTarget === normalizedRoot || normalizedTarget.startsWith(`${normalizedRoot}/`);
}

function normalizeSandboxPath(input: string): string {
  const trimmed = input.trim().replace(/\\/g, '/');
  const parts: string[] = [];
  for (const part of trimmed.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') {
      parts.pop();
      continue;
    }
    parts.push(part);
  }
  const prefix = trimmed.startsWith('/') ? '/' : '';
  return `${prefix}${parts.join('/')}` || '.';
}

function joinSandboxPath(...segments: string[]): string {
  return normalizeSandboxPath(segments.filter(Boolean).join('/'));
}

export function buildWorkspaceSandboxManifest(input: {
  clientUuid: string;
  jobId: string;
  renderKind: 'master' | 'stems' | 'session' | 'delivery';
  root?: string;
}): WorkspaceSandboxManifest {
  const workspaceRoot = joinSandboxPath(input.root || 'tests/fixtures/workspaces', input.clientUuid, input.jobId);
  const jobPath = joinSandboxPath(workspaceRoot, 'job');
  const renderPath = joinSandboxPath(workspaceRoot, 'renders', input.renderKind);
  const deliverPath = joinSandboxPath(workspaceRoot, 'delivery');
  const cleanupPath = joinSandboxPath(workspaceRoot, 'cleanup');
  return {
    clientUuid: input.clientUuid,
    jobId: input.jobId,
    workspaceRoot,
    jobPath,
    renderPath,
    deliverPath,
    cleanupPath,
    cleanupActions: [
      'Write render artifacts only inside the job workspace.',
      'Zip the finished workspace before delivery.',
      'Remove transient render previews after the archive is created.',
      'Purge cleanup paths after the delivery vault copy is confirmed.',
    ],
  };
}

export function buildWorkspaceSandboxDeliveryPlan(
  manifest: WorkspaceSandboxManifest,
  options: { root?: string; vaultRoot?: string } = {}
): WorkspaceSandboxDeliveryPlan {
  const root = normalizeSandboxPath(options.root || 'tests/fixtures/workspaces');
  const vaultRoot = normalizeSandboxPath(options.vaultRoot || joinSandboxPath(root, 'delivery-vault'));
  return {
    vaultRoot,
    vaultArchivePath: joinSandboxPath(vaultRoot, manifest.clientUuid, `${manifest.jobId}.zip`),
    cleanupActions: [
      'Copy the finished archive into the delivery vault.',
      'Confirm the archive copy before removing the workspace.',
      'Remove the workspace tree after delivery is staged.',
    ],
  };
}
