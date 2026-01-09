# Roblox Studio Test Automation - macOS Adaptation Plan

## Overview

Adapt the Windows-based Roblox Studio Test Automation system for macOS. This system enables automated testing of Roblox games through Claude Code using MCP (Model Context Protocol).

## Project Structure

```
roblox-mcp/
├── roblox-test-mcp/           # Node.js MCP Server
│   ├── package.json
│   ├── tsconfig.json
│   ├── src/
│   │   ├── index.ts           # MCP server entry point
│   │   ├── automation.ts      # RobloxAutomation class
│   │   ├── ipc.ts             # File-based IPC helpers
│   │   ├── screenshot.ts      # Screenshot capture logic
│   │   └── process.ts         # Studio process management
│   ├── test/
│   │   ├── ipc.test.ts
│   │   ├── phase2.test.ts
│   │   ├── phase3.test.ts
│   │   ├── phase4.test.ts
│   │   ├── phase5.test.ts
│   │   ├── phase6.test.ts
│   │   └── integration.test.ts
│   ├── scripts/
│   │   ├── studio-control.sh  # AppleScript wrapper for play/stop
│   │   └── screenshot.sh      # macOS screenshot utility
│   ├── .phase-status          # Tracks completed phases
│   └── .verification-log      # Logs verification results
├── roblox-plugin/             # Roblox Studio Plugin
│   ├── src/
│   │   ├── init.server.lua
│   │   ├── Config.lua
│   │   ├── IPC.lua
│   │   └── Commands.lua
│   └── install.sh             # macOS plugin installer
├── BLOCKERS.md                # Document any blockers here
└── README.md                  # Usage documentation
```

## macOS-Specific Adaptations

| Component | Windows | macOS |
|-----------|---------|-------|
| IPC Base Path | `C:/RobloxTestAutomation` | `~/RobloxTestAutomation` |
| Plugins Path | `%LOCALAPPDATA%/Roblox/Plugins` | `~/Documents/Roblox/Plugins` |
| Screenshot | PowerShell + Win32 API | `screencapture` command |
| Window Focus | `user32.dll FindWindow` | AppleScript `activate` |
| Keyboard Sim | `keybd_event` | AppleScript `key code` |
| Scripts | `.ps1` PowerShell | `.sh` + AppleScript |

---

## Phase 1: IPC Infrastructure

### Goal
Establish file-based communication between Node.js and Roblox plugin.

### Files to Create
- `roblox-test-mcp/package.json` - Project dependencies
- `roblox-test-mcp/tsconfig.json` - TypeScript config
- `roblox-test-mcp/src/ipc.ts` - IPC helpers with macOS paths

### Key Changes for macOS
```typescript
// IPC paths for macOS
const IPC_BASE = process.env.HOME + '/RobloxTestAutomation';
```

### Verification
```bash
cd roblox-test-mcp && npm install && npx ts-node test/ipc.test.ts
```

---

## Phase 2: Roblox Studio Plugin (Basic)

### Goal
Create a plugin that polls for commands and writes responses.

### Files to Create
- `roblox-plugin/src/Config.lua` - Configuration with macOS paths
- `roblox-plugin/src/IPC.lua` - File I/O for commands/responses
- `roblox-plugin/src/Commands.lua` - Command handlers
- `roblox-plugin/src/init.server.lua` - Plugin entry point
- `roblox-plugin/install.sh` - macOS installer script

### Key Changes for macOS
```lua
-- Config.lua - macOS paths
local homeDir = os.getenv("HOME")
Config.IPC_BASE = homeDir .. "/RobloxTestAutomation"
```

### Plugin Installation Path
```bash
~/Documents/Roblox/Plugins/RobloxTestAutomation/
```

### Verification
```bash
# Install plugin
./roblox-plugin/install.sh
# Open Roblox Studio and check Output for "[RobloxTestAutomation]" messages
# Run: npx ts-node test/phase2.test.ts
```

---

## Phase 3: Play/Stop Control

### Goal
Enable starting and stopping play mode from the MCP server using AppleScript.

### Files to Create
- `roblox-test-mcp/scripts/studio-control.sh` - AppleScript wrapper
- `roblox-test-mcp/src/automation.ts` - Automation class

### macOS Implementation (AppleScript)

**studio-control.sh:**
```bash
#!/bin/bash
ACTION=$1

case $ACTION in
  play)
    osascript -e '
      tell application "RobloxStudio" to activate
      delay 0.2
      tell application "System Events"
        key code 96  -- F5
      end tell
    '
    ;;
  stop)
    osascript -e '
      tell application "RobloxStudio" to activate
      delay 0.2
      tell application "System Events"
        key code 96 using shift down  -- Shift+F5
      end tell
    '
    ;;
  focus)
    osascript -e 'tell application "RobloxStudio" to activate'
    ;;
esac
```

### Accessibility Permissions Required
- System Preferences > Security & Privacy > Privacy > Accessibility
- Add Terminal.app (or iTerm) and Node.js to allowed apps

### Verification
```bash
npx ts-node test/phase3.test.ts
```

---

## Phase 4: Script Execution

### Goal
Execute arbitrary Lua scripts in the game context during play mode.

