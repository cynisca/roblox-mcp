--[[
    RobloxTestAutomation Plugin v2
    Self-healing, auto-configuring, context-aware

    Features:
    - Auto-enables HTTP requests and LoadStringEnabled
    - Context-aware command routing (Edit/Server/Client)
    - Diagnostics endpoint for troubleshooting
    - Debug logging
]]

local HttpService = game:GetService("HttpService")
local RunService = game:GetService("RunService")
local ServerScriptService = game:GetService("ServerScriptService")
local Players = game:GetService("Players")

--------------------------------------------------------------------------------
-- CONFIGURATION
--------------------------------------------------------------------------------
local Config = {
    SERVER_URL = "http://127.0.0.1:28859",
    POLL_INTERVAL = 0.1,
    REQUEST_TIMEOUT = 5,
    MAX_COMMAND_AGE = 30,
    DEBUG = false,  -- Set to true for verbose logging
}

Config.COMMAND_URL = Config.SERVER_URL .. "/command"
Config.RESPONSE_URL = Config.SERVER_URL .. "/response"
Config.PING_URL = Config.SERVER_URL .. "/ping"
Config.STATE_URL = Config.SERVER_URL .. "/state"

--------------------------------------------------------------------------------
-- CONTEXT DETECTION
--------------------------------------------------------------------------------
local Context = {
    suffix = "",
    isEdit = false,
    isServer = false,
    isClient = false,
}

-- Determine which context we're running in
if RunService:IsEdit() then
    Context.suffix = "Edit"
    Context.isEdit = true
elseif RunService:IsServer() and not RunService:IsClient() then
    Context.suffix = "Server"
    Context.isServer = true
elseif RunService:IsClient() then
    Context.suffix = "Client"
    Context.isClient = true
else
    Context.suffix = "Unknown"
end

--------------------------------------------------------------------------------
-- LOGGING WITH BUFFER (for token-efficient log retrieval)
--------------------------------------------------------------------------------
local LogBuffer = {}  -- Circular buffer for recent logs
local LOG_BUFFER_SIZE = 50

local function addToLogBuffer(level, message)
    table.insert(LogBuffer, {
        t = os.time(),
        l = level,
        m = message
    })
    if #LogBuffer > LOG_BUFFER_SIZE then
        table.remove(LogBuffer, 1)
    end
end

local function log(message)
    local formatted = string.format("[RTA-%s] %s", Context.suffix, message)
    addToLogBuffer("INFO", formatted)
    print(formatted)
end

local function debug(message)
    if Config.DEBUG then
        local formatted = string.format("[RTA-%s] [DEBUG] %s", Context.suffix, message)
        addToLogBuffer("DEBUG", formatted)
        print(formatted)
    end
end

local globalWarn = warn
local function logWarn(message)
    local formatted = string.format("[RTA-%s] %s", Context.suffix, message)
    addToLogBuffer("WARN", formatted)
    globalWarn(formatted)
end

--------------------------------------------------------------------------------
-- SELF-HEALING: AUTO-CONFIGURE SETTINGS
--------------------------------------------------------------------------------
local ConfigurationIssues = {}

local function autoConfigureSettings()
    ConfigurationIssues = {}

    -- 1. Enable HTTP (required for IPC)
    -- Note: This can only be changed in Edit mode by plugins
    if Context.isEdit then
        local httpSuccess = pcall(function()
            if not HttpService.HttpEnabled then
                HttpService.HttpEnabled = true
                log("Auto-enabled HttpService.HttpEnabled")
            end
        end)
        if not httpSuccess then
            table.insert(ConfigurationIssues, "HTTP_ENABLE_FAILED")
        end
    end

    -- Check if HTTP is enabled
    if not HttpService.HttpEnabled then
        table.insert(ConfigurationIssues, "HTTP_DISABLED")
    end

    -- 2. Check LoadString availability
    -- Note: LoadStringEnabled property is not scriptable, can only be set via Properties panel
    -- We detect if loadstring works by testing it
    local loadstringAvailable = loadstring ~= nil
    if not loadstringAvailable then
        table.insert(ConfigurationIssues, "LOADSTRING_UNAVAILABLE")
        log("WARNING: loadstring not available - enable ServerScriptService.LoadStringEnabled in Properties")
    end

    return ConfigurationIssues
end

--------------------------------------------------------------------------------
-- IPC (HTTP-based)
--------------------------------------------------------------------------------
local IPC = {}

function IPC.readCommand()
    local success, result = pcall(function()
        -- Pass context in query string so server only delivers commands for this context
        local url = Config.COMMAND_URL .. "?context=" .. Context.suffix
        local response = HttpService:GetAsync(url)
        if response and response ~= "" then
            debug("Received command: " .. response:sub(1, 100))
            return HttpService:JSONDecode(response)
        end
        return nil
    end)

    if not success then
        -- Only log errors occasionally to avoid spam
        if math.random() < 0.01 then
            debug("GET /command error: " .. tostring(result))
        end
        return nil
    end

    if result then
        -- Check command age
        local now = os.time() * 1000
        local age = (now - (result.timestamp or 0)) / 1000
        if age > Config.MAX_COMMAND_AGE then
            log("Ignoring stale command: " .. (result.id or "unknown"))
            return nil
        end
        return result
    end

    return nil
