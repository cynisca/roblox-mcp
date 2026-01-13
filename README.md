# Roblox Studio Test Automation MCP

An MCP (Model Context Protocol) server that enables Claude Code to automate Roblox Studio for testing games.

## Features

- **Play/Stop Control**: Start and stop play-testing mode via keystrokes
- **Script Execution**: Run Lua scripts in the game context and get results
- **Screenshot Capture**: Compressed screenshots (95% smaller than raw PNG)
- **Token-Efficient**: Get logs and game state without expensive screenshots
- **Plugin Reload**: Automatically reload plugins after code changes
- **Self-Healing**: Auto-detects and reports configuration issues
- **Context-Aware**: Routes commands to appropriate context (Edit/Server/Client)

## Requirements

- **macOS** (uses AppleScript for UI automation)
- **Roblox Studio** installed
- **Node.js** 18+
- **Accessibility Permissions** for your terminal app

## Quick Start

### 1. Clone and Build

```bash
git clone https://github.com/cynisca/roblox-mcp.git
cd roblox-mcp/roblox-test-mcp
npm install
npm run build
```

### 2. Install the Roblox Plugin

```bash
cd ..
./roblox-plugin/install.sh
```

This copies the plugin to `~/Documents/Roblox/Plugins/`.

### 3. Configure Claude Code MCP

Add the MCP server to your Claude Code settings:

**Option A: Via Claude Code CLI**
```bash
claude mcp add roblox-test node /absolute/path/to/roblox-mcp/roblox-test-mcp/dist/index.js
```

**Option B: Manual Configuration**

Edit `~/.claude/settings.json`:

```json
{
  "mcpServers": {
    "roblox-test": {
      "command": "node",
      "args": ["/absolute/path/to/roblox-mcp/roblox-test-mcp/dist/index.js"]
    }
  }
}
```

> **Important**: Use the absolute path to `dist/index.js`. Example:
> `/Users/yourname/roblox-mcp/roblox-test-mcp/dist/index.js`

### 4. Restart Claude Code

After adding the MCP configuration, restart Claude Code for the tools to be available.

### 5. Configure Roblox Studio

1. Open a place file in Roblox Studio
2. Enable HTTP requests: **Home → Game Settings → Security → Allow HTTP Requests**
3. Enable LoadString (required for script execution):
   - Select **ServerScriptService** in Explorer
   - In Properties panel, check **LoadStringEnabled**
4. Check Output window for `[RTA-Edit] Plugin initialized`

### 6. Grant Accessibility Permission (macOS)

For keyboard automation (F5/Shift+F5):

1. Open **System Preferences → Security & Privacy → Privacy → Accessibility**
2. Add your terminal app (Terminal, iTerm2, VS Code, Cursor, etc.)

### 7. Verify Setup

In Claude Code, ask Claude to run:
```
Use roblox_ping to check if the plugin is connected
```

Or verify via terminal:
```bash
cd roblox-test-mcp
npm run setup:verify
```

## MCP Tools

### Core Tools

| Tool | Description |
|------|-------------|
| `roblox_play` | Start play-testing mode (F5) |
| `roblox_stop` | Stop play-testing mode (Shift+F5) |
| `roblox_execute` | Execute Lua script in game context |
| `roblox_screenshot` | Capture screenshot (with compression) |
| `roblox_capture_sequence` | Capture multiple frames stitched into one image |
| `roblox_test_scenario` | Run complete test flow |

### Token-Efficient Tools

| Tool | Description | Token Savings |
|------|-------------|---------------|
| `roblox_get_full_state` | Player pos, health, stats, logs in one call | ~70% vs multiple calls |
| `roblox_get_logs` | Get plugin logs without screenshot | ~93% vs screenshot |
| `roblox_get_state` | Basic state (playing, context) | - |
| `roblox_ping` | Check plugin connection | - |

### Utility Tools

| Tool | Description |
|------|-------------|
| `roblox_focus` | Bring Studio to foreground |
| `roblox_reload_plugins` | Reload plugins (~3-5s) |

### Screenshot Compression

The `roblox_screenshot` tool supports compression levels:

| Level | Size | Use Case |
|-------|------|----------|
| `none` | ~2 MB | Pixel-perfect archival |
| `low` | ~600 KB | High quality |
| `medium` | ~100 KB | **Default** - good balance |
| `high` | ~80 KB | Maximum compression |

```json
// Example: high compression
{ "compression": "high" }
```

### Sequence Capture

Capture gameplay progression as a single stitched image:

```json
{
  "frames": 6,        // 2-16 frames
  "interval": 1000,   // ms between frames
  "layout": "auto",   // horizontal, vertical, grid, auto
  "compression": "high",
  "labels": true      // add frame numbers
}
```

**Layout options:**

| Frames | Auto Layout |
|--------|-------------|
| 1-3 | Horizontal strip |
| 4 | 2x2 grid |
| 5-6 | 3x2 grid |
| 7-9 | 3x3 grid |
| 10-12 | 4x3 grid |

