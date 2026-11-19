import type { BrowserAgentResult, BrowserAgentStep } from '@/types/browser-agent';

function sanitizeQuotes(text: string): string {
  return text
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
    .replace(/[\u00AB\u00BB]/g, '"')
    .replace(/[\u2039\u203A]/g, "'")
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/[\u2026]/g, '...')
    .replace(/[\u00A0]/g, ' ');
}

function normalizeUrl(url: string): string {
  const trimmed = url.trim();
  return trimmed.match(/^https?:\/\//i) ? trimmed : `https://${trimmed}`;
}

export async function scrapeWithFirecrawl(
  task: string,
  url: string,
): Promise<BrowserAgentResult> {
  const steps: BrowserAgentStep[] = [
    { type: 'status', message: `Scraping ${url} with Firecrawl...`, stepNumber: 1 },
  ];

  const firecrawlApiKey = process.env.FIRECRAWL_API_KEY;
  if (!firecrawlApiKey) {
    return {
      success: false,
      mode: 'scrape',
      task,
      result: '',
      steps: [
        ...steps,
        {
          type: 'error',
          error: 'FIRECRAWL_API_KEY is not set. Use agent mode or add your Firecrawl key.',
          stepNumber: 2,
        },
      ],
      screenshots: [],
      error: 'FIRECRAWL_API_KEY is not set',
    };
  }

  const normalizedUrl = normalizeUrl(url);

  const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${firecrawlApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      url: normalizedUrl,
      formats: ['markdown', 'html', 'screenshot'],
      waitFor: 3000,
      timeout: 30000,
      blockAds: true,
      maxAge: 3600000,
      actions: [{ type: 'wait', milliseconds: 2000 }],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    return {
      success: false,
      mode: 'scrape',
      task,
      result: '',
      steps: [
        ...steps,
        { type: 'error', error: `Firecrawl API error: ${errorText}`, stepNumber: 2 },
      ],
      screenshots: [],
      finalUrl: normalizedUrl,
      error: errorText,
    };
  }

  const data = await response.json();
  if (!data.success || !data.data) {
    return {
      success: false,
      mode: 'scrape',
      task,
      result: '',
      steps: [
        ...steps,
        { type: 'error', error: 'Failed to scrape content', stepNumber: 2 },
      ],
      screenshots: [],
      finalUrl: normalizedUrl,
      error: 'Failed to scrape content',
    };
  }

  const { markdown, metadata, screenshot } = data.data;
  const sanitizedMarkdown = sanitizeQuotes(markdown || '');
  const title = sanitizeQuotes(metadata?.title || '');
  const description = sanitizeQuotes(metadata?.description || '');

  const formattedContent = `
Title: ${title}
Description: ${description}
URL: ${normalizedUrl}

Task context: ${task}

Main Content:
${sanitizedMarkdown}
  `.trim();

  steps.push({
    type: 'done',
    message: `Scraped ${formattedContent.length} characters from ${normalizedUrl}`,
    stepNumber: 2,
  });

  return {
    success: true,
    mode: 'scrape',
    task,
    result: formattedContent,
    steps,
    screenshots: screenshot ? [screenshot] : [],
    finalUrl: normalizedUrl,
    scrapedContent: {
      title,
      description,
      content: sanitizedMarkdown,
      url: normalizedUrl,
    },
  };
}
