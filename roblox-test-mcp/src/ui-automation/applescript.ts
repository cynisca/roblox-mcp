import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * Run an AppleScript command
 */
export async function runAppleScript(script: string): Promise<string> {
  // Escape single quotes in the script
  const escapedScript = script.replace(/'/g, "'\\''");
  const { stdout } = await execAsync(`osascript -e '${escapedScript}'`, {
    timeout: 10000,
  });
  return stdout.trim();
}

/**
 * Run a multi-line AppleScript
 */
export async function runAppleScriptMultiline(lines: string[]): Promise<string> {
  const args = lines.map(line => `-e '${line.replace(/'/g, "'\\''")}'`).join(' ');
  const { stdout } = await execAsync(`osascript ${args}`, {
    timeout: 10000,
  });
  return stdout.trim();
}

/**
 * Run an AppleScript file
 */
export async function runAppleScriptFile(scriptPath: string): Promise<string> {
  const { stdout } = await execAsync(`osascript "${scriptPath}"`, {
    timeout: 10000,
  });
  return stdout.trim();
}
