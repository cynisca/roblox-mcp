import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { sendCommand, ensureDirectories, IPC_PATHS } from '../src/ipc.ts';

const execAsync = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function sendStudioControl(action: string): Promise<{ success: boolean; output?: string; error?: string }> {
  try {
    const scriptPath = path.join(__dirname, '..', 'scripts', 'studio-control.sh');
    const { stdout } = await execAsync(`bash "${scriptPath}" ${action}`);
    return { success: true, output: stdout.trim() };
  } catch (e) {
    const error = e as Error & { stderr?: string };
    return { success: false, error: error.stderr || error.message };
  }
}

async function captureScreenshot(filename: string): Promise<{ success: boolean; path?: string; error?: string }> {
  const outputPath = path.join(IPC_PATHS.screenshots, filename);
  try {
    const scriptPath = path.join(__dirname, '..', 'scripts', 'screenshot.sh');
    const { stdout } = await execAsync(`bash "${scriptPath}" "${outputPath}" false`);
    if (stdout.startsWith('captured:')) {
      return { success: true, path: stdout.replace('captured:', '').trim() };
    }
    return { success: false, error: stdout };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

async function runFullIntegration(): Promise<boolean> {
  console.log('=== Full Integration Test ===\n');
  console.log('This test verifies the complete system without requiring the plugin.\n');
  console.log('For full plugin integration, run phase4.test.ts with Studio + plugin.\n');

  await ensureDirectories();

  const steps: { name: string; passed: boolean; error?: string; note?: string }[] = [];

  // Step 1: Check if Studio is running
  console.log('Step 1: Checking if Studio is running...');
  const studioCheck = await sendStudioControl('check');
  const studioRunning = studioCheck.success && studioCheck.output === 'running';
  steps.push({
    name: 'Check Studio running',
    passed: studioRunning,
    note: studioRunning ? 'Studio is running' : 'Studio not detected'
  });

  if (!studioRunning) {
    console.log('  Studio not running - some tests will use fallbacks\n');
  }

  // Step 2: Test IPC directory structure
  console.log('Step 2: Verifying IPC directories...');
  try {
    const dirs = [IPC_PATHS.commands, IPC_PATHS.responses, IPC_PATHS.screenshots, IPC_PATHS.logs];
    for (const dir of dirs) {
      await fs.stat(dir);
    }
    steps.push({ name: 'IPC directories exist', passed: true });
  } catch (e) {
    steps.push({ name: 'IPC directories exist', passed: false, error: (e as Error).message });
  }

  // Step 3: Test focus command
  console.log('Step 3: Testing focus command...');
  if (studioRunning) {
    const focusResult = await sendStudioControl('focus');
    steps.push({
      name: 'Focus command',
      passed: focusResult.success,
      error: focusResult.error,
      note: focusResult.output
    });
  } else {
    steps.push({ name: 'Focus command', passed: true, note: 'Skipped - Studio not running' });
  }

  // Step 4: Test play command
  console.log('Step 4: Testing play command...');
  if (studioRunning) {
    const playResult = await sendStudioControl('play');
    steps.push({
      name: 'Play command',
      passed: playResult.success,
      error: playResult.error,
      note: playResult.output
    });
    await new Promise(r => setTimeout(r, 2000));
  } else {
    steps.push({ name: 'Play command', passed: true, note: 'Skipped - Studio not running' });
  }

  // Step 5: Test screenshot
  console.log('Step 5: Testing screenshot...');
  const screenshotResult = await captureScreenshot('integration-test.png');
  if (screenshotResult.success && screenshotResult.path) {
    const stat = await fs.stat(screenshotResult.path);
    steps.push({
      name: 'Screenshot capture',
      passed: stat.size > 1000,
      note: `Size: ${stat.size} bytes, Path: ${screenshotResult.path}`
    });
  } else {
    steps.push({
      name: 'Screenshot capture',
      passed: false,
      error: screenshotResult.error
    });
  }

  // Step 6: Test stop command
  console.log('Step 6: Testing stop command...');
  if (studioRunning) {
    const stopResult = await sendStudioControl('stop');
    steps.push({
      name: 'Stop command',
      passed: stopResult.success,
      error: stopResult.error,
      note: stopResult.output
    });
    await new Promise(r => setTimeout(r, 1000));
  } else {
    steps.push({ name: 'Stop command', passed: true, note: 'Skipped - Studio not running' });
  }

  // Step 7: Check plugin (optional)
  console.log('Step 7: Checking plugin connectivity...');
  try {
    const pingResult = await sendCommand('ping', {}, 3000);
    steps.push({
      name: 'Plugin ping',
      passed: pingResult.success && pingResult.result === 'pong',
      note: pingResult.success ? 'Plugin responding' : 'Plugin error: ' + pingResult.error
    });
  } catch {
    steps.push({
      name: 'Plugin ping',
      passed: false,
      note: 'Plugin not responding (optional - only needed for script execution)'
    });
  }

  // Step 8: Verify MCP server builds
  console.log('Step 8: Verifying MCP server build...');
  try {
    await fs.stat(path.join(__dirname, '..', 'dist', 'index.js'));
    steps.push({ name: 'MCP server built', passed: true });
  } catch {
    steps.push({
      name: 'MCP server built',
      passed: false,
      note: 'Run: npm run build'
    });
  }

  // Summary
  console.log('\n=== Integration Test Results ===\n');
  let allPassed = true;
  let criticalPassed = true;
  const criticalSteps = ['IPC directories exist', 'Screenshot capture', 'MCP server built'];

  for (const step of steps) {
    const status = step.passed ? '✅' : '❌';
    console.log(`${status} ${step.name}`);
    if (step.error) console.log(`   Error: ${step.error}`);
    if (step.note) console.log(`   Note: ${step.note}`);
    if (!step.passed) {
      allPassed = false;
      if (criticalSteps.includes(step.name)) {
        criticalPassed = false;
      }
    }
  }

  if (criticalPassed) {
    console.log('\n✅ INTEGRATION TEST PASSED (core functionality working)');
    if (!allPassed) {
      console.log('   Some optional features not available (plugin, Studio running)');
    }
  } else {
    console.log('\n❌ INTEGRATION TEST FAILED');
  }

  console.log('\n');
  return criticalPassed;
}

runFullIntegration().then(passed => {
  process.exit(passed ? 0 : 1);
});
