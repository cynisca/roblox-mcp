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
  sizeKB?: number;
}

// Compression presets for token efficiency
export type CompressionLevel = 'none' | 'low' | 'medium' | 'high';

const COMPRESSION_SETTINGS: Record<CompressionLevel, { resize?: number; quality: number; format: 'png' | 'jpeg' }> = {
  none: { quality: 100, format: 'png' },
  low: { quality: 80, format: 'jpeg' },           // ~70% reduction
  medium: { resize: 1200, quality: 70, format: 'jpeg' },  // ~85% reduction
  high: { resize: 800, quality: 50, format: 'jpeg' },     // ~95% reduction
};

export async function captureScreenshot(options: {
  filename?: string;
  studioOnly?: boolean;
  returnBase64?: boolean;
  compression?: CompressionLevel;
} = {}): Promise<ScreenshotResult> {
  const timestamp = Date.now();
  const compression = options.compression || 'medium';  // Default to medium compression
  const settings = COMPRESSION_SETTINGS[compression];
  const ext = settings.format === 'jpeg' ? 'jpg' : 'png';
  const filename = options.filename || `screenshot-${timestamp}.${ext}`;
  const outputPath = path.join(IPC_PATHS.screenshots, filename);

  try {
    // Ensure screenshots directory exists
    await fs.mkdir(IPC_PATHS.screenshots, { recursive: true });

    const scriptPath = path.join(__dirname, '..', 'scripts', 'screenshot.sh');
    const studioOnly = options.studioOnly ? 'true' : 'false';

    // Capture to temp PNG first (for compression)
    const tempPath = path.join(IPC_PATHS.screenshots, `temp-${timestamp}.png`);

    const { stdout, stderr } = await execAsync(
      `bash "${scriptPath}" "${tempPath}" ${studioOnly}`
    );

    // Check if capture was successful
    if (!stdout.startsWith('captured:')) {
      if (stdout.startsWith('error:')) {
        return { success: false, error: stdout.replace('error:', '').trim() };
      }
      return { success: false, error: stderr || 'Unknown error during screenshot' };
    }

    const capturedPath = stdout.replace('captured:', '').trim();
    await fs.stat(capturedPath);

    // Apply compression if needed
    let finalPath = capturedPath;
    if (compression !== 'none') {
      finalPath = outputPath;

      // Build sips command for compression
      let sipsCmd = '';

      if (settings.resize) {
        // Resize first (max dimension)
        sipsCmd = `sips -Z ${settings.resize} "${capturedPath}" --out "${capturedPath}" 2>/dev/null && `;
      }

      // Convert to JPEG with quality
      sipsCmd += `sips -s format jpeg -s formatOptions ${settings.quality} "${capturedPath}" --out "${finalPath}" 2>/dev/null`;

      await execAsync(sipsCmd);

      // Remove temp PNG
      await fs.unlink(capturedPath).catch(() => {});
    }

    // Get final file size
    const stats = await fs.stat(finalPath);
    const sizeKB = Math.round(stats.size / 1024);

    const result: ScreenshotResult = {
      success: true,
      path: finalPath,
      sizeKB
    };

    if (options.returnBase64) {
      const buffer = await fs.readFile(finalPath);
      result.base64 = buffer.toString('base64');
    }

    return result;
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
