import { appConfig } from '@/config/app.config';

type ModelProvider = 'openai' | 'anthropic' | 'groq';

interface ResolvedStagehandModel {
  model: string;
  apiKey?: string;
  baseURL?: string;
}

function getProviderApiKey(provider: ModelProvider): string | undefined {
  switch (provider) {
    case 'openai':
      return process.env.OPENAI_API_KEY;
    case 'anthropic':
      return process.env.ANTHROPIC_API_KEY;
    case 'groq':
      return process.env.GROQ_API_KEY;
    default:
      return undefined;
  }
}

function detectProvider(model: string): ModelProvider {
  if (model.startsWith('openai/')) return 'openai';
  if (model.startsWith('anthropic/')) return 'anthropic';
  if (model.startsWith('groq/') || model.includes('kimi') || model.includes('moonshotai')) {
    return 'groq';
  }
  return 'groq';
}

function normalizeModelName(model: string): string {
  if (model.startsWith('openai/')) {
    const name = model.replace('openai/', '');
    return name === 'gpt-5' ? 'openai/gpt-5' : `openai/${name}`;
  }

  if (model.startsWith('anthropic/')) {
    return model;
  }

  if (model.startsWith('groq/')) {
    return model;
  }

  if (model.includes('kimi') || model.includes('moonshotai')) {
    return `groq/${model}`;
  }

  return model;
}

export function resolveStagehandModel(requestedModel?: string): ResolvedStagehandModel {
  const fallback = appConfig.browserAgent.defaultModel;
  const model = normalizeModelName(requestedModel || fallback);
  const provider = detectProvider(model);

  if (process.env.BROWSERBASE_API_KEY && !getProviderApiKey(provider)) {
    return { model };
  }

  const apiKey = getProviderApiKey(provider);
  if (!apiKey) {
    const alternateProviders: ModelProvider[] = ['anthropic', 'openai', 'groq'];
    for (const alternate of alternateProviders) {
      const alternateKey = getProviderApiKey(alternate);
      if (alternateKey) {
        const alternateModel =
          alternate === 'anthropic'
            ? 'anthropic/claude-sonnet-4-20250514'
            : alternate === 'openai'
              ? 'openai/gpt-4o'
              : 'groq/moonshotai/kimi-k2-instruct';
        return {
          model: alternateModel,
          apiKey: alternateKey,
          baseURL: alternate === 'anthropic' ? process.env.ANTHROPIC_BASE_URL : undefined,
        };
      }
    }
  }

  return {
    model,
    apiKey,
    baseURL: provider === 'anthropic' ? process.env.ANTHROPIC_BASE_URL : undefined,
  };
}

export function hasBrowserAgentCredentials(): {
  canRunLocal: boolean;
  canRunBrowserbase: boolean;
  missing: string[];
} {
  const missing: string[] = [];
  const hasLlm =
    !!process.env.OPENAI_API_KEY ||
    !!process.env.ANTHROPIC_API_KEY ||
    !!process.env.GROQ_API_KEY;

  if (!hasLlm && !process.env.BROWSERBASE_API_KEY) {
    missing.push('OPENAI_API_KEY, ANTHROPIC_API_KEY, or GROQ_API_KEY');
  }

  const canRunBrowserbase = !!process.env.BROWSERBASE_API_KEY;
  const canRunLocal = hasLlm || canRunBrowserbase;

  if (canRunBrowserbase && !process.env.BROWSERBASE_PROJECT_ID) {
    missing.push('BROWSERBASE_PROJECT_ID (recommended for Browserbase sessions)');
  }

  return {
    canRunLocal,
    canRunBrowserbase,
    missing,
  };
}
