import * as fs from 'fs/promises';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';

// Platform-specific IPC directory (macOS)
const IPC_BASE = process.env.HOME + '/RobloxTestAutomation';

export const IPC_PATHS = {
  base: IPC_BASE,
  commands: path.join(IPC_BASE, 'commands'),
  responses: path.join(IPC_BASE, 'responses'),
  screenshots: path.join(IPC_BASE, 'screenshots'),
  logs: path.join(IPC_BASE, 'logs'),
};

export interface Command {
  id: string;
  action: string;
  payload?: Record<string, unknown>;
  timestamp: number;
}

export interface Response {
  id: string;
  success: boolean;
  result?: unknown;
  error?: string;
  timestamp: number;
}

export async function ensureDirectories(): Promise<void> {
  for (const dir of Object.values(IPC_PATHS)) {
    await fs.mkdir(dir, { recursive: true });
  }
}

export async function writeCommand(command: Partial<Command>): Promise<Command> {
  const fullCommand: Command = {
    id: command.id || uuidv4(),
    action: command.action || 'ping',
    payload: command.payload,
    timestamp: Date.now(),
  };

  const commandPath = path.join(IPC_PATHS.commands, 'pending.json');
  const tempPath = commandPath + '.tmp';

  await fs.writeFile(tempPath, JSON.stringify(fullCommand, null, 2));
  await fs.rename(tempPath, commandPath);

  return fullCommand;
}

export async function readResponse(
  commandId: string,
  timeout = 30000,
  pollInterval = 100
): Promise<Response> {
  const responsePath = path.join(IPC_PATHS.responses, `${commandId}.json`);
  const start = Date.now();

  while (Date.now() - start < timeout) {
    try {
      const content = await fs.readFile(responsePath, 'utf-8');
      const response: Response = JSON.parse(content);
      await fs.unlink(responsePath); // Clean up
      return response;
    } catch {
      await new Promise(r => setTimeout(r, pollInterval));
    }
  }

  throw new Error(`Timeout waiting for response to command ${commandId}`);
}

export async function sendCommand(
  action: string,
  payload?: Record<string, unknown>,
  timeout = 30000
): Promise<Response> {
  const command = await writeCommand({ action, payload });
  return readResponse(command.id, timeout);
}

export async function cleanStaleFiles(maxAgeMs = 60000): Promise<void> {
  const now = Date.now();

  // Clean old commands
  try {
    const pendingPath = path.join(IPC_PATHS.commands, 'pending.json');
    const stat = await fs.stat(pendingPath);
    if (now - stat.mtimeMs > maxAgeMs) {
      await fs.unlink(pendingPath);
    }
  } catch { /* ignore */ }

  // Clean old responses
  try {
    const files = await fs.readdir(IPC_PATHS.responses);
    for (const file of files) {
      const filePath = path.join(IPC_PATHS.responses, file);
      const stat = await fs.stat(filePath);
      if (now - stat.mtimeMs > maxAgeMs) {
        await fs.unlink(filePath);
      }
    }
  } catch { /* ignore */ }
}
