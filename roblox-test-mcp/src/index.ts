import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { RobloxAutomation } from "./automation.js";
import { captureScreenshot } from "./screenshot.js";
import { captureSequence } from "./sequence-capture.js";
import { ensureDirectories } from "./ipc.js";
import { reloadPlugins } from "./ui-automation/plugin-reload.js";

const server = new Server(
  { name: "roblox-test-automation", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

const automation = new RobloxAutomation();

// Optimized tool definitions - minimal descriptions to reduce token usage
const TOOLS = [
  {
    name: "roblox_play",
    description: "Start play-testing mode in Roblox Studio (sends F5 keystroke)",
    inputSchema: {
      type: "object" as const,
      properties: {
        waitForLoad: { type: "boolean", description: "Wait for game to load", default: true }
      }
    }
  },
  {
    name: "roblox_stop",
    description: "Stop play-testing mode in Roblox Studio (sends Shift+F5 keystroke)",
    inputSchema: { type: "object" as const, properties: {} }
  },
  {
    name: "roblox_execute",
    description: "Execute a Lua script in the game context (must be in play mode, requires plugin)",
    inputSchema: {
      type: "object" as const,
      properties: {
        script: { type: "string", description: "Lua script to execute" },
        timeout: { type: "number", description: "Timeout in ms", default: 30000 }
      },
      required: ["script"]
    }
  },
  {
    name: "roblox_screenshot",
    description: "Capture a screenshot of Roblox Studio",
    inputSchema: {
      type: "object" as const,
      properties: {
        filename: { type: "string", description: "Output filename" },
        studioOnly: { type: "boolean", description: "Capture only Studio window", default: true },
        compression: {
          type: "string",
          description: "Compression level: none (PNG ~2MB), low (JPEG ~600KB), medium (JPEG ~150KB), high (JPEG ~80KB)",
          enum: ["none", "low", "medium", "high"],
          default: "medium"
        }
      }
    }
  },
  {
    name: "roblox_get_state",
    description: "Get current state of Roblox Studio (playing, etc.) via plugin",
    inputSchema: { type: "object" as const, properties: {} }
  },
  {
    name: "roblox_ping",
    description: "Ping the Roblox Studio plugin to check if it's responding",
    inputSchema: { type: "object" as const, properties: {} }
  },
  {
    name: "roblox_focus",
    description: "Bring Roblox Studio window to the foreground",
    inputSchema: { type: "object" as const, properties: {} }
  },
  {
    name: "roblox_test_scenario",
    description: "Run a complete test: start play mode, execute script, capture screenshot, stop",
    inputSchema: {
      type: "object" as const,
      properties: {
        setupScript: { type: "string", description: "Lua script to set up test" },
        testScript: { type: "string", description: "Lua script to run test" },
        waitSeconds: { type: "number", description: "Wait time before screenshot", default: 2 }
      }
    }
  },
  {
    name: "roblox_reload_plugins",
    description: "Reload Roblox Studio plugins by closing and reopening the current place via File menu. Takes ~3-5 seconds. Use after updating plugin code.",
    inputSchema: {
      type: "object" as const,
      properties: {
        verify: {
          type: "boolean",
          description: "Wait for plugin to respond after reload (recommended)",
          default: true
        }
      }
    }
  },
  {
    name: "roblox_get_logs",
    description: "Get recent plugin logs without screenshot. Token-efficient debugging.",
    inputSchema: {
      type: "object" as const,
      properties: {
        count: { type: "number", description: "Number of log entries (default 20)", default: 20 }
      }
    }
  },
  {
    name: "roblox_get_full_state",
    description: "Get comprehensive game state in one call: player pos, health, stats, recent logs. Token-efficient alternative to multiple queries.",
    inputSchema: { type: "object" as const, properties: {} }
  },
  {
    name: "roblox_capture_sequence",
    description: "Capture a sequence of screenshots and stitch into a single image. Great for gameplay progression.",
    inputSchema: {
      type: "object" as const,
      properties: {
        frames: { type: "number", description: "Number of frames (2-16, default: 6)", default: 6 },
        interval: { type: "number", description: "Ms between frames (100-10000, default: 1000)", default: 1000 },
        layout: {
          type: "string",
          description: "Layout: horizontal, vertical, grid, or auto",
          enum: ["horizontal", "vertical", "grid", "auto"],
          default: "auto"
        },
        compression: {
          type: "string",
          description: "Compression: none, low, medium, high",
          enum: ["none", "low", "medium", "high"],
          default: "high"
        },
        labels: { type: "boolean", description: "Add frame numbers (default: true)", default: true }
      }
    }
  }
];

// Helper to create minimal success response
function ok(data?: Record<string, unknown>): { content: Array<{ type: "text"; text: string }> } {
  if (!data) return { content: [{ type: "text", text: '{"success":true}' }] };
  return { content: [{ type: "text", text: JSON.stringify({ success: true, ...data }) }] };
}

// Helper to create minimal error response
function err(message: string): { content: Array<{ type: "text"; text: string }>; isError: true } {
  return { content: [{ type: "text", text: JSON.stringify({ success: false, error: message }) }], isError: true };
}

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools: TOOLS };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "roblox_play": {
        const typedArgs = args as { waitForLoad?: boolean } | undefined;
        const result = await automation.play(typedArgs?.waitForLoad ?? true);
        return result.success ? ok() : err(result.error || "Failed");
      }

      case "roblox_stop": {
        const result = await automation.stop();
        return result.success ? ok() : err(result.error || "Failed");
      }

      case "roblox_execute": {
        const typedArgs = args as { script: string; timeout?: number };
        const result = await automation.execute(typedArgs.script, typedArgs.timeout) as { success: boolean; result?: unknown; error?: string; context?: string };
        if (result.success) {
          // Only include result and context, skip id/timestamp
          return ok({ result: result.result, context: result.context });
        }
        return err(result.error || "Execution failed");
      }

      case "roblox_screenshot": {
        const typedArgs = args as { filename?: string; studioOnly?: boolean; compression?: 'none' | 'low' | 'medium' | 'high' } | undefined;
        const result = await captureScreenshot({
          filename: typedArgs?.filename,
          studioOnly: typedArgs?.studioOnly ?? true,
          compression: typedArgs?.compression ?? 'medium',
          returnBase64: false
        });

        if (result.success) {
          return ok({ path: result.path, sizeKB: result.sizeKB });
        }
        return err(result.error || "Screenshot failed");
      }

      case "roblox_get_state": {
        const state = await automation.getState();
        // Return minimal state info
        return ok({
          isPlaying: state.isPlaying,
          isStudio: state.isStudio
        });
      }

      case "roblox_ping": {
        const result = await automation.ping();
        return result.success ? ok() : err(result.error || "Plugin not responding");
      }

      case "roblox_focus": {
        const result = await automation.sendStudioControl('focus');
        return result.success ? ok() : err(result.error || "Failed to focus");
      }

      case "roblox_test_scenario": {
        const typedArgs = args as { setupScript?: string; testScript?: string; waitSeconds?: number } | undefined;
        const steps: string[] = [];

        // Start play mode
        await automation.play(true);
        steps.push("play:ok");
        await new Promise(r => setTimeout(r, 2000));

        // Run setup script if provided
        if (typedArgs?.setupScript) {
          const setupResult = await automation.execute(typedArgs.setupScript);
          steps.push(setupResult.success ? "setup:ok" : `setup:err`);
        }

        // Run test script if provided
        if (typedArgs?.testScript) {
          const testResult = await automation.execute(typedArgs.testScript);
          steps.push(testResult.success ? "test:ok" : `test:err`);
        }

        // Wait
        const waitTime = (typedArgs?.waitSeconds ?? 2) * 1000;
        await new Promise(r => setTimeout(r, waitTime));

        // Screenshot (no base64)
        const screenshot = await captureScreenshot({ studioOnly: true, returnBase64: false });
        steps.push(screenshot.success ? "screenshot:ok" : "screenshot:err");

        // Stop
        await automation.stop();
        steps.push("stop:ok");

        return ok({ steps: steps.join(","), screenshotPath: screenshot.path });
      }

      case "roblox_reload_plugins": {
        const typedArgs = args as { verify?: boolean } | undefined;
        const result = await reloadPlugins({
          verify: typedArgs?.verify ?? true,
        });

        if (result.success) {
          return { content: [{ type: "text", text: `Plugins reloaded (${result.durationMs}ms)` }] };
        }
        return err(result.error || "Reload failed");
      }

      case "roblox_get_logs": {
        const typedArgs = args as { count?: number } | undefined;
        const result = await automation.getLogs(typedArgs?.count ?? 20);
        if (result.success && result.result) {
          // Return logs as compact array
          return ok({ logs: result.result });
        }
        return err(result.error || "Failed to get logs");
      }

      case "roblox_get_full_state": {
        const result = await automation.getFullState();
        if (result.success && result.result) {
          // Return the full state object directly
          return { content: [{ type: "text", text: JSON.stringify(result.result) }] };
        }
        return err(result.error || "Failed to get state");
      }

      case "roblox_capture_sequence": {
        const typedArgs = args as {
          frames?: number;
          interval?: number;
          layout?: 'horizontal' | 'vertical' | 'grid' | 'auto';
          compression?: 'none' | 'low' | 'medium' | 'high';
          labels?: boolean;
        } | undefined;

        const result = await captureSequence({
          frames: typedArgs?.frames ?? 6,
          interval: typedArgs?.interval ?? 1000,
          layout: typedArgs?.layout ?? 'auto',
          compression: typedArgs?.compression ?? 'high',
          labels: typedArgs?.labels ?? true
        });

        if (result.success) {
          return ok({
            path: result.path,
            sizeKB: result.sizeKB,
            frames: result.frames,
            layout: result.layout,
            duration: result.totalDuration
          });
        }
        return err(result.error || "Sequence capture failed");
      }

      default:
        return err(`Unknown tool: ${name}`);
    }
  } catch (e) {
    return err((e as Error).message);
  }
});

async function main() {
  await ensureDirectories();
  await automation.initialize();

  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error("Roblox Test Automation MCP Server running");
}

main().catch(console.error);
