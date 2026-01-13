import http from 'http';
import { v4 as uuidv4 } from 'uuid';
import { execSync } from 'child_process';

const PORT = 28859; // Arbitrary port for Roblox plugin communication
const DEBUG = true; // Enable debug logging

/**
 * Kill any existing NODE process LISTENING on our port.
 * This handles the case where Claude Code restarts but old MCP server is still running.
 * Important: Only kills node processes, not Roblox Studio (which has ESTABLISHED connections).
 */
function killExistingPortProcess(): void {
  try {
    // Find only LISTENING processes on the port, filter to node only
    // lsof format: COMMAND PID USER FD TYPE DEVICE SIZE/OFF NODE NAME
    const result = execSync(
      `lsof -i:${PORT} -sTCP:LISTEN 2>/dev/null | grep -i node | awk '{print $2}' || true`,
      { encoding: 'utf8' }
    ).trim();

    if (result) {
      const pids = result.split('\n').filter(p => p && p !== 'PID');
      for (const pid of pids) {
        try {
          console.error(`[HTTP-IPC] Killing stale node process ${pid} listening on port ${PORT}`);
          execSync(`kill -9 ${pid} 2>/dev/null || true`);
        } catch {
          // Ignore errors killing individual processes
        }
      }
      // Brief pause to let port be released
      if (pids.length > 0) {
        execSync('sleep 0.5');
      }
    }
  } catch {
    // Ignore errors - we'll find out when we try to bind
  }
}

export interface Command {
  id: string;
  action: string;
  payload?: Record<string, unknown>;
  timestamp: number;
  targetContext?: string;  // Which context should handle this
}

export interface Response {
  id: string;
  success: boolean;
  result?: unknown;
  error?: string;
  timestamp: number;
  context?: string;  // Which context handled it
}

// Command queue (use Map to support multiple pending commands)
const pendingCommands: Map<string, Command> = new Map();
const responseCallbacks: Map<string, (response: Response) => void> = new Map();

// Track game state (plugin reports this)
let gameIsPlaying = false;

let server: http.Server | null = null;

function debug(msg: string) {
  if (DEBUG) {
    console.error(`[HTTP-IPC] ${msg}`);
  }
}

// Context routing rules
const SERVER_ONLY_ACTIONS = new Set(['execute']);
const EDIT_ONLY_ACTIONS = new Set(['reload', 'savePlace']);
const ANY_CONTEXT_ACTIONS = new Set(['ping', 'diagnostics', 'getState']);

function getTargetContext(action: string): string {
  if (EDIT_ONLY_ACTIONS.has(action)) return 'Edit';
  if (SERVER_ONLY_ACTIONS.has(action) && gameIsPlaying) return 'Server';
  if (ANY_CONTEXT_ACTIONS.has(action)) {
    // Any context can handle, but prefer Server during play, Edit otherwise
    return gameIsPlaying ? 'Server' : 'Edit';
  }
  // Default: Server during play, Edit otherwise
  return gameIsPlaying ? 'Server' : 'Edit';
}

function shouldDeliverToContext(command: Command, requestingContext: string): boolean {
  const target = command.targetContext || getTargetContext(command.action);

  // 'any' means any context can handle it
  if (target === 'any') return true;

  // Otherwise, must match exactly
  return target === requestingContext;
}

