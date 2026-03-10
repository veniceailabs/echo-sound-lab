#!/usr/bin/env node

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const cwd = process.cwd();

const BINARY_EXTENSIONS = new Set([
  '.7z', '.avi', '.bin', '.bmp', '.class', '.dll', '.dylib', '.exe', '.gif', '.gz', '.ico', '.jar', '.jpeg',
  '.jpg', '.lockb', '.mov', '.mp3', '.mp4', '.o', '.ogg', '.otf', '.pdf', '.png', '.pyc', '.so', '.svgz',
  '.tar', '.ttf', '.wav', '.webm', '.webp', '.woff', '.woff2', '.zip',
]);

const EXCLUDED_PREFIXES = [
  'archive/',
  'dist/',
  'echo-bridge/venv/',
  'node_modules/',
  'test-results/',
];

const BANNED_VITE_SECRET_VARS = [
  'VITE_GEMINI_API_KEY',
  'VITE_SUNO_API_KEY',
  'VITE_VOICE_API_KEY',
  'VITE_VOICE_TOKEN',
  'VITE_VOICE_SECRET',
  'VITE_ANIMATE_ART_API_KEY',
  'VITE_ANIMATE_ART_TOKEN',
  'VITE_ANIMATE_ART_SECRET',
  'VITE_ELEVENLABS_API_KEY',
  'VITE_ELEVENLABS_TOKEN',
  'VITE_ELEVENLABS_SECRET',
  'VITE_OPENAI_API_KEY',
  'VITE_OPENAI_TOKEN',
  'VITE_OPENAI_SECRET',
  'VITE_MINIMAX_API_KEY',
  'VITE_MINIMAX_TOKEN',
  'VITE_MINIMAX_SECRET',
];

const BANNED_ENV_ENFORCED_PREFIXES = [
  'api/',
  'scripts/',
  'src/',
  'tests/',
  '.github/workflows/',
];

const BANNED_ENV_ENFORCED_FILES = new Set([
  'index.tsx',
  'package.json',
  'playwright.config.ts',
  'vercel.json',
  'vite.config.cjs',
  'vite.config.js',
  'vite.config.mjs',
  'vite.config.ts',
  'vitest.config.ts',
]);

const DETECTION_RULES = [
  {
    id: 'private-key',
    message: 'Private key material detected',
    regex: /-----BEGIN (?:[A-Z ]+)?PRIVATE KEY-----/,
  },
  {
    id: 'aws-access-key',
    message: 'AWS access key detected',
    regex: /\bAKIA[0-9A-Z]{16}\b/,
  },
  {
    id: 'google-api-key',
    message: 'Google API key detected',
    regex: /\bAIza[0-9A-Za-z_-]{35}\b/,
  },
  {
    id: 'github-token',
    message: 'GitHub token detected',
    regex: /\bgh[pousr]_[A-Za-z0-9_]{36,}\b/,
  },
  {
    id: 'openai-key',
    message: 'OpenAI API key detected',
    regex: /\bsk-[A-Za-z0-9]{20,}\b/,
  },
];

function isExcluded(filePath) {
  if (EXCLUDED_PREFIXES.some(prefix => filePath.startsWith(prefix))) {
    return true;
  }
  const extension = path.extname(filePath).toLowerCase();
  return BINARY_EXTENSIONS.has(extension);
}

function isLikelyText(buffer) {
  const maxCheck = Math.min(buffer.length, 4096);
  for (let i = 0; i < maxCheck; i += 1) {
    if (buffer[i] === 0) {
      return false;
    }
  }
  return true;
}

function listTrackedFiles() {
  const output = execSync('git ls-files -z', { cwd, encoding: 'buffer' });
  return output
    .toString('utf8')
    .split('\u0000')
    .filter(Boolean)
    .filter(file => !isExcluded(file));
}

function normalizeLinePreview(line) {
  const clean = line.trim().replace(/\s+/g, ' ');
  return clean.length <= 140 ? clean : `${clean.slice(0, 137)}...`;
}

function shouldEnforceBannedEnvVars(filePath) {
  return BANNED_ENV_ENFORCED_FILES.has(filePath) ||
    BANNED_ENV_ENFORCED_PREFIXES.some(prefix => filePath.startsWith(prefix));
}

function scanFile(filePath) {
  const absolutePath = path.join(cwd, filePath);
  const fileBuffer = fs.readFileSync(absolutePath);
  if (!isLikelyText(fileBuffer)) {
    return [];
  }

  const content = fileBuffer.toString('utf8');
  const lines = content.split(/\r?\n/);
  const findings = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    for (const rule of DETECTION_RULES) {
      const match = line.match(rule.regex);
      if (!match) continue;
      findings.push({
        filePath,
        lineNumber: index + 1,
        ruleId: rule.id,
        message: rule.message,
        preview: normalizeLinePreview(line),
      });
    }

    if (shouldEnforceBannedEnvVars(filePath)) {
      for (const envVar of BANNED_VITE_SECRET_VARS) {
        if (!line.includes(envVar)) continue;
        findings.push({
          filePath,
          lineNumber: index + 1,
          ruleId: 'banned-vite-secret-var',
          message: `Banned client secret env var reference: ${envVar}`,
          preview: normalizeLinePreview(line),
        });
      }
    }
  }

  if (/^vite\.config\.[cm]?[jt]sx?$/.test(path.basename(filePath))) {
    const viteSecrets = [
      'GEMINI',
      'SUNO',
      'VOICE',
      'ANIMATE_ART',
      'ELEVENLABS',
      'OPENAI',
      'MINIMAX',
    ];

    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      for (const provider of viteSecrets) {
        const envKeyPattern = new RegExp(`process\\.env\\.${provider}(?:_[A-Z0-9_]+)?`);
        const defineKeyPattern = new RegExp(`['"]process\\.env\\.${provider}(?:_[A-Z0-9_]+)?['"]`);
        if (!envKeyPattern.test(line) && !defineKeyPattern.test(line)) continue;

        findings.push({
          filePath,
          lineNumber: index + 1,
          ruleId: 'vite-env-injection',
          message: `Potential client env injection in Vite config for ${provider}`,
          preview: normalizeLinePreview(line),
        });
      }
    }
  }

  return findings;
}

function main() {
  const files = listTrackedFiles();
  const findings = [];

  for (const filePath of files) {
    const fileFindings = scanFile(filePath);
    if (fileFindings.length > 0) {
      findings.push(...fileFindings);
    }
  }

  if (findings.length > 0) {
    console.error(`Secret scan failed with ${findings.length} finding(s).`);
    for (const finding of findings) {
      console.error(`- [${finding.ruleId}] ${finding.filePath}:${finding.lineNumber} ${finding.message}`);
      console.error(`  ${finding.preview}`);
    }
    process.exit(1);
  }

  console.log(`Secret scan passed. Scanned ${files.length} tracked text file(s).`);
}

main();
