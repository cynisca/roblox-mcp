# Roblox Game Testing Agent - Example Prompts

## Overview

These example prompts can be used to invoke comprehensive game testing using the Roblox MCP tools.

---

## Example 1: Full Game Audit

```
Test the skiing game in Roblox Studio comprehensively. Check:

1. Slope geometry - verify it goes downhill from start to finish
2. Object placement - trees, rocks should be ON the slope surface
3. Start/Finish triggers - race should start/end correctly
4. Player physics - player should slide down naturally
5. Debug objects - find any test/debug objects that shouldn't be there

Use roblox_execute with raycasting to verify surface heights.
Document all issues with severity levels (CRITICAL/HIGH/MEDIUM/LOW).
Take screenshots of visual issues.
```

---

## Example 2: Specific Feature Test

```
Test the race timing system in the skiing game:

1. Start play mode
2. Teleport player to start platform - verify race begins
3. Move player through course waypoints
4. Cross finish line - verify race ends
5. Check BestTime leaderstat updates correctly
6. Run multiple races - verify best time tracking

Report if any triggers fail to fire.
```

---

## Example 3: Collision/Physics Test

```
Test collision detection in the skiing game:

1. Get positions of all obstacles (Trees, Rocks)
2. Move player directly into each obstacle
3. Verify collision occurs (player stops or bounces)
4. Check if any obstacles can be passed through
5. Test slope collision - player should stay on surface

Document any collision issues found.
```

---

## Example 4: Visual Audit

```
Perform a visual audit of the skiing game:

1. Take screenshot from player view at start
2. Take screenshot from side view showing slope profile
3. Take screenshot at finish line
4. Identify any visual issues:
   - Floating objects
   - Objects clipping through surfaces
   - Missing textures/colors
   - UI elements not visible

Save all screenshots and describe issues found.
```

---

## Example 5: Performance Test

```
Test game performance under stress:

1. Execute script to create 50 additional parts
2. Check frame rate / lag
3. Test with player moving rapidly through course
4. Clean up test objects
5. Report any performance issues observed
```

---

## Example 6: Quick Sanity Check

```
Quick sanity check of the skiing game:

1. Verify plugin connected (roblox_ping)
2. Start play mode
3. Get full state - check player spawns correctly
4. Teleport player to finish - verify race completes
5. Stop play mode

Report pass/fail for each step.
```

---

## Using These Prompts

### With Task Tool (Subagent)
```
Use the Task tool with:
- subagent_type: "general-purpose"
- prompt: [one of the prompts above]
```

### Direct Invocation
Simply copy one of the prompts above and modify for your specific game/test needs.

---

## Writing Custom Test Prompts

Structure your prompt with:

1. **Target**: What game/feature to test
2. **Specific checks**: Numbered list of things to verify
3. **Tools to use**: Which MCP tools are relevant
4. **Output format**: How to report findings (issues, screenshots, etc.)

### Template:
```
Test [FEATURE] in [GAME]:

1. [Check 1]
2. [Check 2]
3. [Check 3]

Use [specific MCP tools or Lua functions].
Document findings with [format].
[Any special instructions].
```
