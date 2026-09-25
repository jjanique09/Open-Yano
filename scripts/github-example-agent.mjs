#!/usr/bin/env node
/**
 * Minimal example "agent" for GitHub Actions: collect repo context, run lint, write a report.
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const task = process.env.AGENT_TASK ?? 'health-check';
const eventName = process.env.GITHUB_EVENT_NAME ?? 'local';
const runId = process.env.GITHUB_RUN_ID ?? 'local';
const sha = process.env.GITHUB_SHA ?? 'unknown';

const steps = [];

function step(name, fn) {
  steps.push({ name, status: 'running', at: new Date().toISOString() });
  const index = steps.length - 1;
  try {
    const detail = fn();
    steps[index].status = 'ok';
    steps[index].detail = detail ?? null;
  } catch (error) {
    steps[index].status = 'failed';
    steps[index].detail = error instanceof Error ? error.message : String(error);
    throw error;
  }
}

function countFiles(dir, acc = { ts: 0, tsx: 0 }) {
  if (!fs.existsSync(dir)) return acc;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) countFiles(full, acc);
    else if (entry.name.endsWith('.ts')) acc.ts += 1;
    else if (entry.name.endsWith('.tsx')) acc.tsx += 1;
  }
  return acc;
}

console.log(`Example GitHub Agent — task: ${task}, event: ${eventName}`);

step('collect-context', () => {
  const counts = countFiles(process.cwd());
  return {
    package: JSON.parse(fs.readFileSync('package.json', 'utf8')).name,
    typescriptFiles: counts.ts + counts.tsx,
  };
});

step('run-lint', () => {
  execSync('npm run lint', { stdio: 'pipe', encoding: 'utf8' });
  return 'eslint completed (warnings allowed)';
});

const report = {
  agent: 'example-github-agent',
  version: 1,
  task,
  eventName,
  runId,
  sha: sha.slice(0, 7),
  finishedAt: new Date().toISOString(),
  steps,
  summary: 'Example agent finished: context collected and lint ran successfully.',
};

fs.writeFileSync('agent-report.json', JSON.stringify(report, null, 2));
console.log('Wrote agent-report.json');

const summaryPath = process.env.GITHUB_STEP_SUMMARY;
if (summaryPath) {
  const lines = [
    '## Example GitHub Agent',
    '',
    `**Task:** \`${task}\` · **Commit:** \`${report.sha}\``,
    '',
    '| Step | Status |',
    '| --- | --- |',
    ...steps.map((s) => `| ${s.name} | ${s.status} |`),
    '',
    report.summary,
  ];
  fs.appendFileSync(summaryPath, lines.join('\n'));
}
