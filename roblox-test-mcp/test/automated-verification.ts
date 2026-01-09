#!/usr/bin/env npx ts-node --esm

/**
 * Automated Verification Suite for Roblox Test Automation
 *
 * Runs all tests to verify the system is working correctly.
 * Prerequisites:
 * - Roblox Studio must be open with a place file
 * - Plugin must be installed
 * - HTTP must be enabled in Game Settings
 */

import { RobloxAutomation } from '../src/automation-v2.js';

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  duration: number;
  details?: Record<string, unknown>;
}

async function runTest(
  name: string,
  testFn: () => Promise<{ passed: boolean; error?: string; details?: Record<string, unknown> }>
): Promise<TestResult> {
  const start = Date.now();
  console.log(`  Running: ${name}...`);

  try {
    const result = await testFn();
    const duration = Date.now() - start;

    if (result.passed) {
      console.log(`  ✅ ${name} (${duration}ms)`);
    } else {
      console.log(`  ❌ ${name} (${duration}ms)`);
      if (result.error) {
        console.log(`     Error: ${result.error}`);
      }
    }

    return {
      name,
      passed: result.passed,
      error: result.error,
      duration,
      details: result.details,
    };
  } catch (e) {
    const duration = Date.now() - start;
    console.log(`  ❌ ${name} (${duration}ms)`);
    console.log(`     Exception: ${(e as Error).message}`);

    return {
      name,
      passed: false,
      error: (e as Error).message,
      duration,
    };
  }
}

