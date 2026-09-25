#!/usr/bin/env node
import fs from 'node:fs';
import {
  formatJobsMarkdown,
  searchRemoteHollandJobs,
} from '../lib/indeed-remote-holland.mjs';

const query = process.env.INDEED_QUERY ?? 'remote';
const location = process.env.INDEED_LOCATION ?? 'Nederland';
const maxJobs = Number(process.env.INDEED_MAX_JOBS ?? '25', 10);
const firecrawlApiKey = process.env.FIRECRAWL_API_KEY || null;

console.log(`Holland remote jobs agent — q="${query}" l="${location}" max=${maxJobs}`);

const report = await searchRemoteHollandJobs({
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
console.log(`Indeed search: ${report.indeedSearchUrl}`);

const summaryPath = process.env.GITHUB_STEP_SUMMARY;
if (summaryPath) {
  const preview = report.jobs
    .slice(0, 10)
    .map((j, i) => `${i + 1}. [${j.title}](${j.url}) (${j.source})`)
    .join('\n');
  fs.appendFileSync(
    summaryPath,
    [
      '## Remote jobs — Netherlands',
      '',
      `**Jobs:** ${report.jobCount} · **Query:** \`${query}\` · **Location:** \`${location}\``,
      '',
      `[Open Indeed search](${report.indeedSearchUrl})`,
      '',
      preview || '_No jobs from feeds._',
      '',
      report.jobCount > 10 ? `_…and ${report.jobCount - 10} more in the artifact._` : '',
    ].join('\n'),
  );
}

if (report.jobCount === 0) {
  console.warn('No jobs returned from feeds.');
  process.exitCode = 1;
}
