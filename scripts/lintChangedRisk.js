#!/usr/bin/env node

const { execSync, spawnSync } = require('child_process');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const frontendRoot = path.join(repoRoot, 'frontend');

const runGit = (cmd) =>
  execSync(cmd, { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

const getChangedFrontendFiles = () => {
  const eventName = process.env.GITHUB_EVENT_NAME;
  const beforeSha = process.env.GITHUB_EVENT_BEFORE;
  const currentSha = process.env.GITHUB_SHA || 'HEAD';

  let diffRange;
  if (eventName === 'pull_request' && process.env.GITHUB_BASE_REF) {
    const baseRef = `origin/${process.env.GITHUB_BASE_REF}`;
    let mergeBase;
    try {
      mergeBase = runGit(`git merge-base ${baseRef} ${currentSha}`);
    } catch {
      mergeBase = runGit('git rev-parse HEAD~1');
    }
    diffRange = `${mergeBase}...${currentSha}`;
  } else if (eventName === 'push' && beforeSha && beforeSha !== '0000000000000000000000000000000000000000') {
    diffRange = `${beforeSha}...${currentSha}`;
  } else {
    diffRange = null;
  }

  const output = diffRange
    ? runGit(`git diff --name-only --diff-filter=ACMRT ${diffRange}`)
    : runGit('git diff --name-only --diff-filter=ACMRT');
  if (!output) return [];

  return output
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((file) => file.startsWith('frontend/src/') && /\.(js|jsx)$/.test(file))
    .map((file) => file.replace(/^frontend\//, ''));
};

const changedFiles = getChangedFrontendFiles();

if (changedFiles.length === 0) {
  console.log('No changed frontend JS/JSX files detected. Risk lint gate skipped.');
  process.exit(0);
}

console.log(`Running risk lint gate on ${changedFiles.length} changed frontend files...`);

const npmExec = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const lintArgs = [
  'eslint',
  '--max-warnings=0',
  '--rule',
  'no-undef:error',
  '--rule',
  'no-unused-vars:error',
  ...changedFiles,
];

const result = spawnSync(npmExec, lintArgs, {
  cwd: frontendRoot,
  stdio: 'inherit',
});

if (result.status !== 0) {
  process.exit(result.status || 1);
}

console.log('Risk lint gate passed.');
