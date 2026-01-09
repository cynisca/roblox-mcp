/**
 * Plugin Reload via Close Place + Reopen Recent
 *
 * Reloads plugins by closing the current place and reopening it via File → Recent.
 * Much faster than restarting Studio (~3-5s vs ~8-12s).
 */

import { execSync } from 'child_process';
import { runAppleScript } from './applescript.js';

/**
 * Focus Roblox Studio window
 */
async function focusStudio(): Promise<boolean> {
  try {
    await runAppleScript(`
      tell application "RobloxStudio"
        activate
      end tell
    `);
    await new Promise(r => setTimeout(r, 200));
    return true;
  } catch {
    return false;
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
 * Close current place via File → Close Place
 */
async function closePlace(): Promise<boolean> {
  try {
    await focusStudio();

    await runAppleScript(`
      tell application "System Events"
        tell process "RobloxStudio"
          -- Click File menu
          click menu bar item "File" of menu bar 1
          delay 0.2
          -- Click Close Place
          click menu item "Close Place" of menu "File" of menu bar 1
        end tell
      end tell
    `);

    // Wait a moment for potential save dialog
    await new Promise(r => setTimeout(r, 300));

    // Try to dismiss save dialog if it appeared (click "Don't Save")
    try {
      await runAppleScript(`
        tell application "System Events"
          tell process "RobloxStudio"
            if exists sheet 1 of front window then
              click button "Don't Save" of sheet 1 of front window
            end if
          end tell
        end tell
      `);
    } catch {
      // No dialog, that's fine
    }

    return true;
  } catch (e) {
    console.error('[reload] Close place failed:', e);
    return false;
  }
}

/**
 * Open most recent place via File → Recent → (first item)
 */
async function openRecentPlace(): Promise<boolean> {
  try {
    await focusStudio();

    await runAppleScript(`
      tell application "System Events"
        tell process "RobloxStudio"
          -- Click File menu
          click menu bar item "File" of menu bar 1
          delay 0.2
          -- Hover over Recent submenu
          click menu item "Recent" of menu "File" of menu bar 1
          delay 0.2
          -- Click first item in Recent submenu
          click menu item 1 of menu "Recent" of menu item "Recent" of menu "File" of menu bar 1
        end tell
      end tell
    `);

    return true;
  } catch (e) {
    console.error('[reload] Open recent failed:', e);
    return false;
  }
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
  error?: string;
  durationMs: number;
}

/**
 * Main reload function - close place and reopen via Recent menu
 */
export async function reloadPlugins(options: {
  verify?: boolean;        // Verify plugin responds after reload
  pingTimeout?: number;    // How long to wait for ping (ms)
} = {}): Promise<ReloadResult> {
  const start = Date.now();
  const { verify = true, pingTimeout = 10000 } = options;

  console.error('[reload] Starting plugin reload...');

  // Check Studio is running
  if (!(await isStudioRunningProcess())) {
    return {
      success: false,
      error: 'Roblox Studio is not running',
      durationMs: Date.now() - start
    };
  }

  // 1. Close Place
  console.error('[reload] Closing place (File → Close Place)...');
  const closed = await closePlace();
  if (!closed) {
    return {
      success: false,
      error: 'Failed to close place via menu',
      durationMs: Date.now() - start
    };
  }

  // Wait for place to close
  await new Promise(r => setTimeout(r, 500));

  // 2. Open Recent
  console.error('[reload] Opening recent place (File → Recent → first item)...');
  const opened = await openRecentPlace();
  if (!opened) {
    return {
      success: false,
      error: 'Failed to open recent place via menu',
      durationMs: Date.now() - start
    };
  }

  // Wait for place to load
  await new Promise(r => setTimeout(r, 2000));

  // 3. Verify plugin is responding
  if (verify) {
    console.error('[reload] Waiting for plugin to respond...');
    const pluginReady = await waitForPluginReady(pingTimeout);

    if (!pluginReady) {
      return {
        success: false,
        error: 'Place reopened but plugin not responding. Check: 1) Plugin installed, 2) HTTP enabled in Game Settings',
        durationMs: Date.now() - start
      };
    }
    console.error('[reload] Plugin responding');
  }

  const duration = Date.now() - start;
  console.error(`[reload] Complete in ${duration}ms`);

  return {
    success: true,
    durationMs: duration
  };
}

/**
 * Legacy function - kept for compatibility but not used
 */
export async function getCurrentPlaceFile(): Promise<string | null> {
  try {
    const output = execSync(
      'lsof -c RobloxStudio 2>/dev/null | grep -E "\\.(rbxl|rbxlx)$" | head -1 || true'
    ).toString();
    const match = output.match(/\/.*\.rbxlx?$/m);
    return match ? match[0].trim() : null;
  } catch {
    return null;
  }
}
