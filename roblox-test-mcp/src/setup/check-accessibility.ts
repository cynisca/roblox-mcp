import { execSync } from 'child_process';

/**
 * Check if we have macOS Accessibility permissions
 * Required for AppleScript UI automation (keystrokes, menu clicks)
 */
export function checkAccessibilityPermission(): boolean {
  try {
    // This AppleScript will fail if no accessibility permission
    execSync(`osascript -e 'tell application "System Events" to get name of first process'`, {
      timeout: 5000,
      stdio: 'pipe'
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Get instructions for granting accessibility permission
 */
export function getAccessibilityInstructions(): string {
  return `
═══════════════════════════════════════════════════════════════════
  MANUAL STEP REQUIRED: Grant Accessibility Permission
═══════════════════════════════════════════════════════════════════

1. Open System Preferences → Security & Privacy → Privacy → Accessibility
2. Click the lock icon to make changes (enter password)
3. Add and enable your terminal app:
   • If using Terminal.app: Add "Terminal"
   • If using iTerm2: Add "iTerm"
   • If using VS Code terminal: Add "Visual Studio Code"
   • If using Claude Code: Add the Claude Code application

This permission is required for:
  • Sending keystrokes (F5 to play, Shift+F5 to stop)
  • Focusing Roblox Studio window
  • Menu navigation

After granting permission, run: npm run setup:verify
═══════════════════════════════════════════════════════════════════
`;
}