end

function IPC.writeResponse(response)
    response.timestamp = os.time() * 1000
    response.context = Context.suffix

    local json = HttpService:JSONEncode(response)
    debug("Sending response: " .. json:sub(1, 200))

    local success, result = pcall(function()
        return HttpService:PostAsync(
            Config.RESPONSE_URL,
            json,
            Enum.HttpContentType.ApplicationJson,
            false
        )
    end)

    if success then
        debug("Response sent successfully")
        return true
    else
        logWarn("Failed to send response: " .. tostring(result))
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

function IPC.reportState(isPlaying)
    local success, err = pcall(function()
        local state = {
            isPlaying = isPlaying,
            context = Context.suffix,
            timestamp = os.time() * 1000
        }
        HttpService:PostAsync(
            Config.STATE_URL,
            HttpService:JSONEncode(state),
            Enum.HttpContentType.ApplicationJson,
            false
        )
    end)
    if success then
        debug("Reported state: isPlaying=" .. tostring(isPlaying))
    else
        debug("Failed to report state: " .. tostring(err))
    end
end

--------------------------------------------------------------------------------
-- COMMAND HANDLERS
--------------------------------------------------------------------------------
local Commands = {}

function Commands.ping(payload)
    return { success = true, result = "pong" }
end

function Commands.diagnostics(payload)
    return {
        success = true,
        result = {
            context = Context.suffix,
            isEdit = Context.isEdit,
            isServer = Context.isServer,
            isClient = Context.isClient,
            isRunning = RunService:IsRunning(),
            httpEnabled = HttpService.HttpEnabled,
            loadStringAvailable = loadstring ~= nil,
            issues = ConfigurationIssues,
            playerCount = #Players:GetPlayers(),
            timestamp = os.time(),
        }
    }
end

function Commands.getState(payload)
    return {
        success = true,
        result = {
            isPlaying = RunService:IsRunning(),
            isStudio = RunService:IsStudio(),
            isEdit = RunService:IsEdit(),
            isServer = RunService:IsServer(),
            isClient = RunService:IsClient(),
            context = Context.suffix,
        }
    }
end

