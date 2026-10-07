#!/usr/bin/env node
/**
 * CLI for the hybrid browser agent (Stagehand + Firecrawl).
 *
 * Usage:
 *   npm run browser-agent -- "Go to example.com and get the page title"
 *   npm run browser-agent -- --url https://example.com --mode scrape "Clone this site"
 *   npm run browser-agent -- --mode agent "Search Google for Stagehand docs"
 */

import 'dotenv/config';
import { runBrowserAgent } from '../lib/browser-agent/run-agent';

function printHelp() {
  console.log(`
Browser Agent CLI (Stagehand + Firecrawl)

Usage:
  npm run browser-agent -- [options] "<task>"

Options:
  --url <url>         Starting URL
  --mode <mode>       auto | scrape | agent (default: auto)
  --model <model>     AI model (default: anthropic/claude-sonnet-4-20250514)
  --headless          Run browser headless (default: true)
  --no-headless       Show browser window (local mode only)
  --max-steps <n>     Max agent steps (default: 20)
  --help              Show this help

Examples:
  npm run browser-agent -- "Go to https://example.com and summarize the page"
  npm run browser-agent -- --url https://stripe.com --mode scrape "Clone this website"
  npm run browser-agent -- --mode agent "Find pricing on vercel.com"
`);
}

function parseArgs(argv: string[]) {
  const options: {
    task?: string;
    url?: string;
    mode?: 'auto' | 'scrape' | 'agent';
    model?: string;
    headless?: boolean;
    maxSteps?: number;
    help?: boolean;
  } = {
    headless: true,
  };

  const positional: string[] = [];

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === '--help' || arg === '-h') {
      options.help = true;
      continue;
    }

    if (arg === '--url') {
      options.url = argv[++i];
      continue;
    }

    if (arg === '--mode') {
      const mode = argv[++i] as 'auto' | 'scrape' | 'agent';
      options.mode = mode;
      continue;
    }

    if (arg === '--model') {
      options.model = argv[++i];
      continue;
    }

    if (arg === '--headless') {
      options.headless = true;
      continue;
    }

    if (arg === '--no-headless') {
      options.headless = false;
      continue;
    }

    if (arg === '--max-steps') {
      options.maxSteps = Number(argv[++i]);
      continue;
    }

    positional.push(arg);
  }

  options.task = positional.join(' ').trim();
  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help || !options.task) {
    printHelp();
    process.exit(options.help ? 0 : 1);
  }

  console.log(`\nTask: ${options.task}`);
  if (options.url) console.log(`URL: ${options.url}`);
  console.log(`Mode: ${options.mode || 'auto'}\n`);

  const result = await runBrowserAgent({
    task: options.task,
    url: options.url,
    model: options.model,
    mode: options.mode,
    headless: options.headless,
    maxSteps: options.maxSteps,
    onStep: async (step) => {
      if (step.type === 'status') {
        console.log(`[status] ${step.message}`);
      } else if (step.type === 'action') {
        console.log(`[action] ${step.message}`);
      } else if (step.type === 'error') {
        console.error(`[error] ${step.error}`);
      } else if (step.type === 'done') {
        console.log(`[done] ${step.message}`);
      }
    },
  });

  console.log('\n--- Result ---');
  console.log(`Success: ${result.success}`);
  console.log(`Mode: ${result.mode}`);
  if (result.finalUrl) console.log(`Final URL: ${result.finalUrl}`);
  if (result.debugUrl) console.log(`Debug URL: ${result.debugUrl}`);
  if (result.error) console.error(`Error: ${result.error}`);
  console.log('\n' + result.result);

  process.exit(result.success ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
