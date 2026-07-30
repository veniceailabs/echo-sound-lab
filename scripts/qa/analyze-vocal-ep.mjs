import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const ENGINEERS = [
  { name: 'Bob Ludwig',       era: '1990s–present',  lufsRef: -13.5, knownFor: 'Nirvana, Daft Punk, Taylor Swift' },
  { name: 'Tom Lord-Alge',    era: '1985–present',   lufsRef: -12.5, knownFor: 'Green Day, Blink-182, Dave Matthews' },
  { name: 'Chris Lord-Alge',  era: '1985–present',   lufsRef: -12.0, knownFor: 'U2, Muse, Rob Zombie' },
  { name: 'Serban Ghenea',    era: '2000–present',   lufsRef: -9.5,  knownFor: 'Taylor Swift, Justin Timberlake, One Direction' },
  { name: 'Dr. Dre',          era: '1988–present',   lufsRef: -14.0, knownFor: 'Chronic, 2001, Compton' },
  { name: 'Manny Marroquin',  era: '2000–present',   lufsRef: -11.0, knownFor: 'Kanye West, Rihanna, Maroon 5' },
  { name: 'Chris Athens',     era: '1999–present',   lufsRef: -10.5, knownFor: 'Eminem, Jay-Z, 50 Cent' },
  { name: 'Mike Dean',        era: '1993–present',   lufsRef: -13.0, knownFor: 'Kanye West, Travis Scott, 2Pac' },
  { name: 'Young Guru',       era: '2001–present',   lufsRef: -14.5, knownFor: 'Jay-Z (all albums)' },
  { name: 'Dave Pensado',     era: '1990–present',   lufsRef: -11.5, knownFor: 'Beyoncé, Christina Aguilera, Black Eyed Peas' },
  { name: 'Tony Maserati',    era: '1993–present',   lufsRef: -11.0, knownFor: 'Beyoncé, Alicia Keys, Jay-Z' },
  { name: 'Jaycen Joshua',    era: '2005–present',   lufsRef: -12.0, knownFor: 'Beyoncé, Drake, Bruno Mars' },
  { name: 'Randy Staub',      era: '1985–present',   lufsRef: -13.0, knownFor: 'Metallica, Nickelback, Bon Jovi' },
  { name: 'Brian "Big Bass" Gardner', era: '1988–present', lufsRef: -10.0, knownFor: 'Kendrick Lamar, YG, Problem' },
  { name: 'Noah "40" Shebib', era: '2009–present',   lufsRef: -15.0, knownFor: 'Drake (all albums)' },
];

const inputDir = process.argv[2];

if (!inputDir) {
  console.error('Usage: node scripts/qa/analyze-vocal-ep.mjs "/absolute/path/to/audio-folder"');
  process.exit(1);
}

const resolvedDir = path.resolve(inputDir);
if (!fs.existsSync(resolvedDir)) {
  console.error(`Input folder not found: ${resolvedDir}`);
  process.exit(1);
}

const audioFiles = fs.readdirSync(resolvedDir)
  .filter((entry) => /\.(mp3|wav|flac|m4a|aac|ogg)$/i.test(entry))
  .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));

if (audioFiles.length === 0) {
  console.error(`No audio files found in ${resolvedDir}`);
  process.exit(1);
}

function parseLoudnormJson(output) {
  const match = output.match(/\{\s*"input_i"[\s\S]*?\}/m);
  if (!match) {
    throw new Error('Unable to parse loudnorm JSON output.');
  }
  return JSON.parse(match[0]);
}

function parseAstats(output) {
  const peakMatch = output.match(/Peak level dB:\s*(-?\d+(?:\.\d+)?)/);
  const rmsMatch = output.match(/RMS level dB:\s*(-?\d+(?:\.\d+)?)/);
  const crestMatch = output.match(/Crest factor:\s*(-?\d+(?:\.\d+)?)/);
  if (!peakMatch || !rmsMatch) {
    throw new Error('Unable to parse astats output.');
  }

  return {
    peakLevelDb: Number.parseFloat(peakMatch[1]),
    rmsLevelDb: Number.parseFloat(rmsMatch[1]),
    crestFactorDb: crestMatch ? Number.parseFloat(crestMatch[1]) : Number.parseFloat(peakMatch[1]) - Number.parseFloat(rmsMatch[1]),
  };
}

