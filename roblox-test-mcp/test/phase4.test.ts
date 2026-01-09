import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { sendCommand, ensureDirectories } from '../src/ipc.ts';

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

async function runVerifications(): Promise<boolean> {
  const results: { check: string; passed: boolean; error?: string; note?: string }[] = [];

  await ensureDirectories();

  console.log('Note: These tests require Roblox Studio to be running with the plugin loaded.\n');
  console.log('Studio must be in PLAY MODE for script execution tests.\n');

  // Check if plugin is responding first
  console.log('Checking plugin connectivity...');
  try {
    const pingResult = await sendCommand('ping', {}, 5000);
    if (!pingResult.success || pingResult.result !== 'pong') {
      console.log('\n⚠️  Plugin is not responding. Make sure:');
      console.log('   1. Roblox Studio is open');
      console.log('   2. The plugin is installed and loaded');
      console.log('   3. Check Output window for [RobloxTestAutomation] messages\n');
      console.log('=== Phase 4 Verification Results ===\n');
      console.log('❌ FAIL: Plugin not responding');
      console.log('\n❌ PHASE 4 INCOMPLETE - Plugin required\n');
      return false;
    }
    results.push({ check: 'V4.0: Plugin responding', passed: true, note: 'Ping successful' });
  } catch (e) {
    console.log('\n⚠️  Plugin is not responding (timeout).');
    console.log('   Phase 4 requires the Roblox Studio plugin.\n');
    console.log('=== Phase 4 Verification Results ===\n');
    console.log('❌ FAIL: Plugin not responding - ' + (e as Error).message);
    console.log('\n❌ PHASE 4 INCOMPLETE - Plugin required\n');
    return false;
  }

  // Start play mode
  console.log('Starting play mode...');
  await sendStudioControl('play');
  await new Promise(r => setTimeout(r, 3000));

  // V4.1: Simple script execution
  try {
    const result = await sendCommand('execute', { script: 'return 1 + 1' }, 10000);
    results.push({
      check: 'V4.1: Simple script execution',
      passed: result.success && result.result === 2,
      error: result.error,
      note: `Result: ${result.result}`
    });
  } catch (e) {
    results.push({ check: 'V4.1: Simple script execution', passed: false, error: (e as Error).message });
  }

  // V4.2: Script with game access
  try {
    const result = await sendCommand('execute', { script: 'return workspace.Name' }, 10000);
    results.push({
      check: 'V4.2: Script with game access',
      passed: result.success && result.result === 'Workspace',
      error: result.error,
      note: `Result: ${result.result}`
    });
  } catch (e) {
    results.push({ check: 'V4.2: Script with game access', passed: false, error: (e as Error).message });
  }

  // V4.3: Script error handling
  try {
    const result = await sendCommand('execute', { script: 'error("intentional test error")' }, 10000);
    results.push({
      check: 'V4.3: Script error handling',
      passed: result.success === false && result.error !== undefined && result.error.includes('intentional'),
      error: result.success ? 'Should have returned error' : undefined,
      note: `Error message: ${result.error}`
    });
  } catch (e) {
    results.push({ check: 'V4.3: Script error handling', passed: false, error: (e as Error).message });
  }

  // V4.4: Script with player interaction
  try {
    const result = await sendCommand('execute', {
      script: `
        local Players = game:GetService("Players")
        local player = Players.LocalPlayer
        if player then
          return player.Name
        else
          return "NO_PLAYER"
        end
      `
    }, 10000);
    results.push({
      check: 'V4.4: Script with player interaction',
      passed: result.success && result.result !== 'NO_PLAYER',
      error: result.error,
      note: `Player name: ${result.result}`
    });
  } catch (e) {
    results.push({ check: 'V4.4: Script with player interaction', passed: false, error: (e as Error).message });
  }

  // V4.5: Complex script - create and find part
  try {
    const result = await sendCommand('execute', {
      script: `
        local testPart = Instance.new("Part")
        testPart.Name = "AutomationTestPart"
        testPart.Position = Vector3.new(0, 50, 0)
        testPart.Anchored = true
        testPart.Parent = workspace

        wait(0.1)

        local found = workspace:FindFirstChild("AutomationTestPart")
        if found then
          found:Destroy()
          return "Part created and destroyed successfully"
        else
          return "Part not found after creation"
        end
      `
    }, 15000);
    results.push({
      check: 'V4.5: Complex script - create/destroy part',
      passed: result.success && (result.result as string)?.includes('successfully'),
      error: result.error,
      note: `Result: ${result.result}`
    });
  } catch (e) {
    results.push({ check: 'V4.5: Complex script - create/destroy part', passed: false, error: (e as Error).message });
  }

  // Cleanup: stop play mode
  console.log('\nStopping play mode...');
  await sendStudioControl('stop');

  // Print results
  console.log('\n=== Phase 4 Verification Results ===\n');
  let allPassed = true;
  for (const r of results) {
    const status = r.passed ? '✅ PASS' : '❌ FAIL';
    console.log(`${status}: ${r.check}`);
    if (r.error) console.log(`   Error: ${r.error}`);
    if (r.note) console.log(`   Note: ${r.note}`);
    if (!r.passed) allPassed = false;
  }

  console.log(`\n${allPassed ? '✅ PHASE 4 COMPLETE' : '❌ PHASE 4 INCOMPLETE'}\n`);
  return allPassed;
}

runVerifications().then(passed => {
  process.exit(passed ? 0 : 1);
});
