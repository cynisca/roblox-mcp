import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const PLUGIN_PATHS = [
  // Single file plugin
  path.join(os.homedir(), 'Documents/Roblox/Plugins/RobloxTestAutomation.lua'),
  // Folder-based plugin
  path.join(os.homedir(), 'Documents/Roblox/Plugins/RobloxTestAutomation/init.server.lua'),
];

/**
 * Check if the plugin is installed in the Roblox plugins folder
 */
export function checkPluginInstalled(): boolean {
  for (const pluginPath of PLUGIN_PATHS) {
    if (fs.existsSync(pluginPath)) {
      return true;
    }
  }
  return false;
}

/**
 * Get the path where the plugin is installed
 */
export function getInstalledPluginPath(): string | null {
  for (const pluginPath of PLUGIN_PATHS) {
    if (fs.existsSync(pluginPath)) {
      return pluginPath;
    }
  }
  return null;
}

/**
 * Get the expected plugin installation directory
 */
export function getPluginDirectory(): string {
  return path.join(os.homedir(), 'Documents/Roblox/Plugins');
}

/**
 * Get instructions for installing the plugin
 */
export function getPluginInstallInstructions(): string {
  const pluginDir = getPluginDirectory();
  return `
Plugin Installation Required
═══════════════════════════════════════════════════════════════════

Run the following command to install the plugin:

  ./roblox-plugin/install.sh

Or manually copy the plugin:

  mkdir -p "${pluginDir}"
  cp roblox-plugin/src/init.server.lua "${pluginDir}/RobloxTestAutomation.lua"

After installation:
1. Open Roblox Studio
2. Check Output window for "[RobloxTestAutomation]" messages
3. The plugin should auto-enable required settings
═══════════════════════════════════════════════════════════════════
`;
}
