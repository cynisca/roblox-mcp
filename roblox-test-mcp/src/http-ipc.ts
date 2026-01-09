import http from 'http';
import { v4 as uuidv4 } from 'uuid';

const PORT = 28859; // Arbitrary port for Roblox plugin communication
const DEBUG = true; // Enable debug logging

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

// Queue for pending commands
let pendingCommand: Command | null = null;
const responseCallbacks: Map<string, (response: Response) => void> = new Map();

let server: http.Server | null = null;

function debug(msg: string) {
  if (DEBUG) {
    console.error(`[HTTP-IPC] ${msg}`);
  }
}

export function startHttpServer(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (server) {
      resolve();
      return;
    }

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
      debug(`${req.method} ${url.pathname}`);

      // GET /command - Plugin polls for pending commands
      if (req.method === 'GET' && url.pathname === '/command') {
        if (pendingCommand) {
          const cmd = pendingCommand;
          pendingCommand = null; // Clear after sending
          debug(`Sending command: ${cmd.action} (id: ${cmd.id})`);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(cmd));
        } else {
          res.writeHead(204); // No content
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
            debug(`Parsed response - id: ${response.id}, success: ${response.success}`);

            const callback = responseCallbacks.get(response.id);
            debug(`Looking for callback with id ${response.id}, found: ${callback !== undefined}`);
            debug(`Pending callbacks: ${Array.from(responseCallbacks.keys()).join(', ')}`);

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
          pendingCommand: pendingCommand !== null,
          pendingResponses: responseCallbacks.size,
          pendingIds: Array.from(responseCallbacks.keys()),
          timestamp: Date.now()
        }));
        return;
      }

      // GET /debug - Show recent activity
      if (req.method === 'GET' && url.pathname === '/debug') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          pendingCommand,
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
        console.error(`Port ${PORT} is already in use. HTTP IPC server not started.`);
        resolve(); // Don't fail, just continue without HTTP server
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
  const command: Command = {
    id: uuidv4(),
    action,
    payload,
    timestamp: Date.now(),
  };

  debug(`Queueing command: ${action} (id: ${command.id})`);

  // Set the pending command
  pendingCommand = command;

  // Wait for response
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      debug(`Timeout for command ${command.id}`);
      responseCallbacks.delete(command.id);
      pendingCommand = null;
      reject(new Error(`Timeout waiting for response to command ${command.id}`));
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
