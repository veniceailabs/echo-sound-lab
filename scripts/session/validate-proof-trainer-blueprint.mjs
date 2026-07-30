#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const AUDIO_EXTENSION_RE = /\.(wav|wave|mp3|m4a|aac|flac|aif|aiff|ogg|caf|alac)$/i;

function usage() {
  console.error('Usage: node scripts/session/validate-proof-trainer-blueprint.mjs <blueprint.json> <session-folder> <reference-master> [output.json]');
}

function normalizeTrackName(name) {
  return name
    .replace(/^.*[\\/]/, '')
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/([#_])\d+$/i, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
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

const [, , blueprintArg, sessionFolderArg, referenceMasterArg, outputArg] = process.argv;

if (!blueprintArg || !sessionFolderArg || !referenceMasterArg) {
  usage();
  process.exit(1);
}

const blueprintPath = path.resolve(blueprintArg);
const sessionFolderPath = path.resolve(sessionFolderArg);
const referenceMasterPath = path.resolve(referenceMasterArg);

const blueprint = JSON.parse(fs.readFileSync(blueprintPath, 'utf8'));
const sessionAudioFiles = walkAudioFiles(sessionFolderPath);
const importedTracks = sessionAudioFiles.map((fullPath, index) => {
  const relativePath = path.relative(sessionFolderPath, fullPath);
  const displayName = path.basename(fullPath);
  return {
    relativePath,
    displayName,
    kind: inferKind(relativePath),
    role: inferRole(relativePath, index),
  };
});

const remainingImported = [...importedTracks];
const missingExpectedTracks = [];
let matchedExpectedTrackCount = 0;

for (const expected of blueprint.expectedTracks || []) {
  const matchIndex = remainingImported.findIndex((track) => normalizeTrackName(track.displayName) === normalizeTrackName(expected.displayName));
  if (matchIndex >= 0) {
    remainingImported.splice(matchIndex, 1);
    matchedExpectedTrackCount += 1;
  } else if (expected.required) {
    missingExpectedTracks.push(expected);
  }
}

let referenceStatus = 'not-provided';
if (blueprint.referenceMasterName) {
  const actualReferenceName = path.basename(referenceMasterPath);
  referenceStatus = normalizeTrackName(actualReferenceName) === normalizeTrackName(blueprint.referenceMasterName)
    ? 'matched'
    : 'mismatch';
}

const report = {
  format: 'esl-proof-trainer-blueprint-validation',
  version: 1,
  generatedAt: Date.now(),
  blueprintPath,
  sessionFolderPath,
  referenceMasterPath,
  matchedExpectedTrackCount,
  expectedTrackCount: Array.isArray(blueprint.expectedTracks) ? blueprint.expectedTracks.length : 0,
  missingExpectedTracks,
  extraImportedTracks: remainingImported,
  referenceStatus,
  valid: missingExpectedTracks.length === 0 && referenceStatus !== 'mismatch',
};

const outputPath = outputArg
  ? path.resolve(outputArg)
  : path.join(process.cwd(), `${path.basename(blueprintPath, '.json')}.validation.json`);

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(outputPath);
