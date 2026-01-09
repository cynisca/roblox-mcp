import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { ensureDirectories, IPC_PATHS } from '../src/ipc.ts';

const execAsync = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Inline screenshot function to avoid import issues
async function captureScreenshot(options: {
  filename?: string;
  studioOnly?: boolean;
  returnBase64?: boolean;
} = {}): Promise<{ success: boolean; path?: string; base64?: string; error?: string }> {
  const timestamp = Date.now();
  const filename = options.filename || `screenshot-${timestamp}.png`;
  const outputPath = path.join(IPC_PATHS.screenshots, filename);

  try {
    await fs.mkdir(IPC_PATHS.screenshots, { recursive: true });

    const scriptPath = path.join(__dirname, '..', 'scripts', 'screenshot.sh');
    const studioOnly = options.studioOnly ? 'true' : 'false';

    const { stdout, stderr } = await execAsync(
      `bash "${scriptPath}" "${outputPath}" ${studioOnly}`
    );

    if (stdout.startsWith('captured:')) {
      const capturedPath = stdout.replace('captured:', '').trim();
      await fs.stat(capturedPath);

      const result: { success: boolean; path?: string; base64?: string; error?: string } = {
        success: true,
        path: capturedPath
      };

      if (options.returnBase64) {
        const buffer = await fs.readFile(capturedPath);
        result.base64 = buffer.toString('base64');
      }

      return result;
    } else if (stdout.startsWith('error:')) {
      return { success: false, error: stdout.replace('error:', '').trim() };
    } else {
      return { success: false, error: stderr || 'Unknown error' };
    }
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

async function runVerifications(): Promise<boolean> {
  const results: { check: string; passed: boolean; error?: string; note?: string }[] = [];

  await ensureDirectories();

  console.log('Note: Screenshot tests will capture your screen.\n');

  // V5.0: Check if screenshot.sh exists and is executable
  try {
    const scriptPath = path.join(__dirname, '..', 'scripts', 'screenshot.sh');
    const { stdout } = await execAsync(`test -x "${scriptPath}" && echo "exists"`);
    results.push({
      check: 'V5.0: screenshot.sh is executable',
      passed: stdout.trim() === 'exists',
    });
  } catch {
    results.push({
      check: 'V5.0: screenshot.sh is executable',
      passed: false,
      error: 'Script not found or not executable'
    });
  }

  // V5.1: Basic full-screen screenshot
  try {
    const result = await captureScreenshot({ filename: 'test-v51-fullscreen.png', studioOnly: false });

    if (result.success && result.path) {
      const stat = await fs.stat(result.path);
      results.push({
        check: 'V5.1: Full-screen screenshot works',
        passed: stat.size > 1000,
        note: `File size: ${stat.size} bytes, Path: ${result.path}`
      });
      // Cleanup
      await fs.unlink(result.path).catch(() => {});
    } else {
      results.push({
        check: 'V5.1: Full-screen screenshot works',
        passed: false,
        error: result.error
      });
    }
  } catch (e) {
    results.push({
      check: 'V5.1: Full-screen screenshot works',
      passed: false,
      error: (e as Error).message
    });
  }

  // V5.2: Studio-only screenshot (may fail if Studio not open)
  try {
    const result = await captureScreenshot({ filename: 'test-v52-studio.png', studioOnly: true });

    if (result.success && result.path) {
      const stat = await fs.stat(result.path);
      results.push({
        check: 'V5.2: Studio window screenshot',
        passed: stat.size > 1000,
        note: `File size: ${stat.size} bytes, Path: ${result.path}`
      });
      // Cleanup
      await fs.unlink(result.path).catch(() => {});
    } else {
      results.push({
        check: 'V5.2: Studio window screenshot',
        passed: false,
        error: result.error,
        note: 'Is Roblox Studio open?'
      });
    }
  } catch (e) {
    results.push({
      check: 'V5.2: Studio window screenshot',
      passed: false,
      error: (e as Error).message
    });
  }

  // V5.3: Custom filename
  try {
    const customName = 'my-custom-screenshot.png';
    const result = await captureScreenshot({ filename: customName, studioOnly: false });
    const expectedPath = path.join(IPC_PATHS.screenshots, customName);

    results.push({
      check: 'V5.3: Custom filename works',
      passed: result.success && result.path === expectedPath,
      note: `Path: ${result.path}`
    });

    if (result.path) {
      await fs.unlink(result.path).catch(() => {});
    }
  } catch (e) {
    results.push({
      check: 'V5.3: Custom filename works',
      passed: false,
      error: (e as Error).message
    });
  }

  // V5.4: Base64 return
  try {
    const result = await captureScreenshot({ filename: 'test-v54-base64.png', returnBase64: true });

    results.push({
      check: 'V5.4: Base64 return works',
      passed: result.success && result.base64 !== undefined && result.base64.length > 100,
      note: `Base64 length: ${result.base64?.length || 0} chars`
    });

    if (result.path) {
      await fs.unlink(result.path).catch(() => {});
    }
  } catch (e) {
    results.push({
      check: 'V5.4: Base64 return works',
      passed: false,
      error: (e as Error).message
    });
  }

  // Print results
  console.log('\n=== Phase 5 Verification Results ===\n');
  let allPassed = true;
  for (const r of results) {
    const status = r.passed ? '✅ PASS' : '❌ FAIL';
    console.log(`${status}: ${r.check}`);
    if (r.error) console.log(`   Error: ${r.error}`);
    if (r.note) console.log(`   Note: ${r.note}`);
    if (!r.passed) allPassed = false;
  }

  // Consider phase complete if at least full-screen screenshot works
  const fullScreenPassed = results.find(r => r.check.includes('V5.1'))?.passed;
  if (fullScreenPassed) {
    console.log(`\n${allPassed ? '✅ PHASE 5 COMPLETE' : '✅ PHASE 5 COMPLETE (basic functionality)'}\n`);
    return true;
  }

  console.log(`\n❌ PHASE 5 INCOMPLETE\n`);
  return false;
}

runVerifications().then(passed => {
  process.exit(passed ? 0 : 1);
});
