const INDEED_NL_ORIGIN = 'https://nl.indeed.com';

/**
 * Build an Indeed Netherlands search URL for remote-friendly roles.
 */
export function buildIndeedHollandRemoteSearchUrl({
  query = 'remote',
  location = 'Nederland',
  sort = 'date',
  start = 0,
} = {}) {
  const params = new URLSearchParams();
  if (query) params.set('q', query);
  if (location) params.set('l', location);
  if (sort) params.set('sort', sort);
  if (start > 0) params.set('start', String(start));
  return `${INDEED_NL_ORIGIN}/jobs?${params.toString()}`;
}

export async function scrapeIndeedSearchPage(url, firecrawlApiKey) {
  const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${firecrawlApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      url,
      formats: ['markdown', 'html'],
      waitFor: 4000,
      timeout: 60000,
      blockAds: true,
      maxAge: 3600000,
      actions: [{ type: 'wait', milliseconds: 2500 }],
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Firecrawl scrape failed (${response.status}): ${text.slice(0, 500)}`);
  }

  const payload = await response.json();
  if (!payload.success || !payload.data) {
    throw new Error('Firecrawl returned no page data for Indeed');
  }

  return {
    markdown: payload.data.markdown ?? '',
    html: payload.data.html ?? '',
    metadata: payload.data.metadata ?? {},
    sourceUrl: url,
  };
}

function absoluteIndeedUrl(href) {
  if (!href) return null;
  if (href.startsWith('http')) return href.split('&')[0].replace(/&amp;/g, '&');
  const path = href.startsWith('/') ? href : `/${href}`;
  return `${INDEED_NL_ORIGIN}${path.split('&')[0]}`;
}

/**
 * Parse job listings from Indeed HTML / markdown (best-effort).
 */
export function parseIndeedJobListings({ html = '', markdown = '' }) {
  const byKey = new Map();

  const register = (jobKey, partial) => {
    if (!jobKey) return;
    const existing = byKey.get(jobKey) ?? { jobKey };
    byKey.set(jobKey, {
      ...existing,
      ...partial,
      jobKey,
      url:
        partial.url ??
        existing.url ??
        `${INDEED_NL_ORIGIN}/viewjob?jk=${jobKey}`,
    });
  };

  for (const match of html.matchAll(/data-jk="([a-f0-9]{16})"/gi)) {
    register(match[1], {});
  }

  for (const match of html.matchAll(
    /<a[^>]+href="(\/viewjob\?jk=([a-f0-9]{16})[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi,
  )) {
    const title = match[3].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    register(match[2], { url: absoluteIndeedUrl(match[1]), title: title || undefined });
  }

  for (const match of markdown.matchAll(
    /\[([^\]]+)\]\((https:\/\/nl\.indeed\.com\/viewjob\?jk=([a-f0-9]{16})[^)]*)\)/gi,
  )) {
    register(match[3], { title: match[1].trim(), url: match[2] });
  }

  for (const match of markdown.matchAll(
    /\[([^\]]+)\]\((\/viewjob\?jk=([a-f0-9]{16})[^)]*)\)/gi,
  )) {
    register(match[3], { title: match[1].trim(), url: absoluteIndeedUrl(match[2]) });
  }

  const jobs = [...byKey.values()]
    .filter((job) => job.title && job.title.length > 2)
    .map((job) => ({
      ...job,
      title: job.title.replace(/\*\*/g, '').trim(),
      remoteHint: inferRemoteHint(job.title),
    }));

  return dedupeByUrl(jobs);
}

function inferRemoteHint(title) {
  return /remote|thuiswerk|hybride|work from home|op afstand/i.test(title);
}

function dedupeByUrl(jobs) {
  const seen = new Set();
  return jobs.filter((job) => {
    const key = job.jobKey ?? job.url;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function searchIndeedRemoteHolland({
  firecrawlApiKey,
  query = 'remote',
  location = 'Nederland',
  maxJobs = 25,
  maxPages = 3,
}) {
  const collected = [];
  const pagesScraped = [];

  for (let page = 0; page < maxPages && collected.length < maxJobs; page += 1) {
    const start = page * 10;
    const url = buildIndeedHollandRemoteSearchUrl({ query, location, start });
    const pageData = await scrapeIndeedSearchPage(url, firecrawlApiKey);
    const jobs = parseIndeedJobListings(pageData);
    pagesScraped.push({ url, jobCount: jobs.length, title: pageData.metadata?.title ?? null });

    for (const job of jobs) {
      if (collected.length >= maxJobs) break;
      if (!collected.some((j) => j.jobKey === job.jobKey)) {
        collected.push({ ...job, sourceSearchUrl: url });
      }
    }

    if (jobs.length === 0) break;
  }

  return {
    searchedAt: new Date().toISOString(),
    query,
    location,
    focus: 'remote positions in the Netherlands (via nl.indeed.com)',
    pagesScraped,
    jobCount: collected.length,
    jobs: collected,
  };
}

export function formatJobsMarkdown(report) {
  const lines = [
    `# Indeed remote jobs — Netherlands`,
    '',
    `**Query:** \`${report.query}\` · **Location:** \`${report.location}\``,
    `**Scraped:** ${report.searchedAt} · **Jobs found:** ${report.jobCount}`,
    '',
  ];

  if (report.jobs.length === 0) {
    lines.push('_No listings parsed. Indeed may have changed markup or blocked the scrape._');
    return lines.join('\n');
  }

  report.jobs.forEach((job, index) => {
    lines.push(`## ${index + 1}. ${job.title}`);
    lines.push(`- **URL:** ${job.url}`);
    if (job.remoteHint) lines.push('- **Remote hint:** likely remote/hybrid/thuiswerk in title');
    lines.push('');
  });

  return lines.join('\n');
}
