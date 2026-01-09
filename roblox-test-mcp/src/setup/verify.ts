#!/usr/bin/env npx ts-node --esm

import { checkAccessibilityPermission, getAccessibilityInstructions } from './check-accessibility.js';
import { checkPluginInstalled, getPluginInstallInstructions } from './check-plugin.js';
import { checkStudioRunning, checkHttpPortAvailable, checkPluginResponding } from './check-studio.js';

export interface SetupStatus {
  step: string;
  status: 'pass' | 'fail' | 'warn' | 'manual';
  message: string;
  fix?: string;
}

export async function verifySetup(): Promise<SetupStatus[]> {
  const results: SetupStatus[] = [];

  // 1. Accessibility Permission
  console.log('Checking accessibility permission...');
  const hasAccessibility = checkAccessibilityPermission();
  results.push({
    step: 'Accessibility Permission',
    status: hasAccessibility ? 'pass' : 'manual',
    message: hasAccessibility ? 'Granted' : 'Not granted',
    fix: hasAccessibility ? undefined : 'System Preferences → Security & Privacy → Accessibility'
  });

  // 2. Plugin Installed
  console.log('Checking plugin installation...');
  const pluginInstalled = checkPluginInstalled();
  results.push({
    step: 'Plugin Installed',
    status: pluginInstalled ? 'pass' : 'fail',
    message: pluginInstalled ? 'Found in plugins folder' : 'Not found',
    fix: pluginInstalled ? undefined : 'Run: ./roblox-plugin/install.sh'
  });

  // 3. HTTP Port Available
  console.log('Checking HTTP port availability...');
  const portOk = await checkHttpPortAvailable();
  results.push({
    step: 'HTTP Port (28859)',
    status: portOk ? 'pass' : 'fail',
    message: portOk ? 'Available' : 'Port in use or error',
    fix: portOk ? undefined : 'Kill process using port 28859'
  });

  // 4. Roblox Studio Running
  console.log('Checking if Roblox Studio is running...');
  const studioRunning = checkStudioRunning();
  results.push({
    step: 'Roblox Studio',
    status: studioRunning ? 'pass' : 'warn',
    message: studioRunning ? 'Running' : 'Not running',
    fix: studioRunning ? undefined : 'Open Roblox Studio with a place file'
  });

  // 5. Plugin Responding (only if Studio is running)
  if (studioRunning) {
    console.log('Checking plugin communication...');
    const pluginResponding = await checkPluginResponding();
    results.push({
      step: 'Plugin Communication',
      status: pluginResponding ? 'pass' : 'fail',
      message: pluginResponding ? 'Plugin responding' : 'No response from plugin',
      fix: pluginResponding ? undefined : 'Check Studio Output for errors. Enable HTTP in Game Settings → Security.'
    });
  }

  return results;
}

export function printSetupStatus(results: SetupStatus[]): void {
  console.log('\n╔══════════════════════════════════════════════════════════════════╗');
  console.log('║           Roblox Test Automation - Setup Verification            ║');
  console.log('╠══════════════════════════════════════════════════════════════════╣');

  for (const r of results) {
    const icon = r.status === 'pass' ? '✅' :
                 r.status === 'fail' ? '❌' :
                 r.status === 'warn' ? '⚠️ ' : '🔧';
    const statusStr = r.status.toUpperCase().padEnd(6);
    console.log(`║ ${icon} ${r.step.padEnd(24)} │ ${r.message.padEnd(26)} ║`);
    if (r.fix) {
      console.log(`║    └─ Fix: ${r.fix.substring(0, 52).padEnd(52)} ║`);
    }
  }

  console.log('╚══════════════════════════════════════════════════════════════════╝\n');

  const allPass = results.every(r => r.status === 'pass');
  const hasFail = results.some(r => r.status === 'fail');
  const hasManual = results.some(r => r.status === 'manual');
  const hasWarn = results.some(r => r.status === 'warn');

  if (allPass) {
    console.log('🎉 All checks passed! System is ready for automated testing.\n');
  } else if (hasFail) {
    console.log('❌ Setup incomplete. Fix the issues above and re-run: npm run setup:verify\n');
  } else if (hasManual) {
    console.log('🔧 Manual steps required. Complete them and re-run: npm run setup:verify\n');
  } else if (hasWarn) {
    console.log('⚠️  Some optional components not ready. System may work with limitations.\n');
  }
}

// Run if executed directly
async function main() {
  console.log('\n🔍 Running setup verification...\n');
  const results = await verifySetup();
  printSetupStatus(results);

  // Show detailed instructions for failures
  const accessibilityFailed = results.find(r => r.step === 'Accessibility Permission' && r.status !== 'pass');
  const pluginFailed = results.find(r => r.step === 'Plugin Installed' && r.status !== 'pass');

  if (accessibilityFailed) {
    console.log(getAccessibilityInstructions());
  }

  if (pluginFailed) {
    console.log(getPluginInstallInstructions());
  }

  const allPass = results.every(r => r.status === 'pass' || r.status === 'warn');
  process.exit(allPass ? 0 : 1);
}

main().catch(console.error);
