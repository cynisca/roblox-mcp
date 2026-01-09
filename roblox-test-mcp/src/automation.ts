import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { ensureDirectories } from './ipc.js';
import { sendCommandHttp, startHttpServer, isHttpServerRunning } from './http-ipc.js';

const execAsync = promisify(exec);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class RobloxAutomation {
  private scriptsDir: string;

  constructor() {
    this.scriptsDir = path.join(__dirname, '..', 'scripts');
  }

  async initialize(): Promise<void> {
    await ensureDirectories();
    // Start HTTP server for plugin communication
    await startHttpServer();
  }

  async sendStudioControl(action: 'play' | 'stop' | 'focus' | 'check'): Promise<{ success: boolean; output?: string; error?: string }> {
    try {
      const scriptPath = path.join(this.scriptsDir, 'studio-control.sh');
      const { stdout, stderr } = await execAsync(`bash "${scriptPath}" ${action}`);
      return { success: true, output: stdout.trim() };
    } catch (e) {
      const error = e as Error & { stderr?: string };
      return { success: false, error: error.stderr || error.message };
    }
  }

  async isStudioRunning(): Promise<boolean> {
    const result = await this.sendStudioControl('check');
    return result.success && result.output === 'running';
  }

  async play(waitForLoad = true): Promise<{ success: boolean; error?: string }> {
    const controlled = await this.sendStudioControl('play');
    if (!controlled.success) {
      return { success: false, error: controlled.error || 'Failed to send play command to Studio' };
    }

    if (waitForLoad) {
      // Wait for play mode to start
      await new Promise(r => setTimeout(r, 3000));

      // Verify via plugin (using HTTP)
      try {
        const state = await sendCommandHttp('getState', {}, 5000);
        if (state.success && state.result && (state.result as Record<string, unknown>).isPlaying) {
          return { success: true };
        }
      } catch {
        // Plugin might not respond during transition
      }
    }

    return { success: true };
  }

  async stop(): Promise<{ success: boolean; error?: string }> {
    const controlled = await this.sendStudioControl('stop');
    if (!controlled.success) {
      return { success: false, error: controlled.error || 'Failed to send stop command to Studio' };
    }

    await new Promise(r => setTimeout(r, 1000));
    return { success: true };
  }

  async getState(): Promise<{ isPlaying: boolean; isStudio: boolean; isEdit?: boolean }> {
    try {
      const response = await sendCommandHttp('getState', {}, 5000);
      if (response.success && response.result) {
        return response.result as { isPlaying: boolean; isStudio: boolean; isEdit?: boolean };
      }
    } catch {
      // Default to unknown state
    }
    return { isPlaying: false, isStudio: false };
  }

  async execute(script: string, timeout = 30000): Promise<{ success: boolean; result?: unknown; error?: string }> {
    try {
      const response = await sendCommandHttp('execute', { script }, timeout);
      return response;
    } catch (e) {
      return { success: false, error: (e as Error).message };
    }
  }

  async ping(): Promise<{ success: boolean; result?: unknown; error?: string }> {
    try {
      const response = await sendCommandHttp('ping', {}, 5000);
      return response;
    } catch (e) {
      return { success: false, error: (e as Error).message };
    }
  }

  isHttpServerRunning(): boolean {
    return isHttpServerRunning();
  }
}
