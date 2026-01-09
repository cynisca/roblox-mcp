/**
 * RobloxAutomation v2 - Intelligent, Self-Healing Automation
 *
 * Features:
 * - Automatic state detection and refresh
 * - Self-healing for common issues
 * - Retry logic with exponential backoff
 * - Context-aware operations
 */

import { sendCommandHttp, startHttpServer, stopHttpServer, isHttpServerRunning } from './http-ipc.js';
import {
  focusRobloxStudio,
  isStudioRunning,
  pressF5,
  pressShiftF5,
  captureStudioWindow,
  type ScreenshotResult,
} from './ui-automation/index.js';

export interface AutomationState {
  studioRunning: boolean;
  pluginResponding: boolean;
  isPlaying: boolean;
  httpEnabled: boolean;
  loadStringAvailable: boolean;
  issues: string[];
  context: string;
  lastCheck: number;
}

export interface DiagnosticsResult {
  context: string;
  isEdit: boolean;
  isServer: boolean;
  isClient: boolean;
  isRunning: boolean;
  httpEnabled: boolean;
  loadStringAvailable: boolean;
  issues: string[];
  playerCount: number;
  timestamp: number;
}

export interface ExecuteResult {
  success: boolean;
  result?: unknown;
  error?: string;
  context?: string;
  hint?: string;
}

export interface PlayStopResult {
  success: boolean;
  error?: string;
  selfHealed?: string[];
}

export class RobloxAutomation {
  private state: AutomationState;
  private stateCheckInterval: NodeJS.Timeout | null = null;
  private initialized = false;

  constructor() {
    this.state = {
      studioRunning: false,
      pluginResponding: false,
      isPlaying: false,
      httpEnabled: false,
      loadStringAvailable: false,
      issues: [],
      context: 'unknown',
      lastCheck: 0,
    };
  }

  /**
   * Initialize the automation system
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Start HTTP server if not running
    if (!isHttpServerRunning()) {
      await startHttpServer();
    }

    // Initial state refresh
    await this.refreshState();

    // Start periodic state checks (every 5 seconds)
    this.stateCheckInterval = setInterval(() => {
      this.refreshState().catch(console.error);
    }, 5000);

    this.initialized = true;
  }

  /**
   * Shutdown the automation system
   */
  async shutdown(): Promise<void> {
    if (this.stateCheckInterval) {
      clearInterval(this.stateCheckInterval);
      this.stateCheckInterval = null;
    }
    await stopHttpServer();
    this.initialized = false;
  }

  /**
   * Refresh the current state by checking Studio and plugin
   */
  async refreshState(): Promise<AutomationState> {
    this.state.lastCheck = Date.now();

    // Check if Studio is running
    this.state.studioRunning = await isStudioRunning();

    if (!this.state.studioRunning) {
      this.state.pluginResponding = false;
      this.state.isPlaying = false;
      this.state.issues = ['STUDIO_NOT_RUNNING'];
      return this.state;
    }

    // Try to get diagnostics from plugin
    try {
      const response = await sendCommandHttp('diagnostics', {}, 5000);

      if (response.success && response.result) {
        const diag = response.result as DiagnosticsResult;
        this.state.pluginResponding = true;
        this.state.isPlaying = diag.isRunning;
        this.state.httpEnabled = diag.httpEnabled;
        this.state.loadStringAvailable = diag.loadStringAvailable;
        this.state.issues = diag.issues || [];
        this.state.context = diag.context;
      } else {
        this.state.pluginResponding = false;
        this.state.issues = ['PLUGIN_ERROR'];
      }
    } catch (e) {
      this.state.pluginResponding = false;
      this.state.issues = ['PLUGIN_NOT_RESPONDING'];
    }

    return this.state;
  }

  /**
   * Get current state (cached)
   */
  getState(): AutomationState {
    return { ...this.state };
  }

