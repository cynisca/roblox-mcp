import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { IPC_PATHS } from './ipc.js';

const execAsync = promisify(exec);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface ScreenshotResult {
  success: boolean;
  path?: string;
  base64?: string;
  error?: string;
}

export async function captureScreenshot(options: {
  filename?: string;
  studioOnly?: boolean;
  returnBase64?: boolean;
} = {}): Promise<ScreenshotResult> {
  const timestamp = Date.now();
  const filename = options.filename || `screenshot-${timestamp}.png`;
  const outputPath = path.join(IPC_PATHS.screenshots, filename);

  try {
    // Ensure screenshots directory exists
    await fs.mkdir(IPC_PATHS.screenshots, { recursive: true });

    const scriptPath = path.join(__dirname, '..', 'scripts', 'screenshot.sh');
    const studioOnly = options.studioOnly ? 'true' : 'false';

    const { stdout, stderr } = await execAsync(
      `bash "${scriptPath}" "${outputPath}" ${studioOnly}`
    );

    // Check if capture was successful
    if (stdout.startsWith('captured:')) {
      const capturedPath = stdout.replace('captured:', '').trim();

      // Verify file was created
      await fs.stat(capturedPath);

      const result: ScreenshotResult = {
        success: true,
        path: capturedPath
      };

      if (options.returnBase64) {
        const buffer = await fs.readFile(capturedPath);
        result.base64 = buffer.toString('base64');
      }

      return result;
    } else if (stdout.startsWith('error:')) {
      return {
        success: false,
        error: stdout.replace('error:', '').trim()
      };
    } else {
      return {
        success: false,
        error: stderr || 'Unknown error during screenshot'
      };
    }
  } catch (e) {
    return {
      success: false,
      error: (e as Error).message
    };
  }
}

export async function listScreenshots(): Promise<string[]> {
  try {
    const files = await fs.readdir(IPC_PATHS.screenshots);
    return files.filter(f => f.endsWith('.png')).map(f => path.join(IPC_PATHS.screenshots, f));
  } catch {
    return [];
  }
}

export async function deleteScreenshot(filepath: string): Promise<boolean> {
  try {
    await fs.unlink(filepath);
    return true;
  } catch {
    return false;
  }
}
