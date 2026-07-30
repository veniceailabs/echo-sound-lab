import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const PROJECT_ROOT = process.cwd();
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const explicitOutput = process.argv[2];
const outputDir = path.resolve(
  explicitOutput || path.join(PROJECT_ROOT, 'artifacts', 'deploy', `vercel-cleanroom-${timestamp}`)
);

const includePaths = [
  '.vercel/project.json',
  '.env.example',
  'api',
  'action-authority',
  'config',
  'index.css',
  'index.html',
  'index.tsx',
  'package-lock.json',
  'package.json',
  'paper_perfector_demo_hybrid.json',
  'master_lease_demo_hybrid.json',
  'data_blaster_demo_hybrid.json',
  'echo_sound_lab_demo_hybrid.json',
  'postcss.config.cjs',
  'public',
  'scripts/qa',
  'src',
  'tailwind.config.cjs',
  'tsconfig.json',
  'vercel.json',
  'vite.config.ts',
];

const exclusionMatchers = [
  /(^|\/)\.DS_Store$/,
  /(^|\/)node_modules(\/|$)/,
  /(^|\/)dist(\/|$)/,
  /(^|\/)artifacts(\/|$)/,
  /(^|\/)test-results(\/|$)/,
  /(^|\/)__pycache__(\/|$)/,
  /(^|\/)\.vercel\/output(\/|$)/,
  /(^|\/)\.vercel\/\.env\.production\.local$/,
  /(^|\/)\.env\.local$/,
];

function shouldExclude(relativePath) {
  return exclusionMatchers.some((pattern) => pattern.test(relativePath));
}

function ensureParentDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function copyRecursive(relativePath) {
  if (shouldExclude(relativePath)) {
    return;
  }

  const sourcePath = path.join(PROJECT_ROOT, relativePath);
  if (!fs.existsSync(sourcePath)) {
    return;
  }

  const destinationPath = path.join(outputDir, relativePath);
  const stats = fs.statSync(sourcePath);

  if (stats.isDirectory()) {
    fs.mkdirSync(destinationPath, { recursive: true });
    for (const entry of fs.readdirSync(sourcePath)) {
      copyRecursive(path.join(relativePath, entry));
    }
    return;
  }

  ensureParentDir(destinationPath);
  fs.copyFileSync(sourcePath, destinationPath);
}

fs.mkdirSync(outputDir, { recursive: true });

for (const includePath of includePaths) {
  copyRecursive(includePath);
}

const manifest = {
  generatedAt: new Date().toISOString(),
  sourceRoot: PROJECT_ROOT,
  outputDir,
  includePaths,
  excludedPatterns: exclusionMatchers.map((pattern) => pattern.toString()),
  notes: [
    'Snapshot is intentionally narrower than the dirty workspace.',
    'Local-only secrets such as .env.local and .vercel/.env.production.local are excluded.',
    'Use the project-linked .vercel/project.json so vercel deploy can target the existing project safely.',
  ],
};

const manifestPath = path.join(outputDir, 'snapshot-manifest.json');
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');

console.log(JSON.stringify({ outputDir, manifestPath }, null, 2));
