import { execSync } from 'child_process';
import http from 'http';

const HTTP_PORT = 28859;

/**
 * Check if Roblox Studio is running
 */
export function checkStudioRunning(): boolean {
  try {
    const result = execSync(
      `osascript -e 'tell application "System Events" to return (name of processes) contains "RobloxStudio"'`,
      { timeout: 5000, stdio: 'pipe' }
    );
    return result.toString().trim() === 'true';
  } catch {
    return false;
  }
}

/**
 * Check if our HTTP server can start (port available)
 */
export function checkHttpPortAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    const server = http.createServer();

    server.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        // Port in use - might be our server already running
        resolve(true); // Consider this OK
      } else {
        resolve(false);
      }
    });

    server.listen(HTTP_PORT, '127.0.0.1', () => {
      server.close(() => resolve(true));
    });
  });
}

/**
 * Check if the plugin is responding via HTTP
 */
export function checkPluginResponding(): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.request({
      hostname: '127.0.0.1',
      port: HTTP_PORT,
      path: '/ping',
      method: 'GET',
      timeout: 3000,
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve(json.status === 'ok');
        } catch {
          resolve(false);
        }
      });
    });

    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });

    req.end();
  });
}

/**
 * Get Roblox Studio window title (useful for debugging)
 */
export function getStudioWindowTitle(): string | null {
  try {
    const result = execSync(
      `osascript -e 'tell application "System Events" to tell process "RobloxStudio" to return name of front window'`,
      { timeout: 5000, stdio: 'pipe' }
    );
    return result.toString().trim();
  } catch {
    return null;
  }
}
