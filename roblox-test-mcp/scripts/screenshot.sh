#!/bin/bash
# Screenshot capture script for macOS
# Captures screenshots of Roblox Studio or full screen

OUTPUT_PATH=$1
STUDIO_ONLY=$2

if [ -z "$OUTPUT_PATH" ]; then
    echo "Usage: $0 <output_path> [true|false]"
    exit 1
fi

# Ensure output directory exists
OUTPUT_DIR=$(dirname "$OUTPUT_PATH")
mkdir -p "$OUTPUT_DIR"

if [ "$STUDIO_ONLY" = "true" ]; then
    # Try to get Roblox Studio window ID
    # First, get the window number
    WINDOW_ID=$(osascript -e '
        tell application "System Events"
            tell process "RobloxStudio"
                if (count of windows) > 0 then
                    set frontWindow to front window
                    return id of frontWindow
                end if
            end tell
        end tell
    ' 2>/dev/null)

    if [ -n "$WINDOW_ID" ] && [ "$WINDOW_ID" != "" ]; then
        # Capture specific window by ID
        screencapture -l "$WINDOW_ID" -x "$OUTPUT_PATH" 2>/dev/null
        if [ $? -eq 0 ] && [ -f "$OUTPUT_PATH" ]; then
            echo "captured:$OUTPUT_PATH"
            exit 0
        fi
    fi

    # Fallback: Activate studio and capture the front window
    osascript -e 'tell application "RobloxStudio" to activate' 2>/dev/null
    sleep 0.5

    # Get the window bounds and capture that region
    BOUNDS=$(osascript -e '
        tell application "System Events"
            tell process "RobloxStudio"
                if (count of windows) > 0 then
                    set theWindow to front window
                    set {x, y} to position of theWindow
                    set {w, h} to size of theWindow
                    return (x as string) & "," & (y as string) & "," & (w as string) & "," & (h as string)
                end if
            end tell
        end tell
    ' 2>/dev/null)

    if [ -n "$BOUNDS" ] && [ "$BOUNDS" != "" ]; then
        IFS=',' read -r X Y W H <<< "$BOUNDS"
        # Capture region
        screencapture -R "${X},${Y},${W},${H}" -x "$OUTPUT_PATH" 2>/dev/null
        if [ $? -eq 0 ] && [ -f "$OUTPUT_PATH" ]; then
            echo "captured:$OUTPUT_PATH"
            exit 0
        fi
    fi

    # Last fallback: capture the front window interactively
    screencapture -w -x "$OUTPUT_PATH" 2>/dev/null
    if [ $? -eq 0 ] && [ -f "$OUTPUT_PATH" ]; then
        echo "captured:$OUTPUT_PATH"
        exit 0
    fi

    echo "error:Could not capture Roblox Studio window"
    exit 1
else
    # Full screen capture
    screencapture -x "$OUTPUT_PATH"
    if [ $? -eq 0 ] && [ -f "$OUTPUT_PATH" ]; then
        echo "captured:$OUTPUT_PATH"
        exit 0
    fi
    echo "error:Screenshot failed"
    exit 1
fi
