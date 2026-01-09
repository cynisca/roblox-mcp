#!/bin/bash
# Roblox Studio Control Script for macOS
# Uses AppleScript to send keyboard commands to Roblox Studio

ACTION=$1

# Function to check if Roblox Studio is running
check_studio() {
    osascript -e 'tell application "System Events" to (name of processes) contains "RobloxStudio"' 2>/dev/null
}

case $ACTION in
    play)
        # Activate Roblox Studio and press F5
        osascript <<EOF
tell application "RobloxStudio" to activate
delay 0.3
tell application "System Events"
    key code 96  -- F5 key
end tell
EOF
        echo "Sent F5 (Play)"
        ;;
    stop)
        # Activate Roblox Studio and press Shift+F5
        osascript <<EOF
tell application "RobloxStudio" to activate
delay 0.3
tell application "System Events"
    key code 96 using shift down  -- Shift+F5
end tell
EOF
        echo "Sent Shift+F5 (Stop)"
        ;;
    focus)
        osascript -e 'tell application "RobloxStudio" to activate'
        echo "Focused Roblox Studio"
        ;;
    check)
        if [ "$(check_studio)" = "true" ]; then
            echo "running"
            exit 0
        else
            echo "not_running"
            exit 1
        fi
        ;;
    *)
        echo "Usage: $0 {play|stop|focus|check}"
        exit 1
        ;;
esac

exit 0
