/**
 * Plugin Reload via Studio Restart
 *
 * Since Roblox Studio has no "Reload Plugins" API, the only reliable way
 * to reload plugins is to close and reopen the place file.
 */

import { execSync } from 'child_process';
import { runAppleScript } from './applescript.js';

/**
 * Get the currently open place file path using lsof
 */
export async function getCurrentPlaceFile(): Promise<string | null> {
  try {
    // Find open .rbxl/.rbxlx files by RobloxStudio process
    const output = execSync(
      'lsof -c RobloxStudio 2>/dev/null | grep -E "\\.(rbxl|rbxlx)$" | head -1 || true'
    ).toString();

    // Extract file path (everything from / to end of line)
    const match = output.match(/\/.*\.rbxlx?$/m);
    return match ? match[0].trim() : null;
  } catch {
    return null;
  }
}

/**
 * Check if Studio is running using pgrep
 */
export async function isStudioRunningProcess(): Promise<boolean> {
  try {
    const result = execSync('pgrep -x RobloxStudio || true').toString();
    return result.trim().length > 0;
  } catch {
    return false;
  }
}

/**
 * Wait for Studio to close
 */
async function waitForStudioClose(timeoutMs: number = 10000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (!(await isStudioRunningProcess())) return true;
    await new Promise(r => setTimeout(r, 300));
  }
  return false;
}

/**
 * Wait for Studio to open
 */
async function waitForStudioOpen(timeoutMs: number = 15000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await isStudioRunningProcess()) return true;
    await new Promise(r => setTimeout(r, 300));
  }
  return false;
}

/**
 * Verify plugin is responding via HTTP ping
 */
async function waitForPluginReady(timeoutMs: number = 10000): Promise<boolean> {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 2000);

      const response = await fetch('http://127.0.0.1:28859/ping', {
        signal: controller.signal
      });
      clearTimeout(timeout);

      const data = await response.json() as { status?: string };
      if (data.status === 'ok') return true;
    } catch {
      // Plugin not ready yet
    }
    await new Promise(r => setTimeout(r, 500));
  }

  return false;
}

export interface ReloadResult {
  success: boolean;
  placeFile?: string;
  error?: string;
  durationMs: number;
}

/**
 * Main reload function - close and reopen Studio
 */
export async function reloadPlugins(options: {
  verify?: boolean;        // Verify plugin responds after reload
  pingTimeout?: number;    // How long to wait for ping (ms)
} = {}): Promise<ReloadResult> {
  const start = Date.now();
  const { verify = true, pingTimeout = 10000 } = options;

  console.error('[reload] Starting plugin reload via restart...');

  // 1. Get current place file BEFORE closing
  const placeFile = await getCurrentPlaceFile();
  console.error(`[reload] Current place file: ${placeFile || 'none found'}`);

  // 2. Quit Studio
  console.error('[reload] Closing Roblox Studio...');
  try {
    await runAppleScript(`
      tell application "RobloxStudio"
        quit saving no
      end tell
    `);
  } catch (e) {
    // May fail if Studio is unresponsive, try force quit
    console.error('[reload] Gentle quit failed, trying force quit...');
    try {
      execSync('pkill -9 RobloxStudio || true');
    } catch {
      // Ignore
    }
  }

  // 3. Wait for Studio to fully close
  const closed = await waitForStudioClose(10000);
  if (!closed) {
    return {
      success: false,
      error: 'Timed out waiting for Studio to close',
      durationMs: Date.now() - start
    };
  }
  console.error('[reload] Studio closed');

  // Extra buffer for cleanup
  await new Promise(r => setTimeout(r, 500));

  // 4. Reopen Studio with the place file
  console.error('[reload] Reopening Studio...');
  try {
    if (placeFile) {
      const escapedPath = placeFile.replace(/'/g, "'\\''");
      await runAppleScript(`do shell script "open -a 'Roblox Studio' '${escapedPath}'"`);
    } else {
      await runAppleScript(`
        tell application "RobloxStudio"
          activate
        end tell
      `);
    }
  } catch (e) {
    return {
      success: false,
      error: `Failed to reopen Studio: ${e}`,
      durationMs: Date.now() - start
    };
  }

  // 5. Wait for Studio to open
  const opened = await waitForStudioOpen(15000);
  if (!opened) {
    return {
      success: false,
      error: 'Timed out waiting for Studio to open',
      placeFile: placeFile || undefined,
      durationMs: Date.now() - start
    };
  }
  console.error('[reload] Studio opened');

  // 6. Wait for place to load (extra time)
  await new Promise(r => setTimeout(r, 3000));

  // 7. Verify plugin is responding
  if (verify) {
    console.error('[reload] Waiting for plugin to respond...');
    const pluginReady = await waitForPluginReady(pingTimeout);

    if (!pluginReady) {
      return {
        success: false,
        error: 'Studio restarted but plugin not responding. Check: 1) Plugin installed, 2) HTTP enabled in Game Settings',
        placeFile: placeFile || undefined,
        durationMs: Date.now() - start
      };
    }
    console.error('[reload] Plugin responding');
  }

  const duration = Date.now() - start;
  console.error(`[reload] Complete in ${duration}ms`);

  return {
    success: true,
    placeFile: placeFile || undefined,
    durationMs: duration
  };
}
