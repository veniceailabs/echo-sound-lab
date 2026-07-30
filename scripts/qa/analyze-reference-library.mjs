import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const inputDir = process.argv[2];

if (!inputDir) {
  console.error('Usage: node scripts/qa/analyze-reference-library.mjs "/absolute/path/to/reference/folder"');
  process.exit(1);
}

const resolvedDir = path.resolve(inputDir);
if (!fs.existsSync(resolvedDir)) {
  console.error(`Reference folder not found: ${resolvedDir}`);
  process.exit(1);
}

const wavFiles = fs.readdirSync(resolvedDir)
  .filter((entry) => entry.toLowerCase().endsWith('.wav'))
  .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));

if (wavFiles.length === 0) {
  console.error(`No WAV files found in ${resolvedDir}`);
  process.exit(1);
}

function parseLoudnormJson(output) {
  const match = output.match(/\{\s*"input_i"[\s\S]*?\}/m);
  if (!match) {
    throw new Error('Unable to parse loudnorm JSON output.');
  }
  return JSON.parse(match[0]);
}

function toNumber(value) {
  return Number.parseFloat(value);
}

function summarize(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const sum = sorted.reduce((acc, value) => acc + value, 0);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];

  return {
    min: sorted[0],
    max: sorted[sorted.length - 1],
    avg: sum / sorted.length,
    median,
  };
}

const tracks = wavFiles.map((fileName) => {
  const fullPath = path.join(resolvedDir, fileName);
  const result = spawnSync(
    'ffmpeg',
    [
      '-hide_banner',
      '-nostats',
      '-i',
      fullPath,
      '-af',
      'loudnorm=I=-14:TP=-1.0:LRA=7:print_format=json',
      '-f',
      'null',
      '-',
    ],
    { encoding: 'utf8' }
  );
  const output = `${result.stdout || ''}\n${result.stderr || ''}`;
  const parsed = parseLoudnormJson(output);

  return {
    fileName,
    integratedLufs: toNumber(parsed.input_i),
    truePeakDbtp: toNumber(parsed.input_tp),
    loudnessRangeLu: toNumber(parsed.input_lra),
    thresholdLufs: toNumber(parsed.input_thresh),
  };
});

const summary = {
  integratedLufs: summarize(tracks.map((track) => track.integratedLufs)),
  truePeakDbtp: summarize(tracks.map((track) => track.truePeakDbtp)),
  loudnessRangeLu: summarize(tracks.map((track) => track.loudnessRangeLu)),
};

const profile = {
  sourceFolder: resolvedDir,
  analyzedAt: new Date().toISOString(),
  trackCount: tracks.length,
  tracks,
  summary,
  recommendedTargets: {
    integratedLufs: {
      min: Number((summary.integratedLufs.median - 1).toFixed(2)),
      max: Number((summary.integratedLufs.median + 0.75).toFixed(2)),
      center: Number(summary.integratedLufs.median.toFixed(2)),
    },
    truePeakDbtp: {
      max: Number(Math.min(-1, summary.truePeakDbtp.median).toFixed(2)),
      referenceMedian: Number(summary.truePeakDbtp.median.toFixed(2)),
    },
    loudnessRangeLu: {
      min: Number(Math.max(3, summary.loudnessRangeLu.median - 2).toFixed(2)),
      max: Number((summary.loudnessRangeLu.median + 2).toFixed(2)),
      center: Number(summary.loudnessRangeLu.median.toFixed(2)),
    },
  },
};

const artifactsDir = path.resolve(process.cwd(), 'artifacts', 'qa');
fs.mkdirSync(artifactsDir, { recursive: true });
const slug = path.basename(resolvedDir).replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'reference-library';
const outputPath = path.join(artifactsDir, `reference-profile-${slug}.json`);
fs.writeFileSync(outputPath, `${JSON.stringify(profile, null, 2)}\n`, 'utf8');

console.log(JSON.stringify({
  outputPath,
  trackCount: profile.trackCount,
  recommendedTargets: profile.recommendedTargets,
}, null, 2));
