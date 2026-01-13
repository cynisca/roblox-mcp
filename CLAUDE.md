# Roblox MCP Project Instructions

## Overview

This project provides MCP (Model Context Protocol) tools for automating Roblox Studio testing. The tools allow Claude Code to control Roblox Studio, execute Lua scripts, capture screenshots, and perform automated game testing.

## Available MCP Tools

| Tool | Description |
|------|-------------|
| `roblox_ping` | Check plugin connection |
| `roblox_get_state` | Get basic game state (playing/stopped) |
| `roblox_get_full_state` | Get comprehensive state: position, health, stats, logs |
| `roblox_get_logs` | Get recent plugin logs (token-efficient) |
| `roblox_play` | Start play mode (F5) |
| `roblox_stop` | Stop play mode (Shift+F5) |
| `roblox_execute` | Run Lua script in game context |
| `roblox_screenshot` | Capture Studio screenshot |
| `roblox_focus` | Bring Studio to foreground |
| `roblox_reload_plugins` | Reload plugins after code changes |

## Game Testing Agent

When asked to test a Roblox game, follow this methodology:

### Invoking the Test Agent

Use the Task tool with subagent_type="general-purpose" and a prompt like:

```
Test the [game name] in Roblox Studio. Focus on:
- [specific areas to test]
- [expected behaviors to verify]

Use the Roblox MCP tools (roblox_play, roblox_execute, roblox_get_full_state, etc.)
Follow the testing methodology in roblox-test-mcp/src/testing/game-tester.md
Document all issues found with severity levels.
```

### Testing Methodology

1. **Setup Phase**
   - `roblox_ping` - Verify connection
   - `roblox_play` - Enter play mode
   - `roblox_get_full_state` - Verify game loaded

2. **Audit Phase**
   - Use `roblox_execute` to inspect all workspace objects
   - Check positions, rotations, sizes
   - Identify debug/test objects

3. **Geometry Phase**
   - Raycast to find actual surface heights
   - Verify objects are on surfaces (not floating/embedded)
   - Check slopes go correct direction

4. **Interaction Phase**
   - Teleport player through game areas
   - Verify triggers fire correctly
   - Test collision detection

5. **Documentation Phase**
   - Screenshot visual issues
   - Document findings with severity
   - Provide fix recommendations

### Test Utilities

Lua testing utilities are available in `roblox-test-mcp/src/testing/test-utils.lua`:

- `auditObjects()` - Get all workspace objects with properties
- `getSurfaceY(x, z)` - Raycast to find surface height
- `profileSurface(startZ, endZ)` - Get height profile along a line
- `checkObjectPlacement(pattern)` - Find floating/embedded objects
- `getPlayerState()` - Get player position, health, stats
- `moveThruWaypoints(waypoints)` - Test triggers by moving player
- `analyzeSlope(slopeName)` - Analyze slope geometry and direction

### Issue Severity Levels

| Level | Description |
|-------|-------------|
| CRITICAL | Game unplayable (wrong physics, broken core mechanics) |
| HIGH | Major feature broken (scoring, respawn, progression) |
| MEDIUM | Noticeable problems (visual glitches, minor collision) |
| LOW | Polish issues (z-fighting, minor positioning) |

## Project Structure

```
roblox-mcp/
├── roblox-plugin/           # Roblox Studio plugin
│   └── src/init.server.lua  # Plugin source
├── roblox-test-mcp/         # MCP server
│   └── src/
│       ├── index.ts         # MCP tool definitions
│       ├── automation.ts    # Automation class
│       ├── http-ipc.ts      # HTTP communication
│       └── testing/         # Testing utilities
│           ├── game-tester.md
│           └── test-utils.lua
└── docs/                    # Audit reports
```

## Common Commands

```bash
# Rebuild MCP server after changes
cd roblox-test-mcp && npm run build

# Reinstall plugin after changes
./roblox-plugin/install.sh

# Kill stale MCP processes
lsof -ti:28859 | xargs kill -9
```