function Commands.execute(payload)
    if not payload or not payload.script then
        return { success = false, error = "No script provided" }
    end

    -- Check if loadstring is available
    if not loadstring then
        return {
            success = false,
            error = "loadstring not available in this context",
            hint = "Enable ServerScriptService.LoadStringEnabled"
        }
    end

    -- Build execution environment
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
        -- Game services
        Players = Players,
        player = Players.LocalPlayer,
    }, { __index = getfenv() })

    debug("Executing script (length: " .. #payload.script .. ")")

    local fn, parseErr = loadstring(payload.script)
    if not fn then
        return { success = false, error = "Parse error: " .. tostring(parseErr) }
    end

    setfenv(fn, env)

    local success, result = pcall(fn)

    if success then
        -- Serialize result
        local serializedResult = result
        if type(result) == "userdata" or type(result) == "function" then
            serializedResult = tostring(result)
        elseif type(result) == "table" then
            local ok, json = pcall(function() return HttpService:JSONEncode(result) end)
            if not ok then
                serializedResult = tostring(result)
            end
        end
        return { success = true, result = serializedResult }
    else
        return { success = false, error = tostring(result) }
    end
end

-- Token-efficient log retrieval (avoids screenshots for debugging)
function Commands.getLogs(payload)
    local count = (payload and payload.count) or 20
    local recent = {}
    local startIdx = math.max(1, #LogBuffer - count + 1)
    for i = startIdx, #LogBuffer do
        table.insert(recent, LogBuffer[i])
    end
    return { success = true, result = recent }
end

-- Comprehensive game state snapshot (single call vs multiple)
function Commands.getFullState(payload)
    local result = {
        -- Context info
        context = Context.suffix,
        isPlaying = RunService:IsRunning(),
        isStudio = RunService:IsStudio(),
    }

    -- Player info
    local players = Players:GetPlayers()
    result.playerCount = #players

    if #players > 0 then
        local player = players[1]
        result.playerName = player.Name

        -- Character state
        if player.Character then
            local hrp = player.Character:FindFirstChild("HumanoidRootPart")
            local hum = player.Character:FindFirstChild("Humanoid")

            if hrp then
                result.playerPos = {
                    x = math.floor(hrp.Position.X * 10) / 10,
                    y = math.floor(hrp.Position.Y * 10) / 10,
                    z = math.floor(hrp.Position.Z * 10) / 10
                }
                result.playerVelocity = {
                    x = math.floor(hrp.Velocity.X * 10) / 10,
                    y = math.floor(hrp.Velocity.Y * 10) / 10,
                    z = math.floor(hrp.Velocity.Z * 10) / 10
                }
            end

            if hum then
                result.health = hum.Health
                result.maxHealth = hum.MaxHealth
                result.walkSpeed = hum.WalkSpeed
            end
        end

        -- Leaderstats
        if player:FindFirstChild("leaderstats") then
            result.stats = {}
            for _, stat in ipairs(player.leaderstats:GetChildren()) do
                result.stats[stat.Name] = stat.Value
            end
        end
    end

    -- Recent logs (last 5 for quick overview)
    result.recentLogs = {}
    local logStart = math.max(1, #LogBuffer - 4)
    for i = logStart, #LogBuffer do
        table.insert(result.recentLogs, LogBuffer[i].m)
    end

    return { success = true, result = result }
end

--------------------------------------------------------------------------------
-- CONTEXT-AWARE COMMAND ROUTING
--------------------------------------------------------------------------------

-- Commands that should only run in Edit context
local EDIT_ONLY_COMMANDS = {
    reload = true,
    savePlace = true,
}

-- Commands that prefer Server context during play mode
local SERVER_PREFERRED_COMMANDS = {
    execute = true,
}

-- Commands that any context can handle
local ANY_CONTEXT_COMMANDS = {
    ping = true,
    diagnostics = true,
    getState = true,
    getLogs = true,
    getFullState = true,
}

local function shouldHandleCommand(command)
    local action = command.action

    -- Any context commands
    if ANY_CONTEXT_COMMANDS[action] then
        -- In Edit mode, let Edit handle it
        -- In Play mode, let Server handle it (avoid duplicate responses)
        if RunService:IsRunning() then
            return Context.isServer
        else
            return Context.isEdit
        end
    end

    -- Edit-only commands
    if EDIT_ONLY_COMMANDS[action] then
        return Context.isEdit
    end

    -- Server-preferred commands (during play mode)
    if SERVER_PREFERRED_COMMANDS[action] and RunService:IsRunning() then
        return Context.isServer
    end

    -- Default: Edit handles in edit mode, Server handles in play mode
    if RunService:IsRunning() then
        return Context.isServer
    else
        return Context.isEdit
    end
end

--------------------------------------------------------------------------------
-- COMMAND DISPATCHER
--------------------------------------------------------------------------------
local function handleCommand(command)
    log("Handling command: " .. command.action .. " (id: " .. (command.id or "?") .. ")")

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
-- MAIN PLUGIN INITIALIZATION
--------------------------------------------------------------------------------
log("Plugin loading...")

-- Auto-configure settings
local issues = autoConfigureSettings()
if #issues > 0 then
    logWarn("Configuration issues: " .. table.concat(issues, ", "))
    logWarn("Some features may not work correctly.")
end

-- Check initial connection
local connected = IPC.checkConnection()
if connected then
    log("Connected to MCP server")
else
    log("MCP server not available - will retry")
end

-- Report state changes to server (helps server route commands correctly)
local lastReportedRunning = RunService:IsRunning()
spawn(function()
    -- Report initial state
    IPC.reportState(lastReportedRunning)

    -- Poll for state changes (IsRunning doesn't have a Changed event)
    while true do
        local isRunning = RunService:IsRunning()
        if isRunning ~= lastReportedRunning then
            log("Game state changed: isPlaying=" .. tostring(isRunning))
            IPC.reportState(isRunning)
            lastReportedRunning = isRunning
        end
        wait(0.5)
    end
end)

-- Main polling loop
spawn(function()
    local pollCount = 0
    while true do
        pollCount = pollCount + 1

        -- Log heartbeat every 50 polls (~5 seconds)
        if pollCount % 50 == 0 then
            debug("Polling heartbeat: " .. pollCount .. " polls")
        end

        -- Server only delivers commands meant for this context (via ?context= param)
        local command = IPC.readCommand()

        if command then
            debug("Processing command: " .. command.action)
            local response = handleCommand(command)
            IPC.writeResponse(response)
            log("Completed: " .. command.action)
        end

        wait(Config.POLL_INTERVAL)
    end
end)

-- Create toolbar UI (only in Edit mode where plugin UI works)
if Context.isEdit and plugin then
    local toolbar = plugin:CreateToolbar("Test Automation")

    local statusButton = toolbar:CreateButton(
        "Status",
        "Check connection and configuration",
        "rbxassetid://0"
    )

    statusButton.Click:Connect(function()
        log("=== Status Check ===")
        log("Context: " .. Context.suffix)
        log("HTTP Enabled: " .. tostring(HttpService.HttpEnabled))
        log("LoadString Available: " .. tostring(loadstring ~= nil))

        local connected = IPC.checkConnection()
        if connected then
            log("MCP Server: Connected")
        else
            logWarn("MCP Server: Not connected")
        end

        if #ConfigurationIssues > 0 then
            logWarn("Issues: " .. table.concat(ConfigurationIssues, ", "))
        else
            log("No configuration issues")
        end
        log("====================")
    end)

    local debugButton = toolbar:CreateButton(
        "Toggle Debug",
        "Toggle debug logging",
        "rbxassetid://0"
    )

    debugButton.Click:Connect(function()
        Config.DEBUG = not Config.DEBUG
        log("Debug logging: " .. (Config.DEBUG and "ON" or "OFF"))
    end)
end

log("Plugin initialized - context: " .. Context.suffix)
