# Roblox Game Testing Agent

## Overview

This document describes how to use the Roblox MCP tools to systematically test Roblox games. When given a testing task, follow this methodology.

## Available MCP Tools

| Tool | Purpose | When to Use |
|------|---------|-------------|
| `roblox_get_full_state` | Get player position, health, stats, logs | Start of tests, after actions |
| `roblox_get_logs` | Get recent plugin logs | Debugging, checking events |
| `roblox_execute` | Run Lua code in game | Inspect objects, teleport, modify state |
| `roblox_play` | Start play mode | Before gameplay tests |
| `roblox_stop` | Stop play mode | After tests complete |
| `roblox_screenshot` | Capture visual state | Verify visual issues, document findings |
| `roblox_ping` | Check plugin connection | Verify setup before testing |

## Testing Methodology

### Phase 1: Setup Verification
```
1. roblox_ping - Verify plugin connected
2. roblox_get_full_state - Check initial state
3. roblox_play - Enter play mode
4. Wait 3 seconds for game to load
5. roblox_get_full_state - Verify play mode active
```

### Phase 2: Object Audit
Use `roblox_execute` with this template:
```lua
-- Get all game objects with properties
local objects = {}
for _, obj in ipairs(workspace:GetChildren()) do
    if obj:IsA("BasePart") then
        table.insert(objects, {
            name = obj.Name,
            position = {x=obj.Position.X, y=obj.Position.Y, z=obj.Position.Z},
            size = {x=obj.Size.X, y=obj.Size.Y, z=obj.Size.Z},
            rotation = {x=obj.Orientation.X, y=obj.Orientation.Y, z=obj.Orientation.Z},
            anchored = obj.Anchored,
            canCollide = obj.CanCollide
        })
    end
end
return objects
```

### Phase 3: Geometry Verification
For slopes, platforms, or angled surfaces:
```lua
-- Raycast to find actual surface heights
local function getSurfaceY(x, z)
    local origin = Vector3.new(x, 500, z)
    local direction = Vector3.new(0, -1000, 0)
    local params = RaycastParams.new()
    params.FilterType = Enum.RaycastFilterType.Exclude
    params.FilterDescendantsInstances = {game.Players:GetPlayers()[1].Character}
    local result = workspace:Raycast(origin, direction, params)
    return result and result.Position.Y or nil
end

-- Test multiple points
local points = {}
for z = -100, 100, 20 do
    table.insert(points, {z = z, surfaceY = getSurfaceY(0, z)})
end
return points
```

### Phase 4: Player Interaction Tests
```lua
-- Teleport and verify player lands correctly
local player = game.Players:GetPlayers()[1]
local hrp = player.Character.HumanoidRootPart

hrp.CFrame = CFrame.new(targetX, targetY + 10, targetZ)
wait(1)  -- Let player fall

return {
    landed = {
        x = hrp.Position.X,
        y = hrp.Position.Y,
        z = hrp.Position.Z
    },
    velocity = {
        x = hrp.Velocity.X,
        y = hrp.Velocity.Y,
        z = hrp.Velocity.Z
    }
}
```

### Phase 5: Trigger/Event Tests
```lua
-- Move player through trigger zones
local waypoints = {
    {0, 50, -100},  -- Start
    {0, 40, -50},
    {0, 30, 0},
    {0, 20, 50},
    {0, 10, 100},   -- End
}

for _, pos in ipairs(waypoints) do
    hrp.CFrame = CFrame.new(unpack(pos))
    wait(0.2)
end

-- Check if events fired (via leaderstats, logs, etc)
return player.leaderstats.BestTime.Value
```

## Common Test Patterns

### Test: Objects on Surface
Verify objects are properly placed on surfaces (not floating/embedded):
```lua
local issues = {}
for _, obj in ipairs(workspace:GetChildren()) do
    if obj:IsA("BasePart") and obj.Name:match("Tree") then
        local surfaceY = getSurfaceY(obj.Position.X, obj.Position.Z)
        local expectedY = surfaceY + obj.Size.Y/2
        local diff = obj.Position.Y - expectedY
        if math.abs(diff) > 2 then
            table.insert(issues, {
                name = obj.Name,
                diff = diff,
                status = diff > 0 and "FLOATING" or "EMBEDDED"
            })
        end
    end
end
return issues
```

### Test: Collision Detection
```lua
-- Check if player collides with object
local target = workspace.SomeObstacle
hrp.CFrame = target.CFrame + Vector3.new(0, 5, 0)
wait(0.5)
local distance = (hrp.Position - target.Position).Magnitude
return {
    collided = distance < target.Size.Magnitude,
    distance = distance
}
```

### Test: Race/Timer Systems
```lua
-- Test race from start to finish
local startTime = tick()
hrp.CFrame = CFrame.new(startPos)
wait(0.2)

-- Move through course
for _, checkpoint in ipairs(checkpoints) do
    hrp.CFrame = CFrame.new(unpack(checkpoint))
    wait(0.15)
end

-- Check results
return {
    elapsed = tick() - startTime,
    bestTime = player.leaderstats.BestTime.Value,
    completed = player.leaderstats.BestTime.Value < 999
}
```

## Issue Classification

| Severity | Description | Examples |
|----------|-------------|----------|
| CRITICAL | Game unplayable | Wrong physics, broken triggers |
| HIGH | Major feature broken | Scoring not working, respawn issues |
| MEDIUM | Noticeable problems | Visual glitches, minor collision issues |
| LOW | Polish issues | Z-fighting, minor positioning |

## Output Format

Document findings in this structure:
```markdown
## Issue #N: [Title]
**Severity**: CRITICAL/HIGH/MEDIUM/LOW
**Component**: [Object/System name]
**Description**: What's wrong
**Evidence**: Data/screenshots proving the issue
**Fix**: Recommended solution
```
