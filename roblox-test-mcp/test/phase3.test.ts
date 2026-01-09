import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { sendCommand, ensureDirectories } from '../src/ipc.ts';

const execAsync = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Simple automation for testing (duplicated to avoid import issues)
async function sendStudioControl(action: string): Promise<{ success: boolean; output?: string; error?: string }> {
  try {
    const scriptPath = path.join(__dirname, '..', 'scripts', 'studio-control.sh');
    const { stdout, stderr } = await execAsync(`bash "${scriptPath}" ${action}`);
    return { success: true, output: stdout.trim() };
  } catch (e) {
    const error = e as Error & { stderr?: string };
    return { success: false, error: error.stderr || error.message };
  }
}

async function runVerifications(): Promise<boolean> {
  const results: { check: string; passed: boolean; error?: string; note?: string }[] = [];

  await ensureDirectories();

  console.log('Note: These tests require Roblox Studio to be open with a place loaded.\n');
  console.log('Also requires Accessibility permissions for Terminal/iTerm.\n');

  // V3.0: Check if studio-control.sh exists and is executable
  try {
    const scriptPath = path.join(__dirname, '..', 'scripts', 'studio-control.sh');
    const { stdout } = await execAsync(`test -x "${scriptPath}" && echo "exists"`);
    results.push({
      check: 'V3.0: studio-control.sh is executable',
      passed: stdout.trim() === 'exists',
    });
  } catch (e) {
    results.push({
      check: 'V3.0: studio-control.sh is executable',
      passed: false,
      error: 'Script not found or not executable'
    });
  }

  // V3.0b: Check if Studio is running
  const studioCheck = await sendStudioControl('check');
  const studioRunning = studioCheck.success && studioCheck.output === 'running';
  results.push({
    check: 'V3.0b: Roblox Studio is running',
    passed: studioRunning,
    note: studioRunning ? 'Studio detected' : 'Studio not running - some tests will be skipped'
  });

  if (!studioRunning) {
    console.log('\n⚠️  Roblox Studio is not running. Skipping play/stop tests.\n');
    console.log('=== Phase 3 Verification Results ===\n');
    for (const r of results) {
      const status = r.passed ? '✅ PASS' : '❌ FAIL';
      console.log(`${status}: ${r.check}`);
      if (r.error) console.log(`   Error: ${r.error}`);
      if (r.note) console.log(`   Note: ${r.note}`);
    }
    console.log('\n⚠️  PHASE 3 PARTIAL - Open Roblox Studio to complete all tests\n');
    return results[0].passed; // Return true if script is at least executable
  }

  // V3.1: Play command
  try {
    console.log('Testing play command...');
    const playResult = await sendStudioControl('play');

    results.push({
      check: 'V3.1: Play command sent',
      passed: playResult.success,
      error: playResult.error,
      note: playResult.output
    });

    // Give it time to start
    await new Promise(r => setTimeout(r, 3000));

    // Check state via plugin
    try {
      const state = await sendCommand('getState', {}, 5000);
      results.push({
        check: 'V3.1b: Play mode verified via plugin',
        passed: state.success && (state.result as Record<string, unknown>)?.isPlaying === true,
        note: `State: ${JSON.stringify(state.result)}`
      });
    } catch (e) {
      results.push({
        check: 'V3.1b: Play mode verified via plugin',
        passed: false,
        error: (e as Error).message,
        note: 'Plugin may not be responding'
      });
    }
  } catch (e) {
    results.push({
      check: 'V3.1: Play command sent',
      passed: false,
      error: (e as Error).message
    });
  }

  // V3.2: Stop command
  try {
    console.log('Testing stop command...');
    await new Promise(r => setTimeout(r, 1000));

    const stopResult = await sendStudioControl('stop');
    results.push({
      check: 'V3.2: Stop command sent',
      passed: stopResult.success,
      error: stopResult.error,
      note: stopResult.output
    });

    await new Promise(r => setTimeout(r, 2000));

    // Verify stopped via plugin
    try {
      const state = await sendCommand('getState', {}, 5000);
      results.push({
        check: 'V3.2b: Edit mode verified via plugin',
        passed: state.success && (state.result as Record<string, unknown>)?.isPlaying === false,
        note: `State: ${JSON.stringify(state.result)}`
      });
    } catch (e) {
      results.push({
        check: 'V3.2b: Edit mode verified via plugin',
        passed: false,
        error: (e as Error).message
      });
    }
  } catch (e) {
    results.push({
      check: 'V3.2: Stop command sent',
      passed: false,
      error: (e as Error).message
    });
  }

  // V3.3: Focus command
  try {
    const focusResult = await sendStudioControl('focus');
    results.push({
      check: 'V3.3: Focus command works',
      passed: focusResult.success,
      error: focusResult.error,
      note: focusResult.output
    });
  } catch (e) {
    results.push({
      check: 'V3.3: Focus command works',
      passed: false,
      error: (e as Error).message
    });
  }

  // Print results
  console.log('\n=== Phase 3 Verification Results ===\n');
  let allPassed = true;
  for (const r of results) {
    const status = r.passed ? '✅ PASS' : '❌ FAIL';
    console.log(`${status}: ${r.check}`);
    if (r.error) console.log(`   Error: ${r.error}`);
    if (r.note) console.log(`   Note: ${r.note}`);
    if (!r.passed) allPassed = false;
  }

  console.log(`\n${allPassed ? '✅ PHASE 3 COMPLETE' : '❌ PHASE 3 INCOMPLETE'}\n`);
  return allPassed;
}

runVerifications().then(passed => {
  process.exit(passed ? 0 : 1);
});
