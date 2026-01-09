import { runAppleScript } from './applescript.js';

/**
 * Focus (bring to front) the Roblox Studio window
 */
export async function focusRobloxStudio(): Promise<boolean> {
  try {
    await runAppleScript(`tell application "RobloxStudio" to activate`);
    // Give it time to focus
    await new Promise(r => setTimeout(r, 200));
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if Roblox Studio is currently running
 */
export async function isStudioRunning(): Promise<boolean> {
  try {
    const result = await runAppleScript(
      `tell application "System Events" to return (name of processes) contains "RobloxStudio"`
    );
    return result === 'true';
  } catch {
    return false;
  }
}

/**
 * Get the title of the front Roblox Studio window
 */
export async function getStudioWindowTitle(): Promise<string | null> {
  try {
    const result = await runAppleScript(
      `tell application "System Events" to tell process "RobloxStudio" to return name of front window`
    );
    return result;
  } catch {
    return null;
  }
}

/**
 * Check if Roblox Studio is the frontmost application
 */
export async function isStudioFocused(): Promise<boolean> {
  try {
    const result = await runAppleScript(
      `tell application "System Events" to return name of first process whose frontmost is true`
    );
    return result === 'RobloxStudio';
  } catch {
    return false;
  }
}
