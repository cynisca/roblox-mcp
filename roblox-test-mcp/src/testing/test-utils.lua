--[[
    Roblox Game Testing Utilities

    These functions can be copy-pasted into roblox_execute calls
    or loaded as a module for comprehensive game testing.
]]

local TestUtils = {}

-- Get all BasePart objects in workspace with their properties
function TestUtils.auditObjects()
    local objects = {}
    for _, obj in ipairs(workspace:GetChildren()) do
        if obj:IsA("BasePart") then
            table.insert(objects, {
                name = obj.Name,
                class = obj.ClassName,
                pos = {
                    x = math.floor(obj.Position.X * 10) / 10,
                    y = math.floor(obj.Position.Y * 10) / 10,
                    z = math.floor(obj.Position.Z * 10) / 10
                },
                size = {
                    x = obj.Size.X,
                    y = obj.Size.Y,
                    z = obj.Size.Z
                },
                rot = {
                    x = math.floor(obj.Orientation.X),
                    y = math.floor(obj.Orientation.Y),
                    z = math.floor(obj.Orientation.Z)
                },
                anchored = obj.Anchored,
                canCollide = obj.CanCollide
            })
        end
    end
    return objects
end

-- Raycast down to find surface height at a point
function TestUtils.getSurfaceY(x, z, excludePlayer)
    local Players = game:GetService("Players")
    local origin = Vector3.new(x, 500, z)
    local direction = Vector3.new(0, -1000, 0)

    local params = RaycastParams.new()
    params.FilterType = Enum.RaycastFilterType.Exclude

    if excludePlayer then
        local player = Players:GetPlayers()[1]
        if player and player.Character then
            params.FilterDescendantsInstances = {player.Character}
        end
    end

    local result = workspace:Raycast(origin, direction, params)
    if result then
        return {
            y = math.floor(result.Position.Y * 10) / 10,
            hitPart = result.Instance.Name
        }
    end
    return nil
end

-- Get surface heights along a line (for slope analysis)
function TestUtils.profileSurface(startZ, endZ, step, x)
    x = x or 0
    step = step or 20
    local profile = {}

    for z = startZ, endZ, step do
        local surface = TestUtils.getSurfaceY(x, z, true)
        table.insert(profile, {
            z = z,
            surfaceY = surface and surface.y or "NO_HIT",
            hitPart = surface and surface.hitPart or "none"
        })
    end

    return profile
end

-- Check if objects are properly placed on surfaces
function TestUtils.checkObjectPlacement(objectPattern)
    local issues = {}

    for _, obj in ipairs(workspace:GetChildren()) do
        if obj:IsA("BasePart") and obj.Name:match(objectPattern or ".") then
            local surface = TestUtils.getSurfaceY(obj.Position.X, obj.Position.Z, true)

            if surface then
                local expectedY = surface.y + obj.Size.Y / 2
                local actualY = obj.Position.Y
                local diff = actualY - expectedY

                table.insert(issues, {
                    name = obj.Name,
                    z = math.floor(obj.Position.Z),
                    actualY = math.floor(actualY * 10) / 10,
                    expectedY = math.floor(expectedY * 10) / 10,
                    diff = math.floor(diff * 10) / 10,
                    status = math.abs(diff) < 3 and "OK" or (diff > 0 and "FLOATING" or "EMBEDDED")
                })
            end
        end
    end

    return issues
end

-- Get player state
function TestUtils.getPlayerState()
    local Players = game:GetService("Players")
    local player = Players:GetPlayers()[1]

    if not player then
        return { error = "No player found" }
    end

    local state = {
        name = player.Name,
        stats = {}
    }

    -- Character info
    if player.Character then
        local hrp = player.Character:FindFirstChild("HumanoidRootPart")
        local hum = player.Character:FindFirstChild("Humanoid")

        if hrp then
            state.position = {
                x = math.floor(hrp.Position.X * 10) / 10,
                y = math.floor(hrp.Position.Y * 10) / 10,
                z = math.floor(hrp.Position.Z * 10) / 10
            }
            state.velocity = {
                x = math.floor(hrp.Velocity.X * 10) / 10,
                y = math.floor(hrp.Velocity.Y * 10) / 10,
                z = math.floor(hrp.Velocity.Z * 10) / 10
            }
        end

        if hum then
            state.health = hum.Health
            state.maxHealth = hum.MaxHealth
            state.walkSpeed = hum.WalkSpeed
        end
    end

    -- Leaderstats
    if player:FindFirstChild("leaderstats") then
        for _, stat in ipairs(player.leaderstats:GetChildren()) do
            state.stats[stat.Name] = stat.Value
        end
    end

    return state
