# Roblox Studio Test Automation MCP Server

An MCP (Model Context Protocol) server that enables Claude Code to automate Roblox Studio for testing games. Control play/stop, execute Lua scripts, and capture screenshots programmatically.

## Features

- **Play/Stop Control** - Start and stop play-testing mode via keyboard simulation
- **Script Execution** - Run arbitrary Lua scripts in the game context
- **Screenshot Capture** - Capture screenshots of Studio or full screen
- **State Monitoring** - Check if Studio is in play/edit mode
- **Full Test Scenarios** - Automated test flows with screenshots

## Requirements

- **macOS** (uses AppleScript for keyboard simulation)
- **Roblox Studio** installed
- **Node.js** 18+
- **Claude Code** or any MCP-compatible client

## Installation

### 1. Clone and Build the MCP Server

```bash
git clone <repository-url>
cd roblox-mcp/roblox-test-mcp

# Install dependencies
npm install

# Build TypeScript
npm run build
```

### 2. Install the Roblox Studio Plugin

```bash
# Run the installer script
./roblox-plugin/install.sh
```

This copies the plugin to `~/Documents/Roblox/Plugins/RobloxTestAutomation/`

### 3. Enable HTTP Requests in Roblox Studio

1. Open Roblox Studio
2. Go to **Home** → **Game Settings** → **Security**
3. Enable **"Allow HTTP Requests"**

### 4. Grant Accessibility Permissions (macOS)

The play/stop functionality requires accessibility permissions:

1. Open **System Preferences** → **Security & Privacy** → **Privacy** → **Accessibility**
2. Add your terminal app (Terminal.app, iTerm2, etc.)
3. If using Claude Code, add the Claude Code application

### 5. Configure Claude Code

Add the MCP server to your Claude Code configuration.

**Option A: Project-specific** (`.mcp.json` in project root):
```json
{
  "mcpServers": {
    "roblox-test": {
      "command": "node",
      "args": ["/full/path/to/roblox-mcp/roblox-test-mcp/dist/index.js"]
    }
  }
}
```

**Option B: Global** (`~/.claude.json`):
```json
{
  "mcpServers": {
    "roblox-test": {
      "command": "node",
      "args": ["/full/path/to/roblox-mcp/roblox-test-mcp/dist/index.js"]
    }
  }
}
```

### 6. Restart Claude Code

After configuring, restart Claude Code to load the MCP server.

## Available Tools

| Tool | Description |
|------|-------------|
| `roblox_play` | Start play-testing mode (sends F5 keystroke) |
| `roblox_stop` | Stop play-testing mode (sends Shift+F5 keystroke) |
| `roblox_execute` | Execute a Lua script in the game context |
| `roblox_screenshot` | Capture a screenshot of Roblox Studio |
| `roblox_get_state` | Get current state (playing, editing, etc.) |
| `roblox_ping` | Check if the plugin is responding |
| `roblox_focus` | Bring Roblox Studio window to foreground |
| `roblox_test_scenario` | Run a complete test flow with screenshot |

## Usage Examples

### For Users

Simply ask Claude Code to interact with Roblox Studio:

```
"Start play mode in Roblox Studio"

"Take a screenshot of my game"

"Run this Lua script and tell me the result:
return workspace:GetChildren()"

"Check what objects are in the workspace"

"Test if the player spawns correctly and show me a screenshot"
```

### For Claude Code Instances

The MCP tools can be called directly:

```typescript
// Start play mode
await mcp.roblox_play({ waitForLoad: true });

// Execute a script
const result = await mcp.roblox_execute({
  script: `
    local names = {}
    for _, child in pairs(workspace:GetChildren()) do
      table.insert(names, child.Name)
    end
    return names
  `
});

// Capture screenshot
await mcp.roblox_screenshot({ studioOnly: true });

// Stop play mode
await mcp.roblox_stop();
```

### Script Execution Examples

**Get workspace children:**
```lua
local names = {}
for _, child in pairs(workspace:GetChildren()) do
    table.insert(names, child.Name)
end
return names
```

**Check player position:**
```lua
local Players = game:GetService("Players")
local player = Players.LocalPlayer
if player and player.Character then
    local pos = player.Character:GetPrimaryPartCFrame().Position
    return {x = pos.X, y = pos.Y, z = pos.Z}
end
return nil
```

**Create a test part:**
```lua
local part = Instance.new("Part")
part.Name = "TestPart"
part.Position = Vector3.new(0, 10, 0)
part.Anchored = true
part.Parent = workspace
return "Part created!"
```

