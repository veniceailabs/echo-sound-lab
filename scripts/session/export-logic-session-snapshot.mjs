#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

function usage() {
  console.error('Usage: node scripts/session/export-logic-session-snapshot.mjs /path/to/project.logicx [output.json]');
}

function readPlistExtract(plistPath, keyPath, format = 'raw') {
  try {
    return execFileSync('plutil', ['-extract', keyPath, format, '-o', '-', plistPath], { encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

function readPlistJson(plistPath, keyPath) {
  const raw = readPlistExtract(plistPath, keyPath, 'json');
  if (!raw) return null;
  return JSON.parse(raw);
}

function asNumber(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function asString(value) {
  return typeof value === 'string' && value.trim() ? value : null;
}

const [, , logicxPathArg, outputPathArg] = process.argv;

if (!logicxPathArg) {
  usage();
  process.exit(1);
}

const logicxPath = path.resolve(logicxPathArg);
const projectInfoPath = path.join(logicxPath, 'Resources', 'ProjectInformation.plist');
const metadataPath = path.join(logicxPath, 'Alternatives', '000', 'MetaData.plist');

if (!fs.existsSync(logicxPath)) {
  throw new Error(`Logic project not found: ${logicxPath}`);
}
if (!fs.existsSync(projectInfoPath)) {
  throw new Error(`Missing ProjectInformation.plist: ${projectInfoPath}`);
}
if (!fs.existsSync(metadataPath)) {
  throw new Error(`Missing MetaData.plist: ${metadataPath}`);
}

const projectName =
  asString(readPlistJson(projectInfoPath, 'VariantNames')?.['0']) ||
  asString(readPlistJson(projectInfoPath, 'VariantNamesV2')?.['0']) ||
  path.basename(logicxPath, '.logicx');

const snapshot = {
  format: 'esl-logic-session-snapshot',
  version: 1,
  exportedAt: Date.now(),
  sourceApp: 'logic-pro',
  projectName,
  projectPackageName: path.basename(logicxPath),
  sourcePackagePath: logicxPath,
  logicVersion: asString(readPlistExtract(projectInfoPath, 'LastSavedFrom')),
  bundleVersion: asNumber(readPlistExtract(projectInfoPath, 'BundleVersion')),
  hasProjectFolder: readPlistExtract(projectInfoPath, 'HasProjectFolder') === 'true',
  bpm: asNumber(readPlistExtract(metadataPath, 'BeatsPerMinute')),
  sampleRate: asNumber(readPlistExtract(metadataPath, 'SampleRate')),
  frameRateIndex: asNumber(readPlistExtract(metadataPath, 'FrameRateIndex')),
  trackCount: asNumber(readPlistExtract(metadataPath, 'NumberOfTracks')),
  timeSignature: {
    numerator: asNumber(readPlistExtract(metadataPath, 'SongSignatureNumerator')),
    denominator: asNumber(readPlistExtract(metadataPath, 'SongSignatureDenominator')),
  },
  keySignature: {
    tonic: asString(readPlistExtract(metadataPath, 'SongKey')),
    scale: asString(readPlistExtract(metadataPath, 'SongGenderKey')),
    signatureKey: asNumber(readPlistExtract(metadataPath, 'SignatureKey')),
  },
  audioFiles: Array.isArray(readPlistJson(metadataPath, 'AudioFiles')) ? readPlistJson(metadataPath, 'AudioFiles').filter((item) => typeof item === 'string') : [],
  unusedAudioFiles: Array.isArray(readPlistJson(metadataPath, 'UnusedAudioFiles')) ? readPlistJson(metadataPath, 'UnusedAudioFiles').filter((item) => typeof item === 'string') : [],
  hasGrid: (() => {
    const value = readPlistExtract(metadataPath, 'HasGrid');
    return value === null ? null : value === 'true';
  })(),
  isTimeCodeBased: (() => {
    const value = readPlistExtract(metadataPath, 'isTimeCodeBased');
    return value === null ? null : value === 'true';
  })(),
};

const outputPath = outputPathArg
  ? path.resolve(outputPathArg)
  : path.join(process.cwd(), `${path.basename(logicxPath, '.logicx')}.esl-logic-session.json`);

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
console.log(outputPath);
