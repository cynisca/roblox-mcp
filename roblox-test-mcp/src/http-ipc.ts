import http from 'http';
import { v4 as uuidv4 } from 'uuid';

const PORT = 28859; // Arbitrary port for Roblox plugin communication

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

      // GET /command - Plugin polls for pending commands
      if (req.method === 'GET' && url.pathname === '/command') {
        if (pendingCommand) {
          const cmd = pendingCommand;
          pendingCommand = null; // Clear after sending
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
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
          try {
            const response: Response = JSON.parse(body);
            const callback = responseCallbacks.get(response.id);
            if (callback) {
              callback(response);
              responseCallbacks.delete(response.id);
            }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ received: true }));
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
          pendingCommand: pendingCommand !== null,
          pendingResponses: responseCallbacks.size,
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

  // Set the pending command
  pendingCommand = command;

  // Wait for response
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      responseCallbacks.delete(command.id);
      pendingCommand = null;
      reject(new Error(`Timeout waiting for response to command ${command.id}`));
    }, timeout);

    responseCallbacks.set(command.id, (response) => {
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