**Example output:** 6 frames over 5 seconds → ~250KB stitched image with frame numbers.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Claude Code                              │
└───────────────────────────────┬─────────────────────────────────┘
                                │ MCP Protocol
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                    MCP Server (Node.js)                          │
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐   │
│  │ UI Automation│  │  HTTP IPC    │  │ Self-Healing         │   │
│  │ (AppleScript)│  │ (Port 28859) │  │ & Diagnostics        │   │
│  └──────────────┘  └──────────────┘  └──────────────────────┘   │
└───────────────────────────────┬─────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Roblox Studio                               │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                    Plugin (Lua)                           │   │
│  │                                                           │   │
│  │  • Polls HTTP server for commands                         │   │
│  │  • Context-aware routing (Edit/Server/Client)             │   │
│  │  • Auto-enables HTTP and LoadString                       │   │
│  │  • Executes scripts via loadstring()                      │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

## Token-Efficient Usage

For cost-effective automation, prefer these patterns:

```typescript
// ❌ Expensive: Screenshot to check game state
roblox_screenshot()  // ~1500 tokens for image

// ✅ Efficient: Structured state query
roblox_get_full_state()  // ~150 tokens
// Returns: { playerPos, health, stats, recentLogs, isPlaying, ... }

// ❌ Expensive: Screenshot to read Output window
roblox_screenshot()  // ~1500 tokens

// ✅ Efficient: Direct log retrieval
roblox_get_logs({ count: 10 })  // ~100 tokens
// Returns: [{ t: timestamp, l: level, m: message }, ...]

// ❌ Expensive: Multiple execute calls
roblox_execute("return player.Position")
roblox_execute("return player.Health")
roblox_execute("return leaderstats.BestTime.Value")

// ✅ Efficient: Single comprehensive call
roblox_get_full_state()  // All in one response
```

## Context-Aware Command Routing

The plugin runs in multiple contexts during play mode. Commands are routed appropriately:

| Context | When Active | Handles |
|---------|-------------|---------|
| **Edit** | Always in edit mode | ping, getState, getLogs, getFullState |
| **Server** | During play mode | execute, getState, getLogs, getFullState |
| **Client** | During play mode | (HTTP disabled by Roblox) |

This ensures commands are handled by the correct context and prevents duplicate responses.

## Plugin Reload

After modifying plugin code:

1. Run `./roblox-plugin/install.sh` to copy to plugins folder
2. Call `roblox_reload_plugins` MCP tool
3. Plugin reloads via File → Close Place → File → Recent

The reload takes ~3-5 seconds and doesn't require restarting Studio.

## Script Execution

Execute Lua scripts in the game context:

```lua
-- Simple return
return 1 + 1  -- Returns: 2

-- Access game objects
return workspace.Name  -- Returns: "Workspace"

-- Create objects
local part = Instance.new("Part")
part.Name = "TestPart"
part.Position = Vector3.new(0, 50, 0)
part.Anchored = true
part.Parent = workspace
return "Part created"

-- Get workspace children
local names = {}
for _, child in pairs(workspace:GetChildren()) do
    table.insert(names, child.Name)
end
return names
```

**Note**: `LoadStringEnabled` must be enabled in ServerScriptService properties for script execution to work.

## Troubleshooting

### Plugin Not Responding

1. Check Output window for `[RTA-Edit]` or `[RTA-Server]` messages
2. Verify HTTP is enabled: Game Settings → Security → Allow HTTP Requests
3. Run `npm run setup:verify` to check configuration

### Script Execution Fails with "loadstring not available"

Enable `LoadStringEnabled` in ServerScriptService:
1. Select ServerScriptService in Explorer
2. In Properties, find LoadStringEnabled
3. Check the checkbox to enable it
4. Save the place

### Reload Plugins Fails

1. Ensure a place file is open (not just Studio)
2. Check Accessibility permissions for your terminal
3. Manually reload: Plugins → Manage Plugins → Reload

### Keystroke Not Working (F5/Shift+F5)

Grant Accessibility permission:
1. System Preferences → Security & Privacy → Privacy → Accessibility
2. Add your terminal app (Terminal, iTerm2, VS Code, etc.)

## Development

### Project Structure

```
roblox-mcp/
├── roblox-plugin/
│   ├── src/
│   │   └── init.server.lua    # Roblox plugin (single file)
│   └── install.sh             # Plugin installer
├── roblox-test-mcp/
│   ├── src/
│   │   ├── index.ts           # MCP server entry point
│   │   ├── automation.ts      # Legacy automation class
│   │   ├── automation-v2.ts   # V2 automation with self-healing
│   │   ├── http-ipc.ts        # HTTP server for plugin communication
│   │   ├── setup/             # Setup verification scripts
│   │   └── ui-automation/     # AppleScript utilities
│   ├── test/
│   │   └── automated-verification.ts
│   └── package.json
└── README.md
```

### Building

```bash
cd roblox-test-mcp
npm run build
```

### Running Tests

```bash
# Verify setup
npm run setup:verify

# Run full test suite (requires Studio open)
npm run test:all
```

## One-Time Setup Checklist

- [ ] Grant Accessibility permission to terminal app
- [ ] Install plugin: `./roblox-plugin/install.sh`
- [ ] Build MCP server: `cd roblox-test-mcp && npm install && npm run build`
- [ ] Configure Claude Code MCP settings
- [ ] Open Roblox Studio with a place file
- [ ] Enable HTTP requests in Game Settings
- [ ] Enable LoadStringEnabled in ServerScriptService
- [ ] Verify: `npm run setup:verify`

## License

MIT
