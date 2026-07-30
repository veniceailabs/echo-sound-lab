import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const projectRoot = process.cwd();
const targetDir = path.resolve(
  process.argv[2] || path.join(os.tmpdir(), `echo-sound-lab-deploy-snapshot-${Date.now()}`)
);

const includeEntries = [
  'action-authority',
  'api',
  'assets',
  'config',
  'public',
  'src',
  '.vercel/project.json',
  'index.css',
  'index.html',
  'index.tsx',
  'metadata.json',
  'package-lock.json',
  'package.json',
  'postcss.config.cjs',
  'tailwind.config.cjs',
  'tsconfig.json',
  'vercel.json',
  'vite.config.ts',
];

fs.rmSync(targetDir, { recursive: true, force: true });
fs.mkdirSync(targetDir, { recursive: true });

for (const entry of includeEntries) {
  const source = path.join(projectRoot, entry);
  if (!fs.existsSync(source)) continue;
  const destination = path.join(targetDir, entry);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.cpSync(source, destination, { recursive: true });
}

const manifest = {
  createdAt: new Date().toISOString(),
  sourceProjectRoot: projectRoot,
  targetDir,
  included: includeEntries.filter((entry) => fs.existsSync(path.join(projectRoot, entry))),
};

fs.writeFileSync(
  path.join(targetDir, 'deploy-snapshot.manifest.json'),
  `${JSON.stringify(manifest, null, 2)}\n`,
  'utf8'
);

console.log(JSON.stringify(manifest, null, 2));