**Find all scripts:**
```lua
local scripts = {}
for _, desc in pairs(game:GetDescendants()) do
    if desc:IsA("Script") or desc:IsA("LocalScript") then
        table.insert(scripts, desc:GetFullName())
    end
end
return scripts
```

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Claude Code    │────▶│   MCP Server    │────▶│  Roblox Studio  │
│                 │     │  (Node.js)      │     │                 │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                               │                        ▲
                               │                        │
                        ┌──────┴──────┐          ┌──────┴──────┐
                        │             │          │             │
                        ▼             ▼          │             │
                  ┌──────────┐  ┌──────────┐     │   Plugin    │
                  │AppleScript│  │  HTTP    │◀────│  (Lua)     │
                  │(Play/Stop)│  │ Server   │     │            │
                  └──────────┘  │:28859    │     └─────────────┘
                                └──────────┘
```

### Communication Flow

1. **Claude Code** calls MCP tools (e.g., `roblox_execute`)
2. **MCP Server** either:
   - Runs AppleScript for play/stop/focus (direct control)
   - Queues command on HTTP server for script execution
3. **Roblox Plugin** polls HTTP server every 100ms
4. **Plugin** executes command and POSTs response
5. **MCP Server** returns result to Claude Code

### HTTP IPC Endpoints

The MCP server runs an HTTP server on `http://127.0.0.1:28859`:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/command` | GET | Plugin polls for pending commands |
| `/response` | POST | Plugin sends command responses |
| `/ping` | GET | Health check |
| `/status` | GET | Server status |

## Troubleshooting

### Plugin Not Connecting

1. **Check Output window** in Roblox Studio for `[RobloxTestAutomation]` messages
2. **Verify HTTP is enabled**: Game Settings → Security → Allow HTTP Requests
3. **Check the server is running**: `curl http://127.0.0.1:28859/ping`
4. **Reload the plugin**: Plugins → Manage Plugins → Reload

### Play/Stop Not Working

1. **Grant accessibility permissions** to your terminal app
2. **Check Studio is focused** - the keyboard simulation targets the active window
3. **Test manually**: Run `./scripts/studio-control.sh play`

### Script Execution Fails

1. **Ensure Studio is running** (not required to be in play mode for most scripts)
2. **Check for Lua syntax errors** in your script
3. **Verify plugin is connected**: Use `roblox_ping` tool

### Screenshot Issues

1. **Test manually**: `./scripts/screenshot.sh ~/test.png false`
2. **For Studio-only capture**, ensure Studio window is visible

## Project Structure

```
roblox-mcp/
├── roblox-test-mcp/           # MCP Server (Node.js/TypeScript)
│   ├── src/
│   │   ├── index.ts           # MCP server entry point
│   │   ├── automation.ts      # RobloxAutomation class
│   │   ├── http-ipc.ts        # HTTP server for plugin communication
│   │   ├── ipc.ts             # File-based IPC (legacy)
│   │   └── screenshot.ts      # Screenshot capture
│   ├── scripts/
│   │   ├── studio-control.sh  # AppleScript wrapper for play/stop
│   │   └── screenshot.sh      # macOS screenshot utility
│   ├── dist/                  # Compiled JavaScript
│   └── package.json
├── roblox-plugin/             # Roblox Studio Plugin
│   ├── src/
│   │   └── init.server.lua    # Single-file plugin (HTTP-based)
│   └── install.sh             # Plugin installer
└── .mcp.json                  # MCP configuration for this project
```

## Development

### Running Tests

```bash
cd roblox-test-mcp

# Test IPC
npx ts-node --esm test/ipc.test.ts

# Test with Studio running
npx ts-node --esm test/integration.test.ts
```

### Rebuilding

```bash
cd roblox-test-mcp
npm run build
```

After rebuilding, restart Claude Code to pick up changes.

### Modifying the Plugin

1. Edit `roblox-plugin/src/init.server.lua`
2. Run `./roblox-plugin/install.sh` to copy to Plugins folder
3. In Roblox Studio: Plugins → Manage Plugins → Reload

## Limitations

- **macOS only** - Uses AppleScript for keyboard simulation
- **Requires Studio running** - The plugin must be loaded
- **HTTP must be enabled** - Game Settings → Security → Allow HTTP Requests
- **Script results must be JSON-serializable** - Instance objects return as strings

## License

MIT
