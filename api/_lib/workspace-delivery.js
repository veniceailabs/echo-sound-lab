import path from 'path';
import { mkdir, copyFile, stat } from 'fs/promises';

const DEFAULT_VAULT_ROOT = path.join(process.cwd(), 'artifacts', 'delivery-vault');

function normalizePath(input) {
  return path.resolve(String(input || '').trim());
}

function isLocalArchivePath(value) {
  if (!value) return false;
  const text = String(value).trim();
  return !/^https?:\/\//i.test(text) && !text.startsWith('file://');
}

export function buildWorkspaceDeliveryPlan({
  jobId,
  clientUuid,
  archivePath,
  vaultRoot = process.env.ESL_DELIVERY_VAULT_ROOT || DEFAULT_VAULT_ROOT,
}) {
  const normalizedVaultRoot = normalizePath(vaultRoot);
  const vaultArchivePath = path.join(normalizedVaultRoot, String(clientUuid || 'client-main'), `${String(jobId || 'job-main')}.zip`);
  return {
    job_id: String(jobId || 'job-main'),
    client_uuid: String(clientUuid || 'client-main'),
    source_archive_path: archivePath || null,
    source_archive_local_path: isLocalArchivePath(archivePath) ? normalizePath(archivePath) : null,
    vault_root: normalizedVaultRoot,
    vault_archive_path: vaultArchivePath,
    cleanup_actions: [
      'Stage the archive into the delivery vault.',
      'Remove the transient workspace after staging.',
      'Keep only the immutable vault copy for delivery.',
    ],
  };
}

export async function stageWorkspaceDelivery(manifest) {
  const sourceArchivePath = manifest.source_archive_local_path;
  if (!sourceArchivePath) {
    return {
      ...manifest,
      staged: false,
      reason: manifest.source_archive_path
        ? 'The upstream archive path is remote, so staging is metadata-only on this runtime.'
        : 'No local archive path was provided by the upstream core response.',
    };
  }

  try {
    await stat(sourceArchivePath);
  } catch {
    return {
      ...manifest,
      staged: false,
      reason: 'The upstream archive path is not available on this runtime.',
    };
  }

  await mkdir(path.dirname(manifest.vault_archive_path), { recursive: true });
  await copyFile(sourceArchivePath, manifest.vault_archive_path);
  return {
    ...manifest,
    staged: true,
    reason: 'Archive copied into the delivery vault.',
  };
}
