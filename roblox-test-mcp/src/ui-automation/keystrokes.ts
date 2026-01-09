import { runAppleScript } from './applescript.js';
import { focusRobloxStudio } from './focus-studio.js';

// macOS key codes for function keys
const F_KEY_CODES: Record<number, number> = {
  1: 122, 2: 120, 3: 99, 4: 118, 5: 96, 6: 97, 7: 98, 8: 100,
  9: 101, 10: 109, 11: 103, 12: 111
};

/**
 * Send a keystroke to Roblox Studio
 */
export async function sendKeystroke(key: string, modifiers: string[] = []): Promise<boolean> {
  await focusRobloxStudio();
  await new Promise(r => setTimeout(r, 100));

  let modifierStr = '';
  if (modifiers.length > 0) {
    modifierStr = ` using {${modifiers.map(m => m + ' down').join(', ')}}`;
  }

  try {
    await runAppleScript(
      `tell application "System Events" to tell process "RobloxStudio" to keystroke "${key}"${modifierStr}`
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * Send a key code to Roblox Studio (for special keys like F-keys)
 */
export async function sendKeyCode(keyCode: number, modifiers: string[] = []): Promise<boolean> {
  await focusRobloxStudio();
  await new Promise(r => setTimeout(r, 100));

  let modifierStr = '';
  if (modifiers.length > 0) {
    modifierStr = ` using {${modifiers.map(m => m + ' down').join(', ')}}`;
  }

  try {
    await runAppleScript(
      `tell application "System Events" to tell process "RobloxStudio" to key code ${keyCode}${modifierStr}`
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * Press F5 to start play mode
 */
export async function pressF5(): Promise<boolean> {
  return sendKeyCode(F_KEY_CODES[5]);
}

/**
 * Press Shift+F5 to stop play mode
 */
export async function pressShiftF5(): Promise<boolean> {
  return sendKeyCode(F_KEY_CODES[5], ['shift']);
}

/**
 * Press F6 to start play mode (server only)
 */
export async function pressF6(): Promise<boolean> {
  return sendKeyCode(F_KEY_CODES[6]);
}

/**
 * Press F7 to start play mode (2 players)
 */
export async function pressF7(): Promise<boolean> {
  return sendKeyCode(F_KEY_CODES[7]);
}

/**
 * Press F8 to start play mode (server + 1 player)
 */
export async function pressF8(): Promise<boolean> {
  return sendKeyCode(F_KEY_CODES[8]);
}

/**
 * Press Cmd+S to save
 */
export async function pressCmdS(): Promise<boolean> {
  await focusRobloxStudio();
  await new Promise(r => setTimeout(r, 100));

  try {
    await runAppleScript(
      `tell application "System Events" to tell process "RobloxStudio" to keystroke "s" using command down`
    );
    return true;
  } catch {
    return false;
  }
}
