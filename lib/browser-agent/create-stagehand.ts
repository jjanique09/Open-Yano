import { Stagehand } from '@browserbasehq/stagehand';
import { appConfig } from '@/config/app.config';
import { resolveStagehandModel } from './model';

export interface CreateStagehandOptions {
  model?: string;
  headless?: boolean;
  sessionId?: string;
  verbose?: 0 | 1 | 2;
}

export interface StagehandSession {
  stagehand: Stagehand;
  env: 'LOCAL' | 'BROWSERBASE';
  debugUrl?: string;
}

export async function createStagehandSession(
  options: CreateStagehandOptions = {},
): Promise<StagehandSession> {
  const { model: modelName, apiKey, baseURL } = resolveStagehandModel(options.model);
  const useBrowserbase = !!process.env.BROWSERBASE_API_KEY;
  const env = useBrowserbase ? 'BROWSERBASE' : 'LOCAL';

  const modelConfig = apiKey
    ? {
        modelName,
        apiKey,
        ...(baseURL ? { baseURL } : {}),
      }
    : modelName;

  const stagehand = new Stagehand({
    env,
    apiKey: process.env.BROWSERBASE_API_KEY,
    projectId: process.env.BROWSERBASE_PROJECT_ID,
    browserbaseSessionID: options.sessionId,
    model: modelConfig,
    verbose: options.verbose ?? 1,
    disablePino: true,
    domSettleTimeout: appConfig.browserAgent.domSettleTimeoutMs,
    ...(env === 'LOCAL'
      ? {
          localBrowserLaunchOptions: {
            headless: options.headless ?? appConfig.browserAgent.headless,
            viewport: appConfig.browserAgent.viewport,
          },
        }
      : {
          browserbaseSessionCreateParams: {
            projectId: process.env.BROWSERBASE_PROJECT_ID,
            browserSettings: {
              viewport: appConfig.browserAgent.viewport,
              blockAds: true,
            },
          },
        }),
  });

  await stagehand.init();

  return {
    stagehand,
    env,
    debugUrl: stagehand.browserbaseDebugURL,
  };
}
