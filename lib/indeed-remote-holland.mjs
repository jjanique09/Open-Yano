const INDEED_NL_ORIGIN = 'https://nl.indeed.com';

const NL_HINT =
  /netherlands|nederland|\bholland\b|amsterdam|rotterdam|utrecht|den haag|'s-?gravenhage|eindhoven|groningen|tilburg|breda|nijmegen|maastricht|leeuwarden|haarlem|almere|zwolle|delft|leiden|enschede|hilversum|europe|\beu\b|worldwide|anywhere|global|emea|dach|benelux/i;

const USA_ONLY = /\b(united states|usa only|us only|u\.s\. only)\b/i;

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

function inferRemoteHint(text = '') {
  return /remote|thuiswerk|hybride|work from home|op afstand/i.test(text);
}

function dedupeByUrl(jobs) {
  const seen = new Set();
  return jobs.filter((job) => {
    const key = job.jobKey ?? job.url ?? `${job.title}-${job.company}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function matchesHollandRemote({ title = '', company = '', location = '', description = '' }) {
  const blob = `${title} ${company} ${location} ${description}`;
  if (USA_ONLY.test(blob) && !NL_HINT.test(blob)) return false;
  return NL_HINT.test(blob) || inferRemoteHint(blob);
}

function normalizeJob(partial) {
  return {
    title: partial.title?.trim(),
    company: partial.company?.trim() || null,
    url: partial.url,
    source: partial.source,
    location: partial.location?.trim() || null,
    remoteHint: inferRemoteHint(`${partial.title} ${partial.location} ${partial.description ?? ''}`),
  };
}

async function fetchJobicyNetherlands(maxJobs) {
  const url = `https://jobicy.com/api/v2/remote-jobs?count=${Math.min(maxJobs, 50)}&geo=netherlands`;
  const response = await fetch(url, {
    headers: { Accept: 'application/json', 'User-Agent': 'Open-Yano-Job-Agent/1.0' },
  });
  if (!response.ok) throw new Error(`Jobicy API ${response.status}`);
  const data = await response.json();
  return (data.jobs ?? []).map((job) =>
    normalizeJob({
      title: job.jobTitle,
      company: job.companyName,
      url: job.url,
      source: 'jobicy',
      location: job.jobGeo ?? 'Netherlands',
    }),
  );
}

async function fetchRemoteOkNetherlands(maxJobs) {
  const response = await fetch('https://remoteok.com/api', {
    headers: { Accept: 'application/json', 'User-Agent': 'Open-Yano-Job-Agent/1.0' },
  });
  if (!response.ok) throw new Error(`RemoteOK API ${response.status}`);
  const data = await response.json();
  const rows = data.filter((row) => row && row.id && row.url);
  return rows
    .filter((row) =>
      matchesHollandRemote({
        title: row.position,
        company: row.company,
        location: row.location,
        description: row.description,
      }),
    )
    .slice(0, maxJobs)
    .map((row) =>
      normalizeJob({
        title: row.position,
        company: row.company,
        url: row.url,
        source: 'remoteok',
        location: row.location || 'Remote',
      }),
    );
}

async function fetchRemotiveNetherlands(maxJobs) {
  const response = await fetch('https://remotive.com/api/remote-jobs?limit=100', {
    headers: { Accept: 'application/json', 'User-Agent': 'Open-Yano-Job-Agent/1.0' },
  });
  if (!response.ok) throw new Error(`Remotive API ${response.status}`);
  const data = await response.json();
  return (data.jobs ?? [])
    .filter((job) =>
      matchesHollandRemote({
        title: job.title,
        company: job.company_name,
        location: job.candidate_required_location,
        description: job.description,
      }),
    )
    .slice(0, maxJobs)
    .map((job) =>
      normalizeJob({
        title: job.title,
        company: job.company_name,
        url: job.url,
        source: 'remotive',
        location: job.candidate_required_location || 'Remote',
      }),
    );
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
        collected.push({
          ...normalizeJob({
            title: job.title,
            url: job.url,
            source: 'indeed',
            location,
          }),
          jobKey: job.jobKey,
          sourceSearchUrl: url,
        });
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

/**
 * Zero-setup job search: public APIs + optional Indeed scrape when Firecrawl is configured.
 */
export async function searchRemoteHollandJobs({
  firecrawlApiKey = null,
  query = 'remote',
  location = 'Nederland',
  maxJobs = 25,
}) {
  const indeedSearchUrl = buildIndeedHollandRemoteSearchUrl({ query, location });
  const sourcesUsed = [];
  const errors = [];
  let jobs = [];

  const publicFetchers = [
    { name: 'jobicy', fn: () => fetchJobicyNetherlands(maxJobs) },
    { name: 'remoteok', fn: () => fetchRemoteOkNetherlands(maxJobs) },
    { name: 'remotive', fn: () => fetchRemotiveNetherlands(maxJobs) },
  ];

  for (const { name, fn } of publicFetchers) {
    try {
      const batch = await fn();
      sourcesUsed.push(`${name}:${batch.length}`);
      jobs.push(...batch);
    } catch (error) {
      errors.push(`${name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (firecrawlApiKey) {
    try {
      const indeed = await searchIndeedRemoteHolland({
        firecrawlApiKey,
        query,
        location,
        maxJobs: Math.min(maxJobs, 20),
        maxPages: 2,
      });
      sourcesUsed.push(`indeed-firecrawl:${indeed.jobCount}`);
      jobs.push(...indeed.jobs);
    } catch (error) {
      errors.push(
        `indeed-firecrawl: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  } else {
    sourcesUsed.push('indeed:search-link-only (no scrape key)');
  }

  jobs = dedupeByUrl(jobs).slice(0, maxJobs);

  return {
    agent: 'remote-holland-jobs',
    searchedAt: new Date().toISOString(),
    query,
    location,
    indeedSearchUrl,
    sourcesUsed,
    errors,
    jobCount: jobs.length,
    jobs,
    summary:
      jobs.length > 0
        ? `Collected ${jobs.length} remote/Holland-oriented listings (Jobicy NL feed + public boards). Open Indeed for more: ${indeedSearchUrl}`
        : `No listings parsed from feeds; use Indeed directly: ${indeedSearchUrl}`,
  };
}

export function formatJobsMarkdown(report) {
  const lines = [
    `# Remote jobs — Netherlands`,
    '',
    `**Query:** \`${report.query}\` · **Location:** \`${report.location}\``,
    `**Updated:** ${report.searchedAt} · **Jobs:** ${report.jobCount}`,
    '',
    `**Indeed (live search):** ${report.indeedSearchUrl}`,
    '',
    `**Sources:** ${(report.sourcesUsed ?? []).join(', ') || 'n/a'}`,
    '',
  ];

  if (report.errors?.length) {
    lines.push('### Source notes', '', ...report.errors.map((e) => `- ${e}`), '');
  }

  if (report.jobs.length === 0) {
    lines.push('_No listings returned from automated feeds._');
    return lines.join('\n');
  }

  report.jobs.forEach((job, index) => {
    lines.push(`## ${index + 1}. ${job.title}`);
    if (job.company) lines.push(`- **Company:** ${job.company}`);
    if (job.location) lines.push(`- **Location:** ${job.location}`);
    lines.push(`- **Source:** ${job.source}`);
    lines.push(`- **URL:** ${job.url}`);
    lines.push('');
  });

  return lines.join('\n');
}
