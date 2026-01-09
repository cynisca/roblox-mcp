import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { runAppleScript } from './applescript.js';
import { focusRobloxStudio } from './focus-studio.js';

const execAsync = promisify(exec);

export interface ScreenshotResult {
  success: boolean;
  path?: string;
  base64?: string;
  error?: string;
}

/**
 * Get the default screenshot directory
 */
export function getScreenshotDirectory(): string {
  return path.join(os.homedir(), 'RobloxTestAutomation', 'screenshots');
}

/**
 * Ensure the screenshot directory exists
 */
export async function ensureScreenshotDirectory(): Promise<string> {
  const dir = getScreenshotDirectory();
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

/**
 * Capture the entire Roblox Studio window
 */
export async function captureStudioWindow(outputPath?: string): Promise<ScreenshotResult> {
  try {
    await focusRobloxStudio();
    await new Promise(r => setTimeout(r, 300)); // Let window render

    // Generate output path if not provided
    if (!outputPath) {
      const dir = await ensureScreenshotDirectory();
      outputPath = path.join(dir, `screenshot-${Date.now()}.png`);
    }

    // Ensure output directory exists
    await fs.mkdir(path.dirname(outputPath), { recursive: true });

    // Try to get window ID for precise capture
    try {
      const windowId = await runAppleScript(
        `tell application "System Events" to tell process "RobloxStudio" to return id of front window`
      );

      // Capture specific window
      await execAsync(`screencapture -l ${windowId} -x "${outputPath}"`);
    } catch {
      // Fallback: activate and capture screen
      await runAppleScript(`tell application "RobloxStudio" to activate`);
      await new Promise(r => setTimeout(r, 200));
      await execAsync(`screencapture -x "${outputPath}"`);
    }

    // Verify file was created
    const stats = await fs.stat(outputPath);
    if (stats.size === 0) {
      return { success: false, error: 'Screenshot file is empty' };
    }

    // Read as base64
    const buffer = await fs.readFile(outputPath);
    const base64 = buffer.toString('base64');

    return { success: true, path: outputPath, base64 };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

/**
 * Capture a specific region of the screen
 */
export async function captureRegion(
  x: number,
  y: number,
  width: number,
  height: number,
  outputPath?: string
): Promise<ScreenshotResult> {
  try {
    if (!outputPath) {
      const dir = await ensureScreenshotDirectory();
      outputPath = path.join(dir, `screenshot-region-${Date.now()}.png`);
    }

    await fs.mkdir(path.dirname(outputPath), { recursive: true });

    await execAsync(`screencapture -R ${x},${y},${width},${height} -x "${outputPath}"`);

    const stats = await fs.stat(outputPath);
    if (stats.size === 0) {
      return { success: false, error: 'Screenshot file is empty' };
    }

    const buffer = await fs.readFile(outputPath);
    const base64 = buffer.toString('base64');

    return { success: true, path: outputPath, base64 };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

/**
 * Capture the full screen
 */
export async function captureFullScreen(outputPath?: string): Promise<ScreenshotResult> {
  try {
    if (!outputPath) {
      const dir = await ensureScreenshotDirectory();
      outputPath = path.join(dir, `screenshot-full-${Date.now()}.png`);
    }

    await fs.mkdir(path.dirname(outputPath), { recursive: true });

    await execAsync(`screencapture -x "${outputPath}"`);

    const stats = await fs.stat(outputPath);
    if (stats.size === 0) {
      return { success: false, error: 'Screenshot file is empty' };
    }

    const buffer = await fs.readFile(outputPath);
    const base64 = buffer.toString('base64');

    return { success: true, path: outputPath, base64 };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}
