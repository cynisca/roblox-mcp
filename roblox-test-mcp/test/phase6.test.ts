import { spawn, execSync } from 'child_process';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface MCPResponse {
  jsonrpc: string;
  id: number;
  result?: {
    tools?: Array<{ name: string; description: string }>;
    content?: Array<{ type: string; text?: string }>;
  };
  error?: { message: string };
}

async function sendMCPRequest(proc: ReturnType<typeof spawn>, method: string, params: Record<string, unknown> = {}): Promise<MCPResponse> {
  return new Promise((resolve, reject) => {
    const id = Date.now();
    const request = JSON.stringify({ jsonrpc: "2.0", id, method, params });

    let response = '';
    const timeout = setTimeout(() => {
      proc.stdout?.removeListener('data', handler);
      reject(new Error('Timeout waiting for MCP response'));
    }, 10000);

    const handler = (data: Buffer) => {
      response += data.toString();
      // Try to parse each line
      const lines = response.split('\n');
      for (const line of lines) {
        if (line.trim()) {
          try {
            const parsed = JSON.parse(line);
            if (parsed.id === id) {
              clearTimeout(timeout);
              proc.stdout?.removeListener('data', handler);
              resolve(parsed);
              return;
            }
          } catch {
            // Keep accumulating
          }
        }
      }
    };

    proc.stdout?.on('data', handler);
    proc.stdin?.write(request + '\n');
  });
}

async function runVerifications(): Promise<boolean> {
  const results: { check: string; passed: boolean; error?: string; note?: string }[] = [];
  const projectDir = path.join(__dirname, '..');

  // Build first
  console.log('Building TypeScript...\n');

  try {
    execSync('npm run build', { cwd: projectDir, stdio: 'pipe' });
    results.push({ check: 'V6.1: Build succeeds', passed: true });
  } catch (e) {
    const error = e as Error & { stderr?: Buffer };
    results.push({
      check: 'V6.1: Build succeeds',
      passed: false,
      error: error.stderr?.toString() || error.message
    });
    // Can't continue if build fails
    console.log('\n=== Phase 6 Verification Results ===\n');
    console.log('❌ FAIL: V6.1: Build succeeds');
    console.log(`   Error: ${error.message}`);
    console.log('\n❌ PHASE 6 INCOMPLETE - Build failed\n');
    return false;
  }

  // Start MCP server
  console.log('Starting MCP server...\n');
  const serverProc = spawn('node', ['dist/index.js'], {
    cwd: projectDir,
    stdio: ['pipe', 'pipe', 'pipe']
  });

  // Wait for server to start
  await new Promise(r => setTimeout(r, 2000));

  try {
    // V6.2: Tool listing
    try {
      const response = await sendMCPRequest(serverProc, 'tools/list');
      const tools = response.result?.tools || [];
      const toolNames = tools.map((t) => t.name);

      const expectedTools = ['roblox_play', 'roblox_stop', 'roblox_execute', 'roblox_screenshot', 'roblox_get_state', 'roblox_ping', 'roblox_focus', 'roblox_test_scenario'];
      const hasAll = expectedTools.every((t: string) => toolNames.includes(t));

      results.push({
        check: 'V6.2: Tool listing works',
        passed: hasAll,
        note: `Found tools: ${toolNames.join(', ')}`
      });
    } catch (e) {
      results.push({ check: 'V6.2: Tool listing works', passed: false, error: (e as Error).message });
    }

    // V6.3: Focus command via MCP (doesn't require plugin)
    try {
      const response = await sendMCPRequest(serverProc, 'tools/call', {
        name: 'roblox_focus',
        arguments: {}
      });

      const content = response.result?.content?.[0]?.text;
      const result = JSON.parse(content || '{}');

      results.push({
        check: 'V6.3: Focus command via MCP',
        passed: result.success === true,
        note: `Result: ${content}`
      });
    } catch (e) {
      results.push({ check: 'V6.3: Focus command via MCP', passed: false, error: (e as Error).message });
    }

    // V6.4: Screenshot via MCP (doesn't require plugin)
    try {
      const response = await sendMCPRequest(serverProc, 'tools/call', {
        name: 'roblox_screenshot',
        arguments: { studioOnly: false, filename: 'mcp-test-screenshot.png' }
      });

      const content = response.result?.content;
      const hasImage = content?.some((c: { type: string }) => c.type === 'image');
      const hasText = content?.some((c: { type: string; text?: string }) => c.type === 'text' && c.text?.includes('Screenshot saved'));

      results.push({
        check: 'V6.4: Screenshot via MCP',
        passed: hasText === true,
        note: `Has image: ${hasImage}, Has text: ${hasText}`
      });
    } catch (e) {
      results.push({ check: 'V6.4: Screenshot via MCP', passed: false, error: (e as Error).message });
    }

  } finally {
    // Cleanup
    serverProc.kill();
  }

  // Print results
  console.log('\n=== Phase 6 Verification Results ===\n');
  let allPassed = true;
  for (const r of results) {
    const status = r.passed ? '✅ PASS' : '❌ FAIL';
    console.log(`${status}: ${r.check}`);
    if (r.error) console.log(`   Error: ${r.error}`);
    if (r.note) console.log(`   Note: ${r.note}`);
    if (!r.passed) allPassed = false;
  }

  console.log(`\n${allPassed ? '✅ PHASE 6 COMPLETE' : '❌ PHASE 6 INCOMPLETE'}\n`);
  return allPassed;
}

runVerifications().then(passed => {
  process.exit(passed ? 0 : 1);
});