  /**
   * Attempt to fix common issues automatically
   */
  async selfHeal(): Promise<{ fixed: string[]; remaining: string[] }> {
    const fixed: string[] = [];
    const remaining: string[] = [];

    await this.refreshState();

    // Can't heal if Studio isn't running
    if (!this.state.studioRunning) {
      remaining.push('STUDIO_NOT_RUNNING - Please open Roblox Studio');
      return { fixed, remaining };
    }

    // Try focusing Studio if plugin not responding
    if (!this.state.pluginResponding) {
      await focusRobloxStudio();
      await new Promise(r => setTimeout(r, 1000));
      await this.refreshState();

      if (this.state.pluginResponding) {
        fixed.push('PLUGIN_CONNECTION');
      } else {
        remaining.push('PLUGIN_NOT_RESPONDING - Check Output window for errors');
      }
    }

    // Check for specific issues
    for (const issue of this.state.issues) {
      if (issue === 'HTTP_DISABLED') {
        remaining.push('HTTP_DISABLED - Enable in Game Settings → Security → Allow HTTP Requests');
      } else if (issue === 'LOADSTRING_DISABLED') {
        remaining.push('LOADSTRING_DISABLED - Plugin will auto-enable, try restarting play mode');
      } else if (!remaining.includes(issue) && !fixed.includes(issue)) {
        remaining.push(issue);
      }
    }

    return { fixed, remaining };
  }

  /**
   * Ping the plugin
   */
  async ping(): Promise<{ success: boolean; error?: string }> {
    try {
      const response = await sendCommandHttp('ping', {}, 5000);
      return {
        success: response.success && response.result === 'pong',
        error: response.error,
      };
    } catch (e) {
      return { success: false, error: (e as Error).message };
    }
  }

