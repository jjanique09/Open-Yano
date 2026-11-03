import { appConfig } from '@/config/app.config';
import type { BrowserAgentResult, BrowserAgentStep } from '@/types/browser-agent';
import { createStagehandSession } from './create-stagehand';
import { resolveBrowserAgentMode } from './hybrid-router';
import { scrapeWithFirecrawl } from './scrape-with-firecrawl';

export interface RunBrowserAgentOptions {
  task: string;
  url?: string;
  model?: string;
  mode?: 'auto' | 'scrape' | 'agent';
  sessionId?: string;
  headless?: boolean;
  maxSteps?: number;
  onStep?: (step: BrowserAgentStep) => void | Promise<void>;
}

function normalizeUrl(url: string): string {
  const trimmed = url.trim();
  return trimmed.match(/^https?:\/\//i) ? trimmed : `https://${trimmed}`;
}

function extractUrlFromTask(task: string): string | undefined {
  const match = task.match(/https?:\/\/[^\s)]+/i);
  return match?.[0];
}

export async function runBrowserAgent(
  options: RunBrowserAgentOptions,
): Promise<BrowserAgentResult> {
  const {
    task,
    url: providedUrl,
    model,
    mode = 'auto',
    sessionId,
    headless,
    maxSteps = appConfig.browserAgent.maxSteps,
    onStep,
  } = options;

  const url = providedUrl || extractUrlFromTask(task);
  const resolvedMode = resolveBrowserAgentMode(task, url, mode);

  if (resolvedMode === 'scrape') {
    if (!url) {
      const error =
        'Scrape mode requires a URL. Provide a url field or include one in the task.';
      const step: BrowserAgentStep = { type: 'error', error, stepNumber: 1 };
      await onStep?.(step);
      return {
        success: false,
        mode: 'scrape',
        task,
        result: '',
        steps: [step],
        screenshots: [],
        error,
      };
    }

    const result = await scrapeWithFirecrawl(task, url);
    for (const step of result.steps) {
      await onStep?.(step);
    }
    return result;
  }

  const steps: BrowserAgentStep[] = [];
  let stepNumber = 0;

  const emit = async (step: BrowserAgentStep) => {
    stepNumber += 1;
    const enriched = { ...step, stepNumber };
    steps.push(enriched);
    await onStep?.(enriched);
  };

  let session: Awaited<ReturnType<typeof createStagehandSession>> | null = null;

  try {
    await emit({
      type: 'status',
      message: 'Starting Stagehand browser agent...',
    });

    session = await createStagehandSession({
      model,
      headless,
      sessionId,
      verbose: appConfig.dev.enableDebugLogging ? 2 : 1,
    });

    const { stagehand, env, debugUrl } = session;

    await emit({
      type: 'status',
      message: `Browser ready (${env})`,
    });

    const page = stagehand.context.pages()[0];
    if (url) {
      const normalizedUrl = normalizeUrl(url);
      await page.goto(normalizedUrl, { waitUntil: 'domcontentloaded' });
      await emit({
        type: 'status',
        message: `Navigated to ${normalizedUrl}`,
      });
    }

    const agent = stagehand.agent({
      model: model || appConfig.browserAgent.defaultModel,
      systemPrompt: `You are a capable browser automation agent.
Complete the user's task using the browser tools available to you.
Be precise, verify your work, and summarize findings clearly when done.
If authentication is required and credentials were not provided, explain what is needed.`,
    });

    const agentResult = await agent.execute({
      instruction: task,
      maxSteps,
      callbacks: {
        onStepFinish: async (event) => {
          const toolCalls = event.toolCalls || [];
          for (const toolCall of toolCalls) {
            await emit({
              type: 'action',
              message: `Used tool: ${toolCall.toolName}`,
              action: {
                toolName: toolCall.toolName,
                input: toolCall.input,
              },
            });
          }

          if (event.text) {
            await emit({
              type: 'text',
              text: event.text,
            });
          }
        },
      },
    });

    const finalUrl = page.url();

    let screenshot: string | undefined;
    try {
      const screenshotBuffer = await page.screenshot({ type: 'png', fullPage: false });
      screenshot = `data:image/png;base64,${screenshotBuffer.toString('base64')}`;
      await emit({
        type: 'screenshot',
        screenshot,
        message: 'Captured final screenshot',
      });
    } catch {
      // Screenshot capture is best-effort.
    }

    await emit({
      type: 'done',
      message: agentResult.message,
      text: agentResult.message,
    });

    return {
      success: agentResult.success,
      mode: 'agent',
      sessionId: stagehand.browserbaseSessionID,
      task,
      result: agentResult.message,
      steps,
      screenshots: screenshot ? [screenshot] : [],
      finalUrl,
      actions: agentResult.actions,
      debugUrl,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown browser agent error';
    await emit({
      type: 'error',
      error: message,
    });

    return {
      success: false,
      mode: 'agent',
      sessionId: session?.stagehand.browserbaseSessionID,
      task,
      result: '',
      steps,
      screenshots: [],
      error: message,
      debugUrl: session?.debugUrl,
    };
  } finally {
    if (session?.stagehand) {
      await session.stagehand.close();
    }
  }
}
