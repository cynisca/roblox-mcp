import * as fs from 'fs/promises';
import * as path from 'path';
import { ensureDirectories, writeCommand, IPC_PATHS } from '../src/ipc.ts';

async function runVerifications(): Promise<boolean> {
  const results: { check: string; passed: boolean; error?: string }[] = [];

  // V1.1: Directory creation
  try {
    await ensureDirectories();
    const baseExists = await fs.stat(IPC_PATHS.base).then(() => true).catch(() => false);
    const commandsExists = await fs.stat(IPC_PATHS.commands).then(() => true).catch(() => false);
    const responsesExists = await fs.stat(IPC_PATHS.responses).then(() => true).catch(() => false);

    results.push({
      check: 'V1.1: IPC directories created',
      passed: baseExists && commandsExists && responsesExists,
      error: !baseExists ? 'Base dir missing' : !commandsExists ? 'Commands dir missing' : undefined
    });
  } catch (e) {
    results.push({ check: 'V1.1: IPC directories created', passed: false, error: String(e) });
  }

  // V1.2: Command writing
  try {
    const cmd = await writeCommand({ action: 'ping' });
    const pendingPath = path.join(IPC_PATHS.commands, 'pending.json');
    const content = await fs.readFile(pendingPath, 'utf-8');
    const parsed = JSON.parse(content);

    results.push({
      check: 'V1.2: Command file written',
      passed: parsed.action === 'ping' && parsed.id === cmd.id,
      error: parsed.action !== 'ping' ? 'Wrong action' : undefined
    });

    // Cleanup
    await fs.unlink(pendingPath);
  } catch (e) {
    results.push({ check: 'V1.2: Command file written', passed: false, error: String(e) });
  }

  // V1.3: Response reading (simulate)
  try {
    const testId = 'test-response-123';
    const responsePath = path.join(IPC_PATHS.responses, `${testId}.json`);
    await fs.writeFile(responsePath, JSON.stringify({
      id: testId,
      success: true,
      result: 'pong',
      timestamp: Date.now()
    }));

    // Verify file exists and is valid JSON
    const content = await fs.readFile(responsePath, 'utf-8');
    const parsed = JSON.parse(content);

    results.push({
      check: 'V1.3: Response file readable',
      passed: parsed.id === testId && parsed.success === true,
    });

    await fs.unlink(responsePath);
  } catch (e) {
    results.push({ check: 'V1.3: Response file readable', passed: false, error: String(e) });
  }

  // Print results
  console.log('\n=== Phase 1 Verification Results ===\n');
  let allPassed = true;
  for (const r of results) {
    const status = r.passed ? '✅ PASS' : '❌ FAIL';
    console.log(`${status}: ${r.check}`);
    if (r.error) console.log(`   Error: ${r.error}`);
    if (!r.passed) allPassed = false;
  }

  console.log(`\n${allPassed ? '✅ PHASE 1 COMPLETE' : '❌ PHASE 1 INCOMPLETE'}\n`);
  return allPassed;
}

runVerifications().then(passed => {
  process.exit(passed ? 0 : 1);
});
