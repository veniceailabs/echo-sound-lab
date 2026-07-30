#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const AUDIO_EXTENSION_RE = /\.(wav|wave|mp3|m4a|aac|flac|aif|aiff|ogg|caf|alac)$/i;

function usage() {
  console.error('Usage: node scripts/session/export-proof-trainer-blueprint.mjs <session-folder> <reference-master> [logic-snapshot.json] [output.json]');
}

function inferKind(relativePath) {
  const lower = relativePath.toLowerCase();
  if (/(^|[\s._/-])(master|mix|final|reference|ref|2trk|two[-\s]?track|print)([\s._/-]|$)/.test(lower)) return 'reference';
  if (/(^|[\s._/-])(beat|instrumental|inst|music|prod|production|drums|perc|percussion)([\s._/-]|$)/.test(lower)) return 'beat';
  if (/(^|[\s._/-])(vocal|vox|lead|main|verse|hook|chorus|double|dbl|adlib|ad-lib|adlibs|harm|harmony|bgv|backing)([\s._/-]|$)/.test(lower)) return 'vocal';
  return 'other';
}

function inferRole(relativePath, index) {
  const lower = relativePath.toLowerCase();
  if (/(^|[\s._/-])(reference|ref|master|mix|final)([\s._/-]|$)/.test(lower)) return 'reference';
  if (/(^|[\s._/-])(beat|instrumental|inst|music|prod|drums|perc)([\s._/-]|$)/.test(lower)) return 'beat';
  if (/(^|[\s._/-])(bass|808|sub)([\s._/-]|$)/.test(lower)) return 'bass';
  if (/(^|[\s._/-])(intro|opening)([\s._/-]|$)/.test(lower)) return 'intro';
  if (/(^|[\s._/-])(outro|ending)([\s._/-]|$)/.test(lower)) return 'outro';
  if (/(^|[\s._/-])(double|dbl|dbls|dub)([\s._/-]|$)/.test(lower)) return 'double';
  if (/(^|[\s._/-])(adlib|ad-lib|adlibs|ad-libs)([\s._/-]|$)/.test(lower)) return 'adlib';
  if (/(^|[\s._/-])(harmony|harm|bgv|backing|echo)([\s._/-]|$)/.test(lower)) return 'harmony';
  if (/(^|[\s._/-])(throw|fx|effect)([\s._/-]|$)/.test(lower)) return 'throw';
  if (/(^|[\s._/-])(lead|main|verse|hook|chorus|vocal|vox)([\s._/-]|$)/.test(lower)) return 'lead';
  return index === 0 ? 'lead' : 'support';
}

function walkAudioFiles(root) {
  const results = [];
  const visit = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        visit(fullPath);
        continue;
      }
      if (AUDIO_EXTENSION_RE.test(entry.name)) {
        results.push(fullPath);
      }
    }
  };
  visit(root);
  return results.sort((a, b) => a.localeCompare(b));
}

const [, , sessionFolderArg, referenceMasterArg, logicSnapshotArg, outputArg] = process.argv;

if (!sessionFolderArg || !referenceMasterArg) {
  usage();
  process.exit(1);
}

const sessionFolderPath = path.resolve(sessionFolderArg);
const referenceMasterPath = path.resolve(referenceMasterArg);

if (!fs.existsSync(sessionFolderPath)) {
  throw new Error(`Session folder not found: ${sessionFolderPath}`);
}
if (!fs.existsSync(referenceMasterPath)) {
  throw new Error(`Reference master not found: ${referenceMasterPath}`);
}

const logicSnapshot = logicSnapshotArg ? JSON.parse(fs.readFileSync(path.resolve(logicSnapshotArg), 'utf8')) : null;
const sessionAudioFiles = walkAudioFiles(sessionFolderPath);
const expectedTracks = sessionAudioFiles.map((fullPath, index) => {
  const relativePath = path.relative(sessionFolderPath, fullPath);
  const displayName = path.basename(fullPath);
  const kind = inferKind(relativePath);
  const role = inferRole(relativePath, index);
  return {
    relativePath,
    displayName,
    kind,
    role,
    required: kind === 'beat' || kind === 'vocal',
  };
});

const blueprint = {
  format: 'esl-proof-trainer-blueprint',
  version: 1,
  exportedAt: Date.now(),
  blueprintName: path.basename(sessionFolderPath),
  sessionFolderPath,
  referenceMasterPath,
  referenceMasterName: path.basename(referenceMasterPath),
  referenceStyle: 'proof_mix_trainer',
  notes: [
    'Generated from a local ESL Proof Trainer session folder.',
    'Use this blueprint with the imported session folder and optional Logic snapshot to validate intake before rendering.',
  ],
  expectedTracks,
  logicSnapshot,
};

const outputPath = outputArg
  ? path.resolve(outputArg)
  : path.join(process.cwd(), `${path.basename(sessionFolderPath)}.proof-trainer-blueprint.json`);

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(blueprint, null, 2)}\n`, 'utf8');
console.log(outputPath);
