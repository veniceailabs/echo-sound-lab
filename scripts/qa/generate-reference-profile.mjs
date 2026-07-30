import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const sourceDirArg = process.argv[2];
if (!sourceDirArg) {
  console.error('Usage: node scripts/qa/generate-reference-profile.mjs <reference-folder> [output-file]');
  process.exit(1);
}

const sourceDir = path.resolve(sourceDirArg);
const outputArg = process.argv[3];
const defaultOutput = path.join(process.cwd(), 'artifacts', 'qa', `reference-profile-${Date.now()}.json`);
const outputFile = path.resolve(outputArg || defaultOutput);

if (!fs.existsSync(sourceDir)) {
  console.error(`Reference folder not found: ${sourceDir}`);
  process.exit(1);
}

const wavFiles = fs.readdirSync(sourceDir)
  .filter((entry) => entry.toLowerCase().endsWith('.wav'))
  .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));

if (!wavFiles.length) {
  console.error(`No WAV files found in ${sourceDir}`);
  process.exit(1);
}

function parseProbe(filePath) {
  const result = spawnSync('ffprobe', [
    '-v', 'error',
    '-show_entries', 'format=duration',
    '-show_entries', 'stream=sample_rate,channels,bits_per_sample',
    '-of', 'json',
    filePath,
  ], { encoding: 'utf8' });

  if (result.status !== 0) {
    throw new Error(result.stderr || `ffprobe failed for ${filePath}`);
  }

  const data = JSON.parse(result.stdout);
  const audioStream = (data.streams || [])[0] || {};
  return {
    durationSec: Number(data.format?.duration || 0),
    sampleRate: Number(audioStream.sample_rate || 0),
    channelCount: Number(audioStream.channels || 0),
    bitsPerSample: Number(audioStream.bits_per_sample || 0),
  };
}

function parseLoudness(filePath) {
  const result = spawnSync('ffmpeg', [
    '-hide_banner',
    '-nostats',
    '-i', filePath,
    '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json',
    '-f', 'null',
    '-',
  ], { encoding: 'utf8' });

  const combined = `${result.stderr || ''}\n${result.stdout || ''}`;
  const jsonStart = combined.lastIndexOf('{');
  const jsonEnd = combined.lastIndexOf('}');
  if (result.status !== 0 || jsonStart < 0 || jsonEnd < jsonStart) {
    throw new Error(`ffmpeg loudnorm analysis failed for ${filePath}`);
  }

  const parsed = JSON.parse(combined.slice(jsonStart, jsonEnd + 1));
  return {
    integratedLUFS: Number(parsed.input_i),
    truePeakDbtp: Number(parsed.input_tp),
    loudnessRangeLu: Number(parsed.input_lra),
    thresholdDb: Number(parsed.input_thresh),
  };
}

function createStats(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const average = sorted.reduce((sum, value) => sum + value, 0) / sorted.length;
  const middle = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];

  return {
    min: Number(sorted[0].toFixed(2)),
    max: Number(sorted[sorted.length - 1].toFixed(2)),
    avg: Number(average.toFixed(2)),
    median: Number(median.toFixed(2)),
  };
}

const catalog = wavFiles.map((file) => {
  const fullPath = path.join(sourceDir, file);
  return {
    file,
    fullPath,
    technical: parseProbe(fullPath),
    loudness: parseLoudness(fullPath),
  };
});

const cohort = catalog.filter(({ loudness }) => (
  loudness.integratedLUFS <= -11.5
  && loudness.integratedLUFS >= -15.5
  && loudness.truePeakDbtp <= -2
));

const outliers = catalog.filter((entry) => !cohort.includes(entry)).map((entry) => ({
  file: entry.file,
  integratedLUFS: entry.loudness.integratedLUFS,
  truePeakDbtp: entry.loudness.truePeakDbtp,
  loudnessRangeLu: entry.loudness.loudnessRangeLu,
}));

const profile = {
  profileName: path.basename(sourceDir),
  sourceFolder: sourceDir,
  generatedAt: new Date().toISOString(),
  trackCount: catalog.length,
  technicalBaseline: {
    sampleRates: [...new Set(catalog.map((entry) => entry.technical.sampleRate))],
    channelCounts: [...new Set(catalog.map((entry) => entry.technical.channelCount))],
    bitDepths: [...new Set(catalog.map((entry) => entry.technical.bitsPerSample))].sort((a, b) => a - b),
  },
  overallStats: {
    integratedLUFS: createStats(catalog.map((entry) => entry.loudness.integratedLUFS)),
    truePeakDbtp: createStats(catalog.map((entry) => entry.loudness.truePeakDbtp)),
    loudnessRangeLu: createStats(catalog.map((entry) => entry.loudness.loudnessRangeLu)),
  },
  cohortRule: 'Integrated LUFS between -15.5 and -11.5, and true peak at or below -2.0 dBTP.',
  referenceBand: {
    integratedLUFS: {
      min: createStats(cohort.map((entry) => entry.loudness.integratedLUFS)).min,
      max: createStats(cohort.map((entry) => entry.loudness.integratedLUFS)).max,
      target: createStats(cohort.map((entry) => entry.loudness.integratedLUFS)).avg,
    },
    truePeakDbtp: {
      min: createStats(cohort.map((entry) => entry.loudness.truePeakDbtp)).min,
      max: createStats(cohort.map((entry) => entry.loudness.truePeakDbtp)).max,
      target: createStats(cohort.map((entry) => entry.loudness.truePeakDbtp)).avg,
    },
    loudnessRangeLu: {
      min: createStats(cohort.map((entry) => entry.loudness.loudnessRangeLu)).min,
      max: createStats(cohort.map((entry) => entry.loudness.loudnessRangeLu)).max,
      target: createStats(cohort.map((entry) => entry.loudness.loudnessRangeLu)).avg,
    },
  },
  cohortTrackCount: cohort.length,
  outliers,
  catalog: catalog.map((entry) => ({
    file: entry.file,
    durationSec: Number(entry.technical.durationSec.toFixed(3)),
    sampleRate: entry.technical.sampleRate,
    channelCount: entry.technical.channelCount,
    bitsPerSample: entry.technical.bitsPerSample,
    integratedLUFS: entry.loudness.integratedLUFS,
    truePeakDbtp: entry.loudness.truePeakDbtp,
    loudnessRangeLu: entry.loudness.loudnessRangeLu,
    thresholdDb: entry.loudness.thresholdDb,
  })),
};

fs.mkdirSync(path.dirname(outputFile), { recursive: true });
fs.writeFileSync(outputFile, `${JSON.stringify(profile, null, 2)}\n`, 'utf8');

console.log(JSON.stringify({ outputFile, trackCount: profile.trackCount, cohortTrackCount: profile.cohortTrackCount }, null, 2));
