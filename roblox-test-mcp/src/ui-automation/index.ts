// UI Automation utilities for macOS
// Uses AppleScript for window management, keystrokes, and menus

export { runAppleScript, runAppleScriptMultiline, runAppleScriptFile } from './applescript.js';
export { focusRobloxStudio, isStudioRunning, getStudioWindowTitle, isStudioFocused } from './focus-studio.js';
export { sendKeystroke, sendKeyCode, pressF5, pressShiftF5, pressF6, pressF7, pressF8, pressCmdS } from './keystrokes.js';
export { clickMenu, reloadPlugins, restartStudio, openPlaceFile } from './menus.js';
export { captureStudioWindow, captureRegion, captureFullScreen, getScreenshotDirectory, ensureScreenshotDirectory } from './screenshot.js';
export type { ScreenshotResult } from './screenshot.js';
