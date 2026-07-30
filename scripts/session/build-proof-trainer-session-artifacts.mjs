#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

function usage() {
  console.error(
    'Usage: node scripts/session/build-proof-trainer-session-artifacts.mjs <logicx> <session-folder> <reference-master> [output-dir]'
  );
}

const [, , logicxArg, sessionFolderArg, referenceMasterArg, outputDirArg] = process.argv;

if (!logicxArg || !sessionFolderArg || !referenceMasterArg) {
  usage();
  process.exit(1);
}

const cwd = process.cwd();
const logicxPath = path.resolve(logicxArg);
const sessionFolderPath = path.resolve(sessionFolderArg);
const referenceMasterPath = path.resolve(referenceMasterArg);
const outputDir = path.resolve(outputDirArg || path.join(cwd, 'artifacts/qa'));
const baseName = path.basename(sessionFolderPath).replace(/[^a-z0-9._-]+/gi, '-').replace(/-+/g, '-').replace(/^-+|-+$/g, '') || 'proof-session';

fs.mkdirSync(outputDir, { recursive: true });

const logicSnapshotPath = path.join(outputDir, `${baseName}.logic-session.json`);
const blueprintPath = path.join(outputDir, `${baseName}.proof-trainer-blueprint.json`);
const validationPath = path.join(outputDir, `${baseName}.proof-trainer-validation.json`);

execFileSync('node', [
  'scripts/session/export-logic-session-snapshot.mjs',
  logicxPath,
  logicSnapshotPath,
], { cwd, stdio: 'inherit' });

execFileSync('node', [
  'scripts/session/export-proof-trainer-blueprint.mjs',
  sessionFolderPath,
  referenceMasterPath,
  logicSnapshotPath,
  blueprintPath,
], { cwd, stdio: 'inherit' });

execFileSync('node', [
  'scripts/session/validate-proof-trainer-blueprint.mjs',
  blueprintPath,
  sessionFolderPath,
  referenceMasterPath,
  validationPath,
], { cwd, stdio: 'inherit' });

const logicSnapshot = JSON.parse(fs.readFileSync(logicSnapshotPath, 'utf8'));
const blueprint = JSON.parse(fs.readFileSync(blueprintPath, 'utf8'));
const validation = JSON.parse(fs.readFileSync(validationPath, 'utf8'));

const summary = {
  format: 'esl-proof-trainer-artifact-bundle',
  version: 1,
  generatedAt: Date.now(),
  logicxPath,
  sessionFolderPath,
  referenceMasterPath,
  outputDir,
  artifacts: {
    logicSnapshotPath,
    blueprintPath,
    validationPath,
  },
  logicSnapshot,
  blueprint,
  validation,
};

const summaryPath = path.join(outputDir, `${baseName}.artifact-bundle.json`);
fs.writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
console.log(summaryPath);