export async function runAllTests(): Promise<TestResult[]> {
  const results: TestResult[] = [];
  const automation = new RobloxAutomation();

  console.log('\n');
  console.log('╔══════════════════════════════════════════════════════════════════╗');
  console.log('║       Roblox Test Automation - Verification Suite                ║');
  console.log('╠══════════════════════════════════════════════════════════════════╣');
  console.log('║ Prerequisites:                                                   ║');
  console.log('║   • Roblox Studio open with a place file                         ║');
  console.log('║   • Plugin installed (run: npm run setup:install-plugin)         ║');
  console.log('║   • HTTP enabled in Game Settings → Security                     ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝');
  console.log('\n');

  try {
    console.log('Initializing automation...\n');
    await automation.initialize();

    // ═══════════════════════════════════════════════════════════════════════
    // PHASE 1: Basic Connectivity
    // ═══════════════════════════════════════════════════════════════════════
    console.log('═══ Phase 1: Basic Connectivity ═══\n');

    results.push(await runTest('State Detection', async () => {
      const state = automation.getState();
      return {
        passed: state.studioRunning,
        error: !state.studioRunning ? 'Roblox Studio is not running' : undefined,
        details: state,
      };
    }));

    results.push(await runTest('Plugin Ping', async () => {
      const response = await automation.ping();
      return {
        passed: response.success,
        error: response.error,
      };
    }));

    results.push(await runTest('Plugin Diagnostics', async () => {
      const diag = await automation.getDiagnostics();
      if (!diag) {
        return { passed: false, error: 'Could not get diagnostics' };
      }
      return {
        passed: diag.issues.length === 0,
        error: diag.issues.length > 0 ? `Issues: ${diag.issues.join(', ')}` : undefined,
        details: diag,
      };
    }));

    // ═══════════════════════════════════════════════════════════════════════
    // PHASE 2: Play Mode Control
    // ═══════════════════════════════════════════════════════════════════════
    console.log('\n═══ Phase 2: Play Mode Control ═══\n');

    results.push(await runTest('Start Play Mode', async () => {
      const result = await automation.play({ waitForLoad: true, timeout: 20000 });
      return {
        passed: result.success,
        error: result.error,
        details: { selfHealed: result.selfHealed },
      };
    }));

    // Give play mode time to stabilize
    await new Promise(r => setTimeout(r, 2000));

    results.push(await runTest('Verify Play State', async () => {
      const state = automation.getState();
      return {
        passed: state.isPlaying,
        error: !state.isPlaying ? 'Not in play mode after starting' : undefined,
        details: { isPlaying: state.isPlaying, context: state.context },
      };
    }));

    // ═══════════════════════════════════════════════════════════════════════
    // PHASE 3: Script Execution
    // ═══════════════════════════════════════════════════════════════════════
    console.log('\n═══ Phase 3: Script Execution ═══\n');

    results.push(await runTest('Simple Math', async () => {
      const result = await automation.execute('return 1 + 1');
      return {
        passed: result.success && result.result === 2,
        error: result.error,
        details: { result: result.result },
      };
    }));

    results.push(await runTest('Workspace Access', async () => {
      const result = await automation.execute('return workspace.Name');
      return {
        passed: result.success && result.result === 'Workspace',
        error: result.error,
        details: { result: result.result },
      };
    }));

    results.push(await runTest('Multi-line Script', async () => {
      const result = await automation.execute(`
        local total = 0
        for i = 1, 10 do
          total = total + i
        end
        return total
      `);
      return {
        passed: result.success && result.result === 55,
        error: result.error,
        details: { result: result.result },
      };
    }));

    results.push(await runTest('Get Workspace Children', async () => {
      const result = await automation.execute(`
        local names = {}
        for _, child in pairs(workspace:GetChildren()) do
          table.insert(names, child.Name)
        end
        return names
      `);
      return {
        passed: result.success && Array.isArray(result.result),
        error: result.error,
        details: { childCount: Array.isArray(result.result) ? result.result.length : 0 },
      };
    }));

    results.push(await runTest('Create and Destroy Part', async () => {
      const result = await automation.execute(`
        local part = Instance.new("Part")
        part.Name = "TestVerificationPart"
        part.Position = Vector3.new(0, 100, 0)
        part.Anchored = true
        part.Parent = workspace

        wait(0.1)

        local found = workspace:FindFirstChild("TestVerificationPart")
        if found then
          found:Destroy()
          return true
        end
        return false
      `);
      return {
        passed: result.success && result.result === true,
        error: result.error,
        details: { result: result.result },
      };
    }));

    // ═══════════════════════════════════════════════════════════════════════
    // PHASE 4: Screenshot
    // ═══════════════════════════════════════════════════════════════════════
    console.log('\n═══ Phase 4: Screenshot ═══\n');

    results.push(await runTest('Capture Screenshot', async () => {
      const result = await automation.screenshot();
      return {
        passed: result.success && (result.base64?.length || 0) > 1000,
        error: result.error,
        details: {
          path: result.path,
          base64Length: result.base64?.length,
        },
      };
    }));

    // ═══════════════════════════════════════════════════════════════════════
    // PHASE 5: Stop Play Mode
    // ═══════════════════════════════════════════════════════════════════════
    console.log('\n═══ Phase 5: Stop Play Mode ═══\n');

    results.push(await runTest('Stop Play Mode', async () => {
      const result = await automation.stop({ timeout: 15000 });
      return {
        passed: result.success,
        error: result.error,
      };
    }));

    await new Promise(r => setTimeout(r, 2000));

    results.push(await runTest('Verify Edit State', async () => {
      await automation.refreshState();
      const state = automation.getState();
      return {
        passed: !state.isPlaying,
        error: state.isPlaying ? 'Still in play mode after stopping' : undefined,
        details: { isPlaying: state.isPlaying },
      };
    }));

    // ═══════════════════════════════════════════════════════════════════════
    // PHASE 6: Full Test Scenario
    // ═══════════════════════════════════════════════════════════════════════
    console.log('\n═══ Phase 6: Full Test Scenario ═══\n');

    results.push(await runTest('Complete Test Flow', async () => {
      const result = await automation.testScenario({
        setupScript: `
          local marker = Instance.new("Part")
          marker.Name = "ScenarioTestMarker"
          marker.Size = Vector3.new(5, 5, 5)
          marker.Position = Vector3.new(0, 50, 0)
          marker.BrickColor = BrickColor.new("Bright green")
          marker.Anchored = true
          marker.Parent = workspace
          return "Marker created"
        `,
        testScript: `
          local marker = workspace:FindFirstChild("ScenarioTestMarker")
          if marker then
            local result = {
              found = true,
              color = tostring(marker.BrickColor),
              position = {x = marker.Position.X, y = marker.Position.Y, z = marker.Position.Z}
            }
            marker:Destroy()
            return result
          end
          return {found = false}
        `,
        waitSeconds: 1,
      });

      const setupOk = result.setupResult?.success === true;
      const testOk = result.testResult?.success === true;
      const testFound = (result.testResult?.result as { found?: boolean })?.found === true;
      const screenshotOk = result.screenshot?.success === true;

      return {
        passed: result.success && setupOk && testOk && testFound && screenshotOk,
        error: result.error,
        details: {
          setupSuccess: setupOk,
          testSuccess: testOk,
          markerFound: testFound,
          screenshotSuccess: screenshotOk,
        },
      };
    }));

  } finally {
    console.log('\nShutting down...');
    await automation.shutdown();
  }

  // ═══════════════════════════════════════════════════════════════════════
  // RESULTS SUMMARY
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n');
  console.log('╔══════════════════════════════════════════════════════════════════╗');
  console.log('║                         TEST RESULTS                             ║');
  console.log('╠══════════════════════════════════════════════════════════════════╣');

  let passCount = 0;
  let failCount = 0;

  for (const r of results) {
    const status = r.passed ? '✅ PASS' : '❌ FAIL';
    const duration = `${r.duration}ms`;
    console.log(`║ ${status}  ${r.name.padEnd(40)} ${duration.padStart(8)} ║`);

    if (r.passed) passCount++;
    else failCount++;
  }

  console.log('╠══════════════════════════════════════════════════════════════════╣');
  console.log(`║ Total: ${results.length}  │  Passed: ${passCount}  │  Failed: ${failCount}`.padEnd(67) + '║');
  console.log('╚══════════════════════════════════════════════════════════════════╝');
  console.log('\n');

  if (failCount === 0) {
    console.log('🎉 All tests passed! System is ready for automated game testing.\n');
  } else {
    console.log('⚠️  Some tests failed. Review errors above and fix issues.\n');

    // Show failed tests
    console.log('Failed tests:');
    for (const r of results.filter(r => !r.passed)) {
      console.log(`  • ${r.name}: ${r.error}`);
    }
    console.log('');
  }

  return results;
}

// Run if executed directly
runAllTests()
  .then(results => {
    const allPassed = results.every(r => r.passed);
    process.exit(allPassed ? 0 : 1);
  })
  .catch(e => {
    console.error('Test suite failed:', e);
    process.exit(1);
  });