end

-- Teleport player and wait for landing
function TestUtils.teleportAndLand(x, y, z, waitTime)
    local Players = game:GetService("Players")
    local player = Players:GetPlayers()[1]

    if not player or not player.Character then
        return { error = "No character" }
    end

    local hrp = player.Character:FindFirstChild("HumanoidRootPart")
    if not hrp then
        return { error = "No HumanoidRootPart" }
    end

    hrp.CFrame = CFrame.new(x, y, z)
    wait(waitTime or 1)

    return {
        landed = {
            x = math.floor(hrp.Position.X * 10) / 10,
            y = math.floor(hrp.Position.Y * 10) / 10,
            z = math.floor(hrp.Position.Z * 10) / 10
        },
        velocity = {
            x = math.floor(hrp.Velocity.X * 10) / 10,
            y = math.floor(hrp.Velocity.Y * 10) / 10,
            z = math.floor(hrp.Velocity.Z * 10) / 10
        }
    }
end

-- Move player through waypoints (for trigger testing)
function TestUtils.moveThruWaypoints(waypoints, delayPerPoint)
    local Players = game:GetService("Players")
    local player = Players:GetPlayers()[1]

    if not player or not player.Character then
        return { error = "No character" }
    end

    local hrp = player.Character:FindFirstChild("HumanoidRootPart")
    if not hrp then
        return { error = "No HumanoidRootPart" }
    end

    delayPerPoint = delayPerPoint or 0.2
    local results = {}

    for i, wp in ipairs(waypoints) do
        hrp.CFrame = CFrame.new(wp[1], wp[2], wp[3])
        wait(delayPerPoint)
        table.insert(results, {
            waypoint = i,
            position = tostring(hrp.Position)
        })
    end

    -- Get final state
    local finalState = TestUtils.getPlayerState()

    return {
        waypointsCompleted = #results,
        finalStats = finalState.stats,
        finalPosition = finalState.position
    }
end

-- Find debug/test objects that shouldn't be in production
function TestUtils.findDebugObjects(validNames)
    local validSet = {}
    for _, name in ipairs(validNames or {}) do
        validSet[name] = true
    end

    local debugObjects = {}

    for _, child in ipairs(workspace:GetChildren()) do
        local isValid = validSet[child.Name]
        local isModel = child:IsA("Model")
        local isTerrain = child.Name == "Terrain"
        local isCamera = child.Name == "Camera"

        if not isValid and not isModel and not isTerrain and not isCamera then
            if child.Name:match("Test") or child.Name:match("Debug") or child.Name:match("Marker") or child.Name:match("MCP") then
                table.insert(debugObjects, {
                    name = child.Name,
                    class = child.ClassName,
                    position = child:IsA("BasePart") and tostring(child.Position) or "N/A"
                })
            end
        end
    end

    return debugObjects
end

-- Analyze slope/ramp geometry
function TestUtils.analyzeSlope(slopeName)
    local slope = workspace:FindFirstChild(slopeName)
    if not slope then
        return { error = "Slope not found: " .. slopeName }
    end

    local analysis = {
        name = slope.Name,
        position = {
            x = slope.Position.X,
            y = slope.Position.Y,
            z = slope.Position.Z
        },
        size = {
            x = slope.Size.X,
            y = slope.Size.Y,
            z = slope.Size.Z
        },
        rotation = {
            x = slope.Orientation.X,
            y = slope.Orientation.Y,
            z = slope.Orientation.Z
        }
    }

    -- Calculate surface heights at key points
    local halfLength = slope.Size.Z / 2
    local testPoints = {-halfLength, 0, halfLength}

    analysis.surfaceProfile = {}
    for _, z in ipairs(testPoints) do
        local surface = TestUtils.getSurfaceY(0, z, true)
        table.insert(analysis.surfaceProfile, {
            z = z,
            surfaceY = surface and surface.y or "NO_HIT"
        })
    end

    -- Determine if slope goes up or down
    local startY = analysis.surfaceProfile[1].surfaceY
    local endY = analysis.surfaceProfile[3].surfaceY

    if type(startY) == "number" and type(endY) == "number" then
        analysis.direction = startY > endY and "DOWNHILL" or "UPHILL"
        analysis.heightDrop = startY - endY
    end

    return analysis
end

return TestUtils
