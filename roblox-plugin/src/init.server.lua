--[[
    RobloxTestAutomation Plugin
    Enables automated testing of Roblox games via MCP server
    macOS Version - HTTP-based IPC (Single File)
]]

local HttpService = game:GetService("HttpService")
local RunService = game:GetService("RunService")

--------------------------------------------------------------------------------
-- CONFIG
--------------------------------------------------------------------------------
local Config = {
    HTTP_ENABLED = true,
    HTTP_HOST = "http://127.0.0.1",
    HTTP_PORT = 28859,
    POLL_INTERVAL = 0.1,
    REQUEST_TIMEOUT = 5,
    MAX_COMMAND_AGE = 30,
    LOG_ENABLED = true,
    DEBUG_ENABLED = true,  -- Extra debug logging
    LOG_PREFIX = "[RobloxTestAutomation]"
}

Config.HTTP_BASE_URL = Config.HTTP_HOST .. ":" .. Config.HTTP_PORT
Config.COMMAND_URL = Config.HTTP_BASE_URL .. "/command"
Config.RESPONSE_URL = Config.HTTP_BASE_URL .. "/response"
Config.PING_URL = Config.HTTP_BASE_URL .. "/ping"

--------------------------------------------------------------------------------
-- IPC (HTTP-based)
--------------------------------------------------------------------------------
local IPC = {}

function IPC.log(message)
    if not Config.LOG_ENABLED then return end
    print(Config.LOG_PREFIX .. " " .. message)
end

function IPC.debug(message)
    if not Config.DEBUG_ENABLED then return end
    print(Config.LOG_PREFIX .. " [DEBUG] " .. message)
end

function IPC.warn(message)
    if not Config.LOG_ENABLED then return end
    warn(Config.LOG_PREFIX .. " " .. message)
end

