import { appConfig } from '@/config/app.config';
import type { BrowserAgentMode } from '@/types/browser-agent';

const SCRAPE_KEYWORDS = [
  'clone',
  'scrape',
  'inspect',
  'copy',
  'rebuild',
  'recreate',
  'redesign',
  'extract content',
  'get content',
  'website content',
  'page content',
  'markdown',
  'html',
];

const AGENT_KEYWORDS = [
  'click',
  'fill',
  'login',
  'sign in',
  'submit',
  'search for',
  'navigate',
  'go to',
  'open',
  'download',
  'purchase',
  'book',
  'type',
  'scroll',
  'interact',
  'automate',
  'find the',
  'get the price',
  'compare',
];

export function resolveBrowserAgentMode(
  task: string,
  url?: string,
  requestedMode: BrowserAgentMode = 'auto',
): 'scrape' | 'agent' {
  if (requestedMode === 'scrape') return 'scrape';
  if (requestedMode === 'agent') return 'agent';

  const normalizedTask = task.toLowerCase();

  const agentScore = AGENT_KEYWORDS.reduce(
    (score, keyword) => score + (normalizedTask.includes(keyword) ? 1 : 0),
    0,
  );
  const scrapeScore = SCRAPE_KEYWORDS.reduce(
    (score, keyword) => score + (normalizedTask.includes(keyword) ? 1 : 0),
    0,
  );

  if (agentScore > scrapeScore) return 'agent';
  if (scrapeScore > agentScore) return 'scrape';

  if (url && appConfig.browserAgent.preferFirecrawlForUrls) {
    return 'scrape';
  }

  return 'agent';
}