export function startHttpServer(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (server) {
      resolve();
      return;
    }

    // Kill any zombie processes from previous MCP server instances
    killExistingPortProcess();

    server = http.createServer((req, res) => {
      // Enable CORS for Roblox HttpService
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

      if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
      }

      const url = new URL(req.url || '/', `http://localhost:${PORT}`);
      debug(`${req.method} ${url.pathname}${url.search}`);

      // GET /command - Plugin polls for pending commands (with context)
      if (req.method === 'GET' && url.pathname === '/command') {
        const requestingContext = url.searchParams.get('context') || 'Edit';

        // Find a command that this context should handle
        let commandToSend: Command | null = null;
        for (const [id, cmd] of pendingCommands) {
          if (shouldDeliverToContext(cmd, requestingContext)) {
            commandToSend = cmd;
            pendingCommands.delete(id);
            break;
          }
        }

        if (commandToSend) {
          debug(`Sending command to ${requestingContext}: ${commandToSend.action} (id: ${commandToSend.id})`);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(commandToSend));
        } else {
          res.writeHead(204); // No content for this context
          res.end();
        }
        return;
      }

      // POST /response - Plugin sends responses
      if (req.method === 'POST' && url.pathname === '/response') {
        const chunks: Buffer[] = [];

        req.on('data', (chunk: Buffer) => {
          chunks.push(chunk);
        });

        req.on('end', () => {
          try {
            const body = Buffer.concat(chunks).toString('utf8');
            debug(`Received response body: ${body.substring(0, 200)}...`);

            const response: Response = JSON.parse(body);
            debug(`Parsed response - id: ${response.id}, success: ${response.success}, context: ${response.context}`);

            const callback = responseCallbacks.get(response.id);
            debug(`Looking for callback with id ${response.id}, found: ${callback !== undefined}`);

            if (callback) {
              debug(`Calling callback for ${response.id}`);
              callback(response);
              responseCallbacks.delete(response.id);
            } else {
              debug(`No callback found for response id: ${response.id}`);
            }

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ received: true }));
          } catch (e) {
            debug(`Error parsing response: ${e}`);
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Invalid JSON', details: String(e) }));
          }
        });

        req.on('error', (e) => {
          debug(`Request error: ${e}`);
        });

        return;
      }

      // POST /state - Plugin reports game state changes
      if (req.method === 'POST' && url.pathname === '/state') {
        const chunks: Buffer[] = [];

        req.on('data', (chunk: Buffer) => {
          chunks.push(chunk);
        });

        req.on('end', () => {
          try {
            const body = Buffer.concat(chunks).toString('utf8');
            const state = JSON.parse(body);

            const wasPlaying = gameIsPlaying;
            gameIsPlaying = state.isPlaying === true;

            if (wasPlaying !== gameIsPlaying) {
              debug(`Game state changed: isPlaying = ${gameIsPlaying}`);
            }

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ received: true, isPlaying: gameIsPlaying }));
          } catch (e) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Invalid JSON' }));
          }
        });

        return;
      }

      // GET /ping - Simple health check
      if (req.method === 'GET' && url.pathname === '/ping') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', timestamp: Date.now() }));
        return;
      }

      // GET /status - Server status
      if (req.method === 'GET' && url.pathname === '/status') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          status: 'running',
          gameIsPlaying,
          pendingCommands: pendingCommands.size,
          pendingCommandIds: Array.from(pendingCommands.keys()),
          pendingResponses: responseCallbacks.size,
          pendingResponseIds: Array.from(responseCallbacks.keys()),
          timestamp: Date.now()
        }));
        return;
      }

      // GET /debug - Show detailed state
      if (req.method === 'GET' && url.pathname === '/debug') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          gameIsPlaying,
          pendingCommands: Array.from(pendingCommands.entries()).map(([id, cmd]) => ({
            id,
            action: cmd.action,
            targetContext: cmd.targetContext || getTargetContext(cmd.action),
            age: Date.now() - cmd.timestamp
          })),
          pendingCallbacks: Array.from(responseCallbacks.keys()),
          timestamp: Date.now()
        }));
        return;
      }

      res.writeHead(404);
      res.end('Not found');
    });

    server.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        const errorMsg = `FATAL: Port ${PORT} is still in use after cleanup attempt. ` +
          `Run 'lsof -ti:${PORT} | xargs kill -9' manually and restart Claude Code.`;
        console.error(`[HTTP-IPC] ${errorMsg}`);
        reject(new Error(errorMsg));
      } else {
        reject(err);
      }
    });

    server.listen(PORT, '127.0.0.1', () => {
      console.error(`HTTP IPC server listening on http://127.0.0.1:${PORT}`);
      resolve();
    });
  });
}

export function stopHttpServer(): Promise<void> {
  return new Promise((resolve) => {
    if (server) {
      server.close(() => {
        server = null;
        resolve();
      });
    } else {
      resolve();
    }
  });
}

export async function sendCommandHttp(
  action: string,
  payload?: Record<string, unknown>,
  timeout = 30000
): Promise<Response> {
  const targetContext = getTargetContext(action);

  const command: Command = {
    id: uuidv4(),
    action,
    payload,
    timestamp: Date.now(),
    targetContext,
  };

  debug(`Queueing command: ${action} (id: ${command.id}, target: ${targetContext})`);

  // Add to pending commands queue
  pendingCommands.set(command.id, command);

  // Wait for response
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      debug(`Timeout for command ${command.id}`);
      responseCallbacks.delete(command.id);
      pendingCommands.delete(command.id);
      reject(new Error(`Timeout waiting for response to command ${command.id} (action: ${action}, target: ${targetContext})`));
    }, timeout);

    responseCallbacks.set(command.id, (response) => {
      debug(`Received response for ${command.id}`);
      clearTimeout(timer);
      resolve(response);
    });
  });
}

export function isHttpServerRunning(): boolean {
  return server !== null && server.listening;
}

export function getHttpPort(): number {
  return PORT;
}

// Allow external code to update game state (e.g., from MCP tools)
export function setGameIsPlaying(isPlaying: boolean): void {
  gameIsPlaying = isPlaying;
  debug(`Game state set externally: isPlaying = ${isPlaying}`);
}

export function getGameIsPlaying(): boolean {
  return gameIsPlaying;
}
