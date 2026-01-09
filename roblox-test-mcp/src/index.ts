import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { RobloxAutomation } from "./automation.js";
import { captureScreenshot } from "./screenshot.js";
import { ensureDirectories } from "./ipc.js";
import { reloadPlugins } from "./ui-automation/plugin-reload.js";

const server = new Server(
  { name: "roblox-test-automation", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

const automation = new RobloxAutomation();

// Tool definitions
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
        studioOnly: { type: "boolean", description: "Capture only Studio window", default: true }
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
    description: "Reload Roblox Studio plugins by closing and reopening the current place file. Takes ~8-12 seconds. Use after updating plugin code.",
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
  }
];

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
        return { content: [{ type: "text", text: JSON.stringify(result) }] };
      }

      case "roblox_stop": {
        const result = await automation.stop();
        return { content: [{ type: "text", text: JSON.stringify(result) }] };
      }

      case "roblox_execute": {
        const typedArgs = args as { script: string; timeout?: number };
        const result = await automation.execute(typedArgs.script, typedArgs.timeout);
        return { content: [{ type: "text", text: JSON.stringify(result) }] };
      }

      case "roblox_screenshot": {
        const typedArgs = args as { filename?: string; studioOnly?: boolean } | undefined;
        const result = await captureScreenshot({
          filename: typedArgs?.filename,
          studioOnly: typedArgs?.studioOnly ?? true,
          returnBase64: true
        });

        if (result.success && result.base64) {
          return {
            content: [
              { type: "text", text: `Screenshot saved to: ${result.path}` },
              { type: "image", data: result.base64, mimeType: "image/png" }
            ]
          };
        }
        return { content: [{ type: "text", text: JSON.stringify(result) }] };
      }

      case "roblox_get_state": {
        const state = await automation.getState();
        return { content: [{ type: "text", text: JSON.stringify(state) }] };
      }

      case "roblox_ping": {
        const result = await automation.ping();
        return { content: [{ type: "text", text: JSON.stringify(result) }] };
      }

      case "roblox_focus": {
        const result = await automation.sendStudioControl('focus');
        return { content: [{ type: "text", text: JSON.stringify(result) }] };
      }

      case "roblox_test_scenario": {
        const typedArgs = args as { setupScript?: string; testScript?: string; waitSeconds?: number } | undefined;
        const results: string[] = [];

        // Start play mode
        results.push("Starting play mode...");
        await automation.play(true);
        await new Promise(r => setTimeout(r, 2000));

        // Run setup script if provided
        if (typedArgs?.setupScript) {
          results.push("Running setup script...");
          const setupResult = await automation.execute(typedArgs.setupScript);
          results.push(`Setup result: ${JSON.stringify(setupResult)}`);
        }

        // Run test script if provided
        if (typedArgs?.testScript) {
          results.push("Running test script...");
          const testResult = await automation.execute(typedArgs.testScript);
          results.push(`Test result: ${JSON.stringify(testResult)}`);
        }

        // Wait
        const waitTime = (typedArgs?.waitSeconds ?? 2) * 1000;
        results.push(`Waiting ${waitTime}ms...`);
        await new Promise(r => setTimeout(r, waitTime));

        // Screenshot
        results.push("Capturing screenshot...");
        const screenshot = await captureScreenshot({ studioOnly: true, returnBase64: true });

        // Stop
        results.push("Stopping play mode...");
        await automation.stop();

        if (screenshot.success && screenshot.base64) {
          return {
            content: [
              { type: "text", text: results.join("\n") },
              { type: "image", data: screenshot.base64, mimeType: "image/png" }
            ]
          };
        }

        return { content: [{ type: "text", text: results.join("\n") + "\n\nScreenshot failed: " + screenshot.error }] };
      }

      case "roblox_reload_plugins": {
        const typedArgs = args as { verify?: boolean } | undefined;
        const result = await reloadPlugins({
          verify: typedArgs?.verify ?? true,
        });

        return {
          content: [{
            type: "text",
            text: result.success
              ? `Plugins reloaded (${result.durationMs}ms)${result.placeFile ? ` - ${result.placeFile}` : ''}`
              : `Reload failed: ${result.error}`
          }]
        };
      }

      default:
        return { content: [{ type: "text", text: `Unknown tool: ${name}` }], isError: true };
    }
  } catch (e) {
    return { content: [{ type: "text", text: `Error: ${(e as Error).message}` }], isError: true };
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
