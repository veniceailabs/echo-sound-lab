/**
 * FileIdentity — Inode-level file binding (Phase 3C macOS)
 *
 * Prevents:
 * - Symlink swaps
 * - Path aliases
 * - File renames/moves
 * - TOCTOU attacks on file access
 *
 * Identity is immutable per session.
 * Any change (inode/device mismatch) → deny + terminate job
 */

export type ResolvedFileIdentity = {
  realPath: string;          // fs.realpath() — canonical path
  inode: number;             // fs.stat().ino — inode number
  device: number;            // fs.stat().dev — device number
};

export default ResolvedFileIdentity;