function IPC.readCommand()
    if not Config.HTTP_ENABLED then
        return nil
    end

    IPC.debug("Polling GET " .. Config.COMMAND_URL)

    local success, result = pcall(function()
        local response = HttpService:GetAsync(Config.COMMAND_URL)
        IPC.debug("GET response length: " .. tostring(response and #response or 0))
        if response and response ~= "" then
            IPC.debug("GET /command returned: " .. response:sub(1, 100))
            return HttpService:JSONDecode(response)
        end
        return nil
    end)

    if not success then
        IPC.warn("GET /command failed: " .. tostring(result))
        return nil
    end

    if result then
        local now = os.time() * 1000
        local age = (now - (result.timestamp or 0)) / 1000
        if age > Config.MAX_COMMAND_AGE then
            IPC.log("Ignoring stale command: " .. (result.id or "unknown"))
            return nil
        end
        return result
    end

    return nil
end

function IPC.writeResponse(response)
    if not Config.HTTP_ENABLED then
        return false
    end

    response.timestamp = os.time() * 1000

    local json = HttpService:JSONEncode(response)
    IPC.debug("Sending response: " .. json:sub(1, 200))
    IPC.debug("POST URL: " .. Config.RESPONSE_URL)

    local success, result = pcall(function()
        local httpResponse = HttpService:PostAsync(
            Config.RESPONSE_URL,
            json,
            Enum.HttpContentType.ApplicationJson,
            false  -- compress
        )
        return httpResponse
    end)

    if success then
        IPC.debug("POST response: " .. tostring(result))
        return true
    else
        IPC.warn("Error sending response: " .. tostring(result))
        return false
    end
end

function IPC.checkConnection()
    local success, result = pcall(function()
        local response = HttpService:GetAsync(Config.PING_URL)
        if response then
            local data = HttpService:JSONDecode(response)
            return data.status == "ok"
        end
        return false
    end)

    return success and result
end

--------------------------------------------------------------------------------
-- COMMANDS
--------------------------------------------------------------------------------
local Commands = {}

function Commands.ping(payload)
    return { success = true, result = "pong" }
end

function Commands.getState(payload)
    return {
        success = true,
        result = {
            isPlaying = RunService:IsRunning(),
            isStudio = RunService:IsStudio(),
            isEdit = RunService:IsEdit(),
        }
    }
end

function Commands.execute(payload)
    if not payload or not payload.script then
        return { success = false, error = "No script provided" }
    end

    local env = setmetatable({
        game = game,
        workspace = workspace,
        script = script,
        wait = wait,
        spawn = spawn,
        delay = delay,
        print = print,
        warn = warn,
        error = error,
        pcall = pcall,
        xpcall = xpcall,
        typeof = typeof,
        type = type,
        tostring = tostring,
        tonumber = tonumber,
        pairs = pairs,
        ipairs = ipairs,
        next = next,
        select = select,
        unpack = unpack,
        table = table,
        string = string,
        math = math,
        Vector3 = Vector3,
        Vector2 = Vector2,
        CFrame = CFrame,
        Color3 = Color3,
        BrickColor = BrickColor,
        UDim = UDim,
        UDim2 = UDim2,
        Rect = Rect,
        Ray = Ray,
        Region3 = Region3,
        Instance = Instance,
        Enum = Enum,
        tick = tick,
        time = time,
        os = os,
        coroutine = coroutine,
    }, { __index = getfenv() })

    local fn, parseErr = loadstring(payload.script)
    if not fn then
        return { success = false, error = "Parse error: " .. tostring(parseErr) }
    end

    setfenv(fn, env)

    local success, result = pcall(fn)

    if success then
        -- Try to serialize the result
        local serializedResult = result
        if type(result) == "userdata" or type(result) == "function" then
            serializedResult = tostring(result)
        elseif type(result) == "table" then
            local ok, json = pcall(function() return HttpService:JSONEncode(result) end)
            if ok then
                serializedResult = result
            else
                serializedResult = tostring(result)
            end
        end
        return { success = true, result = serializedResult }
    else
        return { success = false, error = tostring(result) }
    end
end

function Commands.handle(command)
    IPC.log("Handling command: " .. command.action .. " (id: " .. (command.id or "?") .. ")")

    local handler = Commands[command.action]
    if not handler then
        return {
            id = command.id,
            success = false,
            error = "Unknown action: " .. command.action
        }
    end

    local success, result = pcall(handler, command.payload)

    if success then
        result.id = command.id
        IPC.debug("Command result - id: " .. tostring(result.id) .. ", success: " .. tostring(result.success))
        return result
    else
        return {
            id = command.id,
            success = false,
            error = "Handler error: " .. tostring(result)
        }
    end
end

--------------------------------------------------------------------------------
-- MAIN PLUGIN
--------------------------------------------------------------------------------
IPC.log("Plugin loaded - HTTP IPC mode")
IPC.log("Server URL: " .. Config.HTTP_BASE_URL)

local isConnected = false
local lastConnectionCheck = 0
local CONNECTION_CHECK_INTERVAL = 5

local function checkConnection()
    local now = os.time()
    if now - lastConnectionCheck >= CONNECTION_CHECK_INTERVAL then
        lastConnectionCheck = now
        local wasConnected = isConnected
        isConnected = IPC.checkConnection()

        if isConnected and not wasConnected then
            IPC.log("Connected to MCP server")
        elseif not isConnected and wasConnected then
            IPC.warn("Lost connection to MCP server")
        end
    end
    return isConnected
end

-- Main polling loop
spawn(function()
    IPC.log("Checking connection to MCP server...")
    isConnected = IPC.checkConnection()
    if isConnected then
        IPC.log("Connected to MCP server!")
    else
        IPC.warn("MCP server not available at " .. Config.HTTP_BASE_URL .. " - will retry")
    end

    while true do
        checkConnection()

        local command = IPC.readCommand()

        if command then
            IPC.log("Received command: " .. command.action)
            local response = Commands.handle(command)
            IPC.debug("About to send response with id: " .. tostring(response.id))
            local sent = IPC.writeResponse(response)
            if sent then
                IPC.log("Response sent for: " .. command.action)
            else
                IPC.warn("Failed to send response for: " .. command.action)
            end
        end

        wait(Config.POLL_INTERVAL)
    end
end)

-- Create toolbar
local toolbar = plugin:CreateToolbar("Test Automation")
local statusButton = toolbar:CreateButton(
    "Status",
    "Check connection to MCP server",
    "rbxassetid://0"
)

statusButton.Click:Connect(function()
    IPC.log("=== Status Check ===")
    IPC.log("HTTP URL: " .. Config.HTTP_BASE_URL)

    local connected = IPC.checkConnection()
    if connected then
        IPC.log("Connection: OK")
    else
        IPC.warn("Connection: FAILED")
        IPC.warn("Make sure MCP server is running and HTTP requests are enabled")
    end
    IPC.log("===================")
end)

-- Test button for manual response test
local testButton = toolbar:CreateButton(
    "Test POST",
    "Send a test POST request",
    "rbxassetid://0"
)

testButton.Click:Connect(function()
    IPC.log("=== Manual POST Test ===")
    local testResponse = {
        id = "manual-test-" .. tostring(os.time()),
        success = true,
        result = "manual test",
        timestamp = os.time() * 1000
    }
    local sent = IPC.writeResponse(testResponse)
    IPC.log("POST test result: " .. tostring(sent))
    IPC.log("========================")
end)

IPC.log("Plugin initialized - polling for commands")