  /**
   * Get detailed diagnostics from the plugin
   */
  async getDiagnostics(): Promise<DiagnosticsResult | null> {
    try {
      const response = await sendCommandHttp('diagnostics', {}, 5000);
      if (response.success && response.result) {
        return response.result as DiagnosticsResult;
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Start play mode with retry logic
   */
  async play(options: {
    retries?: number;
    waitForLoad?: boolean;
    timeout?: number;
  } = {}): Promise<PlayStopResult> {
    const retries = options.retries ?? 2;
    const waitForLoad = options.waitForLoad ?? true;
    const timeout = options.timeout ?? 15000;

    await this.refreshState();

    // Already playing?
    if (this.state.isPlaying) {
      return { success: true };
    }

    // Studio not running?
    if (!this.state.studioRunning) {
      return { success: false, error: 'Roblox Studio is not running' };
    }

    // Plugin not responding? Try to self-heal
    if (!this.state.pluginResponding) {
      const { fixed, remaining } = await this.selfHeal();
      if (!this.state.pluginResponding) {
        return {
          success: false,
          error: `Plugin not responding. Issues: ${remaining.join(', ')}`,
          selfHealed: fixed.length > 0 ? fixed : undefined,
        };
      }
    }

    // Try to start play mode
    for (let attempt = 0; attempt <= retries; attempt++) {
      const pressed = await pressF5();

      if (!pressed) {
        if (attempt === retries) {
          return { success: false, error: 'Failed to send F5 keystroke - check Accessibility permissions' };
        }
        await new Promise(r => setTimeout(r, 500));
        continue;
      }

      if (!waitForLoad) {
        return { success: true };
      }

      // Wait for play mode to start
      const startTime = Date.now();
      while (Date.now() - startTime < timeout) {
        await new Promise(r => setTimeout(r, 500));
        await this.refreshState();

        if (this.state.isPlaying) {
          return { success: true };
        }
      }

      // Timeout - retry if we have attempts left
      if (attempt < retries) {
        continue;
      }

      return { success: false, error: 'Timeout waiting for play mode to start' };
    }

    return { success: false, error: 'Failed after retries' };
  }

  /**
   * Stop play mode with retry logic
   */
  async stop(options: { retries?: number; timeout?: number } = {}): Promise<PlayStopResult> {
    const retries = options.retries ?? 2;
    const timeout = options.timeout ?? 10000;

    await this.refreshState();

    // Not playing?
    if (!this.state.isPlaying) {
      return { success: true };
    }

    for (let attempt = 0; attempt <= retries; attempt++) {
      const pressed = await pressShiftF5();

      if (!pressed) {
        if (attempt === retries) {
          return { success: false, error: 'Failed to send Shift+F5 keystroke' };
        }
        await new Promise(r => setTimeout(r, 500));
        continue;
      }

      // Wait for play mode to stop
      const startTime = Date.now();
      while (Date.now() - startTime < timeout) {
        await new Promise(r => setTimeout(r, 500));
        await this.refreshState();

        if (!this.state.isPlaying) {
          return { success: true };
        }
      }

      // Timeout - retry
      if (attempt < retries) continue;

      return { success: false, error: 'Timeout waiting for play mode to stop' };
    }

    return { success: false, error: 'Failed after retries' };
  }

  /**
   * Execute a Lua script in the game
   */
  async execute(
    script: string,
    options: { timeout?: number } = {}
  ): Promise<ExecuteResult> {
    const timeout = options.timeout ?? 30000;

    await this.refreshState();

    if (!this.state.pluginResponding) {
      return { success: false, error: 'Plugin not responding' };
    }

    try {
      const response = await sendCommandHttp('execute', { script }, timeout);
      return {
        success: response.success,
        result: response.result,
        error: response.error,
        context: (response as { context?: string }).context,
        hint: (response as { hint?: string }).hint,
      };
    } catch (e) {
      return { success: false, error: (e as Error).message };
    }
  }

  /**
   * Focus the Roblox Studio window
   */
  async focus(): Promise<{ success: boolean; error?: string }> {
    try {
      const focused = await focusRobloxStudio();
      return { success: focused };
    } catch (e) {
      return { success: false, error: (e as Error).message };
    }
  }

  /**
   * Capture a screenshot of Roblox Studio
   */
  async screenshot(filename?: string): Promise<ScreenshotResult> {
    await focusRobloxStudio();
    await new Promise(r => setTimeout(r, 300)); // Let window render

    return captureStudioWindow(filename);
  }

  /**
   * Run a complete test scenario
   */
  async testScenario(options: {
    setupScript?: string;
    testScript?: string;
    waitSeconds?: number;
  } = {}): Promise<{
    success: boolean;
    setupResult?: ExecuteResult;
    testResult?: ExecuteResult;
    screenshot?: ScreenshotResult;
    error?: string;
  }> {
    const waitSeconds = options.waitSeconds ?? 2;

    // Start play mode
    console.error('Starting play mode...');
    const playResult = await this.play({ waitForLoad: true });
    if (!playResult.success) {
      return { success: false, error: `Failed to start play mode: ${playResult.error}` };
    }

    // Run setup script
    let setupResult: ExecuteResult | undefined;
    if (options.setupScript) {
      console.error('Running setup script...');
      setupResult = await this.execute(options.setupScript);
      console.error(`Setup result: ${JSON.stringify(setupResult)}`);
    }

    // Run test script
    let testResult: ExecuteResult | undefined;
    if (options.testScript) {
      console.error('Running test script...');
      testResult = await this.execute(options.testScript);
      console.error(`Test result: ${JSON.stringify(testResult)}`);
    }

    // Wait
    console.error(`Waiting ${waitSeconds * 1000}ms...`);
    await new Promise(r => setTimeout(r, waitSeconds * 1000));

    // Screenshot
    console.error('Capturing screenshot...');
    const screenshot = await this.screenshot();

    // Stop play mode
    console.error('Stopping play mode...');
    await this.stop();

    return {
      success: true,
      setupResult,
      testResult,
      screenshot,
    };
  }
}

// Singleton instance
let automationInstance: RobloxAutomation | null = null;

export function getAutomation(): RobloxAutomation {
  if (!automationInstance) {
    automationInstance = new RobloxAutomation();
  }
  return automationInstance;
}

export async function initializeAutomation(): Promise<RobloxAutomation> {
  const automation = getAutomation();
  await automation.initialize();
  return automation;
}
