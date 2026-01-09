import { runAppleScript } from './applescript.js';
import { focusRobloxStudio } from './focus-studio.js';

/**
 * Click a menu item in Roblox Studio
 * @param menuPath Array of menu items, e.g., ["File", "Save"]
 */
export async function clickMenu(menuPath: string[]): Promise<boolean> {
  if (menuPath.length < 2) {
    throw new Error('Menu path must have at least 2 items (menu bar item + menu item)');
  }

  await focusRobloxStudio();
  await new Promise(r => setTimeout(r, 200));

  try {
    // Build AppleScript for menu navigation
    const menuBarItem = menuPath[0];
    const menuItems = menuPath.slice(1);

    let script = `
      tell application "System Events"
        tell process "RobloxStudio"
          tell menu bar 1
            tell menu bar item "${menuBarItem}"
              tell menu "${menuBarItem}"
    `;

    // Navigate through nested menus
    for (let i = 0; i < menuItems.length - 1; i++) {
      script += `
                tell menu item "${menuItems[i]}"
                  tell menu "${menuItems[i]}"
      `;
    }

    // Click the final item
    script += `
                    click menu item "${menuItems[menuItems.length - 1]}"
    `;

    // Close all the nested tells
    for (let i = 0; i < menuItems.length - 1; i++) {
      script += `
                  end tell
                end tell
      `;
    }

    script += `
              end tell
            end tell
          end tell
        end tell
      end tell
    `;

    await runAppleScript(script);
    return true;
  } catch (e) {
    console.error('Menu click failed:', e);
    return false;
  }
}

/**
 * Attempt to reload all plugins via menu
 * Note: This is fragile as menu structure can change
 */
export async function reloadPlugins(): Promise<boolean> {
  try {
    // First try to open Manage Plugins
    const clicked = await clickMenu(['Plugins', 'Manage Plugins...']);
    if (!clicked) return false;

    await new Promise(r => setTimeout(r, 500)); // Wait for window

    // Try to click "Reload All" button in the window
    await runAppleScript(`
      tell application "System Events"
        tell process "RobloxStudio"
          tell window "Manage Plugins"
            click button "Reload All"
          end tell
        end tell
      end tell
    `);

    await new Promise(r => setTimeout(r, 500));

    // Close the window by pressing Escape
    await runAppleScript(`
      tell application "System Events"
        tell process "RobloxStudio"
          key code 53
        end tell
      end tell
    `);

    return true;
  } catch {
    return false;
  }
}

/**
 * Restart Roblox Studio (quit and reopen)
 * More reliable than trying to reload plugins via menu
 */
export async function restartStudio(placeFile?: string): Promise<boolean> {
  try {
    // Quit Studio
    await runAppleScript(`tell application "RobloxStudio" to quit`);

    // Wait for quit
    await new Promise(r => setTimeout(r, 3000));

    // Reopen
    if (placeFile) {
      await runAppleScript(`do shell script "open -a 'Roblox Studio' '${placeFile}'"`);
    } else {
      await runAppleScript(`tell application "RobloxStudio" to activate`);
    }

    // Wait for startup
    await new Promise(r => setTimeout(r, 5000));

    return true;
  } catch {
    return false;
  }
}

/**
 * Open a place file in Roblox Studio
 */
export async function openPlaceFile(placeFile: string): Promise<boolean> {
  try {
    await runAppleScript(`do shell script "open -a 'Roblox Studio' '${placeFile}'"`);
    await new Promise(r => setTimeout(r, 5000));
    return true;
  } catch {
    return false;
  }
}
