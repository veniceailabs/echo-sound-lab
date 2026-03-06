const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

function getGitCommit() {
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return '';
  }
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

function writeTs(filePath, meta) {
  const source = `export const APP_BUILD_META = ${JSON.stringify(meta, null, 2)} as const;\n` +
    `export type AppBuildMeta = typeof APP_BUILD_META;\n`;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, source, 'utf8');
}

function main() {
  const repoRoot = path.resolve(__dirname, '..');
  const packageJsonPath = path.join(repoRoot, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

  const buildStamp = new Date().toISOString();
  const commit = getGitCommit();
  const nonce = crypto.randomBytes(3).toString('hex');
  const buildId = `${Date.now()}-${commit || nonce}`;

  const meta = {
    appName: pkg.productName || 'Echo Sound Lab',
    packageName: pkg.name,
    version: pkg.version,
    buildId,
    createdAt: buildStamp,
  };

  writeJson(path.join(repoRoot, 'public', 'build-meta.json'), meta);
  writeTs(path.join(repoRoot, 'src', 'generated', 'buildMeta.ts'), meta);

  // eslint-disable-next-line no-console
  console.log(`[build-meta] ${meta.buildId}`);
}

main();