function analyzeFile(filePath) {
  const loudnormRun = spawnSync(
    'ffmpeg',
    [
      '-hide_banner',
      '-nostats',
      '-i',
      filePath,
      '-af',
      'loudnorm=I=-14:TP=-1.0:LRA=7:print_format=json',
      '-f',
      'null',
      '-',
    ],
    { encoding: 'utf8' }
  );

  const astatsRun = spawnSync(
    'ffmpeg',
    [
      '-hide_banner',
      '-nostats',
      '-i',
      filePath,
      '-af',
      'astats=metadata=1:reset=0:measure_overall=1',
      '-f',
      'null',
      '-',
    ],
    { encoding: 'utf8' }
  );

  const loudnormOutput = `${loudnormRun.stdout || ''}\n${loudnormRun.stderr || ''}`;
  const astatsOutput = `${astatsRun.stdout || ''}\n${astatsRun.stderr || ''}`;

  if (loudnormRun.status !== 0) {
    throw new Error(`ffmpeg loudness analysis failed for ${filePath}`);
  }
  if (astatsRun.status !== 0) {
    throw new Error(`ffmpeg astats analysis failed for ${filePath}`);
  }

  const loudnorm = parseLoudnormJson(loudnormOutput);
  const astats = parseAstats(astatsOutput);

  return {
    fileName: path.basename(filePath),
    integratedLufs: Number.parseFloat(loudnorm.input_i),
    truePeakDbtp: Number.parseFloat(loudnorm.input_tp),
    loudnessRangeLu: Number.parseFloat(loudnorm.input_lra),
    crestFactorDb: astats.crestFactorDb,
    peakLevelDb: astats.peakLevelDb,
    rmsLevelDb: astats.rmsLevelDb,
  };
}

function summarize(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const sum = sorted.reduce((acc, value) => acc + value, 0);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  const variance = sorted.reduce((acc, value) => acc + (value - (sum / sorted.length)) ** 2, 0) / sorted.length;

  return {
    min: sorted[0],
    max: sorted[sorted.length - 1],
    avg: sum / sorted.length,
    median,
    stdDev: Math.sqrt(variance),
  };
}

function scoreEngineers(lufs, crest) {
  return [...ENGINEERS]
    .map((engineer) => {
      const lufsDiff = Math.abs(lufs - engineer.lufsRef);
      const matchPct = Math.max(0, 100 - (lufsDiff * 5) - (Math.abs(crest - 10) * 3));
      return { ...engineer, matchPct: Math.round(matchPct) };
    })
    .sort((a, b) => b.matchPct - a.matchPct);
}

function classifyCohesion(summary) {
  const loudnessSpread = summary.integratedLufs.max - summary.integratedLufs.min;
  const crestSpread = summary.crestFactorDb.max - summary.crestFactorDb.min;

  if (loudnessSpread <= 2 && crestSpread <= 4) return 'tight';
  if (loudnessSpread <= 4 && crestSpread <= 6) return 'cohesive';
  return 'uneven';
}

const tracks = audioFiles.map((fileName) => analyzeFile(path.join(resolvedDir, fileName)));

const summary = {
  integratedLufs: summarize(tracks.map((track) => track.integratedLufs)),
  truePeakDbtp: summarize(tracks.map((track) => track.truePeakDbtp)),
  loudnessRangeLu: summarize(tracks.map((track) => track.loudnessRangeLu)),
  crestFactorDb: summarize(tracks.map((track) => track.crestFactorDb)),
};

const epCohesion = classifyCohesion(summary);
const engineerRankings = scoreEngineers(summary.integratedLufs.median, summary.crestFactorDb.median).slice(0, 6);

const report = {
  sourceFolder: resolvedDir,
  analyzedAt: new Date().toISOString(),
  trackCount: tracks.length,
  tracks,
  summary,
  epCohesion,
  engineerRankings,
  notes: [
    'This report uses the same LUFS-vs-crest engineer scoring heuristic as the repo mastering service.',
    'True peak is taken from ffmpeg loudnorm output; crest factor is taken from ffmpeg astats.',
  ],
};

const artifactsDir = path.resolve(process.cwd(), 'artifacts', 'qa');
fs.mkdirSync(artifactsDir, { recursive: true });
const slug = path.basename(resolvedDir).replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'audio-ep';
const outputPath = path.join(artifactsDir, `vocal-ep-report-${slug}.json`);
fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

console.log(JSON.stringify({
  outputPath,
  trackCount: report.trackCount,
  epCohesion: report.epCohesion,
  summary: report.summary,
  engineerRankings: report.engineerRankings,
}, null, 2));
