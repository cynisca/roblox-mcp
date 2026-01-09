# Roblox Studio Test Automation MCP

An MCP (Model Context Protocol) server that enables Claude Code to automate Roblox Studio for testing games.

## Features

- **Play/Stop Control**: Start and stop play-testing mode via keystrokes
- **Script Execution**: Run Lua scripts in the game context and get results
- **Screenshot Capture**: Capture screenshots of Roblox Studio
- **Plugin Reload**: Automatically reload plugins after code changes
- **Self-Healing**: Auto-detects and reports configuration issues
- **Context-Aware**: Routes commands to appropriate context (Edit/Server/Client)

## Requirements

- **macOS** (uses AppleScript for UI automation)
- **Roblox Studio** installed
- **Node.js** 18+
- **Accessibility Permissions** for your terminal app

## Quick Start

### 1. Install the Plugin

```bash
./roblox-plugin/install.sh
```

This copies the plugin to `~/Documents/Roblox/Plugins/`.

### 2. Configure Claude Code

Add to your Claude Code MCP settings (`~/.claude/settings.json`):

```json
{
  "mcpServers": {
    "roblox-test": {
      "command": "node",
      "args": ["/path/to/roblox-mcp/roblox-test-mcp/dist/index.js"]
    }
  }
}
```

### 3. Build the MCP Server

```bash
cd roblox-test-mcp
npm install
npm run build
```

### 4. Open Roblox Studio

1. Open a place file in Roblox Studio
2. Enable HTTP requests: **Game Settings → Security → Allow HTTP Requests**
3. Enable LoadString: **ServerScriptService → Properties → LoadStringEnabled = true**
4. Check Output window for `[RTA-Edit] Plugin initialized`

### 5. Verify Setup

```bash
cd roblox-test-mcp
npm run setup:verify
```

## MCP Tools

| Tool | Description |
|------|-------------|
| `roblox_ping` | Check if plugin is responding |
| `roblox_get_state` | Get current state (playing, edit mode, context) |
| `roblox_focus` | Bring Roblox Studio to foreground |
| `roblox_play` | Start play-testing mode (F5) |
| `roblox_stop` | Stop play-testing mode (Shift+F5) |
| `roblox_execute` | Execute Lua script in game context |
| `roblox_screenshot` | Capture screenshot of Studio |
| `roblox_test_scenario` | Run complete test flow with setup/test/screenshot |
| `roblox_reload_plugins` | Reload plugins via File menu (~3-5s) |

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

## Context-Aware Command Routing

The plugin runs in multiple contexts during play mode. Commands are routed appropriately:

| Context | When Active | Handles |
|---------|-------------|---------|
| **Edit** | Always in edit mode | ping, getState, diagnostics |
| **Server** | During play mode | execute, getState |
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
