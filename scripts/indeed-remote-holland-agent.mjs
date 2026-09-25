#!/usr/bin/env node
import fs from 'node:fs';
import {
  formatJobsMarkdown,
  searchIndeedRemoteHolland,
} from '../lib/indeed-remote-holland.mjs';

const firecrawlApiKey = process.env.FIRECRAWL_API_KEY;
if (!firecrawlApiKey) {
  console.error(
    'FIRECRAWL_API_KEY is required. Add it to repo secrets for GitHub Actions or .env.local locally.',
  );
  process.exit(1);
}

const query = process.env.INDEED_QUERY ?? 'remote';
const location = process.env.INDEED_LOCATION ?? 'Nederland';
const maxJobs = Number(process.env.INDEED_MAX_JOBS ?? '25', 10);

console.log(`Indeed Holland remote agent — q="${query}" l="${location}" max=${maxJobs}`);

const report = await searchIndeedRemoteHolland({
  firecrawlApiKey,
  query,
  location,
  maxJobs,
});

const jsonPath = 'indeed-remote-holland.json';
const mdPath = 'indeed-remote-holland.md';

fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));
fs.writeFileSync(mdPath, formatJobsMarkdown(report));

console.log(`Wrote ${jsonPath} (${report.jobCount} jobs) and ${mdPath}`);

const summaryPath = process.env.GITHUB_STEP_SUMMARY;
if (summaryPath) {
  const preview = report.jobs
    .slice(0, 10)
    .map((j, i) => `${i + 1}. [${j.title}](${j.url})`)
    .join('\n');
  fs.appendFileSync(
    summaryPath,
    [
      '## Indeed remote jobs — Netherlands',
      '',
      `**Jobs:** ${report.jobCount} · **Query:** \`${query}\` · **Location:** \`${location}\``,
      '',
      preview || '_No jobs parsed._',
      '',
      report.jobCount > 10 ? `_…and ${report.jobCount - 10} more in the artifact._` : '',
    ].join('\n'),
  );
}

if (report.jobCount === 0) {
  console.warn('Agent finished but parsed 0 jobs — check Firecrawl output / Indeed markup.');
  process.exitCode = 2;
}
