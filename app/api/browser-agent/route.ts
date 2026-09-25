import { NextRequest, NextResponse } from 'next/server';
import { appConfig } from '@/config/app.config';
import { hasBrowserAgentCredentials } from '@/lib/browser-agent/model';
import { runBrowserAgent } from '@/lib/browser-agent/run-agent';
import type { BrowserAgentMode } from '@/types/browser-agent';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      task,
      url,
      model = appConfig.browserAgent.defaultModel,
      mode = 'auto',
      sessionId,
      headless = appConfig.browserAgent.headless,
      maxSteps = appConfig.browserAgent.maxSteps,
      stream = false,
    } = body as {
      task?: string;
      url?: string;
      model?: string;
      mode?: BrowserAgentMode;
      sessionId?: string;
      headless?: boolean;
      maxSteps?: number;
      stream?: boolean;
    };

    if (!task?.trim()) {
      return NextResponse.json(
        { success: false, error: 'task is required' },
        { status: 400 },
      );
    }

    const credentials = hasBrowserAgentCredentials();
    if (!credentials.canRunLocal && !credentials.canRunBrowserbase) {
      return NextResponse.json(
        {
          success: false,
          error: `Missing credentials: ${credentials.missing.join(', ')}`,
        },
        { status: 400 },
      );
    }

    if (!stream) {
      const result = await runBrowserAgent({
        task: task.trim(),
        url,
        model,
        mode,
        sessionId,
        headless,
        maxSteps,
      });

      return NextResponse.json(result);
    }

    const encoder = new TextEncoder();
    const responseStream = new TransformStream();
    const writer = responseStream.writable.getWriter();

    const send = async (payload: Record<string, unknown>) => {
      await writer.write(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
    };

    (async () => {
      try {
        await send({ type: 'status', message: 'Browser agent started' });

        const result = await runBrowserAgent({
          task: task.trim(),
          url,
          model,
          mode,
          sessionId,
          headless,
          maxSteps,
          onStep: async (step) => {
            await send({ type: 'step', step });
          },
        });

        await send({ type: 'complete', result });
      } catch (error) {
        await send({
          type: 'error',
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      } finally {
        await writer.close();
      }
    })();

    return new Response(responseStream.readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
      },
    });
  } catch (error) {
    console.error('[browser-agent] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    );
  }
}

export async function GET() {
  const credentials = hasBrowserAgentCredentials();

  return NextResponse.json({
    success: true,
    service: 'browser-agent',
    engine: 'stagehand',
    modes: ['auto', 'scrape', 'agent'],
    credentials,
    config: {
      defaultModel: appConfig.browserAgent.defaultModel,
      maxSteps: appConfig.browserAgent.maxSteps,
      headless: appConfig.browserAgent.headless,
      preferFirecrawlForUrls: appConfig.browserAgent.preferFirecrawlForUrls,
    },
  });
}