### Implementation
Uses the `execute` command handler in `Commands.lua` (same as Windows).

### Verification
```bash
npx ts-node test/phase4.test.ts
```

---

## Phase 5: Screenshot Capture

### Goal
Capture screenshots of the Roblox Studio viewport.

### Files to Create
- `roblox-test-mcp/scripts/screenshot.sh` - macOS screenshot script
- `roblox-test-mcp/src/screenshot.ts` - Screenshot module

### macOS Implementation

**screenshot.sh:**
```bash
#!/bin/bash
OUTPUT_PATH=$1
STUDIO_ONLY=$2

if [ "$STUDIO_ONLY" = "true" ]; then
  # Get Roblox Studio window ID
  WINDOW_ID=$(osascript -e 'tell application "System Events" to get id of first window of application process "RobloxStudio"' 2>/dev/null)

  if [ -n "$WINDOW_ID" ]; then
    screencapture -l $WINDOW_ID -x "$OUTPUT_PATH"
  else
    # Fallback: activate and capture
    osascript -e 'tell application "RobloxStudio" to activate'
    sleep 0.3
    screencapture -x "$OUTPUT_PATH"
  fi
else
  screencapture -x "$OUTPUT_PATH"
fi
```

### Verification
```bash
npx ts-node test/phase5.test.ts
```

---

## Phase 6: MCP Server Integration

### Goal
Wrap everything in a proper MCP server.

### Files to Create
- `roblox-test-mcp/src/index.ts` - MCP server entry point

### Available Tools
| Tool | Description |
|------|-------------|
| `roblox_play` | Start play-testing mode |
| `roblox_stop` | Stop play-testing mode |
| `roblox_execute` | Execute Lua script in game |
| `roblox_screenshot` | Capture screenshot |
| `roblox_get_state` | Get Studio state |
| `roblox_test_scenario` | Complete test flow |

### Verification
```bash
npm run build
npx ts-node test/phase6.test.ts
```

---

## Phase 7: Claude Code Integration

### Goal
Configure and test with Claude Code.

### Files to Create
- `roblox-test-mcp/README.md` - Usage documentation
- MCP configuration for Claude Code

### Claude Code MCP Configuration
Add to `~/.claude/settings.json` or project `.mcp.json`:
```json
{
  "mcpServers": {
    "roblox-test": {
      "command": "node",
      "args": ["/Users/fahimzahur/roblox-mcp/roblox-test-mcp/dist/index.js"]
    }
  }
}
```

### Verification
```bash
npx ts-node test/integration.test.ts
# Verify all phases:
cat .phase-status
```

---

## Implementation Order

1. **Phase 1**: Create project structure, package.json, ipc.ts with macOS paths
2. **Phase 2**: Create Lua plugin files with macOS paths, install script
3. **Phase 3**: Create AppleScript-based studio-control.sh, automation.ts
4. **Phase 4**: Test script execution (uses Phase 2 implementation)
5. **Phase 5**: Create screenshot.sh using `screencapture`, screenshot.ts
6. **Phase 6**: Create MCP server index.ts
7. **Phase 7**: Create README.md, test integration

---

## Known macOS Challenges

### 1. Accessibility Permissions
AppleScript keyboard simulation requires Accessibility permissions.
**Solution**: Prompt user to grant permissions in System Preferences.

### 2. Lua File I/O Sandboxing
Roblox Studio may sandbox `io.open` on macOS.
**Alternative**: Use HttpService with a local server if file I/O fails.

### 3. Window ID Detection
`screencapture -l` requires window ID which can be hard to get reliably.
**Fallback**: Activate window and capture full screen.

### 4. Application Name
Roblox Studio process may appear as "RobloxStudio" or "Roblox Studio".
**Solution**: Try both names in AppleScript.

---

## Verification Checklist

After all phases complete, verify:

- [ ] IPC directories created at `~/RobloxTestAutomation/`
- [ ] Plugin installed at `~/Documents/Roblox/Plugins/RobloxTestAutomation/`
- [ ] Plugin loads in Roblox Studio (check Output window)
- [ ] Ping command works
- [ ] Play/Stop commands work (requires Accessibility permissions)
- [ ] Script execution works in play mode
- [ ] Screenshots capture correctly
- [ ] MCP server starts and lists tools
- [ ] Integration test passes

---

## Files to Create (Complete List)

```
roblox-test-mcp/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts
│   ├── automation.ts
│   ├── ipc.ts
│   └── screenshot.ts
├── scripts/
│   ├── studio-control.sh
│   └── screenshot.sh
├── test/
│   ├── ipc.test.ts
│   ├── phase2.test.ts
│   ├── phase3.test.ts
│   ├── phase4.test.ts
│   ├── phase5.test.ts
│   ├── phase6.test.ts
│   └── integration.test.ts
└── README.md

roblox-plugin/
├── src/
│   ├── init.server.lua
│   ├── Config.lua
│   ├── IPC.lua
│   └── Commands.lua
└── install.sh
```

---

## Success Criteria

All 7 phases complete with passing verifications. The system should:
1. Start/stop Roblox Studio play mode programmatically
2. Execute Lua scripts in the game context
3. Capture screenshots of the Studio window
4. Expose all functionality through MCP tools for Claude Code
