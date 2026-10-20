export type BrowserAgentMode = 'auto' | 'scrape' | 'agent';

export type BrowserAgentStepType =
  | 'status'
  | 'action'
  | 'screenshot'
  | 'text'
  | 'error'
  | 'done';

export interface BrowserAgentStep {
  type: BrowserAgentStepType;
  message?: string;
  action?: Record<string, unknown>;
  screenshot?: string;
  text?: string;
  error?: string;
  stepNumber?: number;
}

export interface BrowserAgentRequest {
  task: string;
  url?: string;
  model?: string;
  mode?: BrowserAgentMode;
  sessionId?: string;
  headless?: boolean;
  maxSteps?: number;
}

export interface BrowserAgentResult {
  success: boolean;
  mode: 'scrape' | 'agent';
  sessionId?: string;
  task: string;
  result: string;
  steps: BrowserAgentStep[];
  screenshots: string[];
  finalUrl?: string;
  scrapedContent?: {
    title?: string;
    description?: string;
    content?: string;
    url?: string;
  };
  actions?: Array<Record<string, unknown>>;
  debugUrl?: string;
  error?: string;
}
