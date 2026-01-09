#!/bin/bash
# Install Roblox Test Automation Plugin for macOS

PLUGINS_DIR="$HOME/Documents/Roblox/Plugins"
SOURCE_DIR="$(dirname "$0")/src"
TARGET_DIR="$PLUGINS_DIR/RobloxTestAutomation"

echo "Installing Roblox Test Automation Plugin..."
echo ""

# Create plugins directory if needed
if [ ! -d "$PLUGINS_DIR" ]; then
    mkdir -p "$PLUGINS_DIR"
    echo "Created plugins directory: $PLUGINS_DIR"
fi

# Remove old plugin if exists
if [ -d "$TARGET_DIR" ]; then
    rm -rf "$TARGET_DIR"
    echo "Removed old plugin installation"
fi

# Create plugin folder
mkdir -p "$TARGET_DIR"

# Copy only the main plugin file
cp "$SOURCE_DIR/init.server.lua" "$TARGET_DIR/"

echo "Plugin installed to: $TARGET_DIR"
echo ""
echo "Next steps:"
echo "1. Open Roblox Studio"
echo "2. Enable HTTP requests: Home → Game Settings → Security → Allow HTTP Requests"
echo "3. Check Output window for '[RobloxTestAutomation]' messages"
echo ""
echo "If updating, reload the plugin: Plugins → Manage Plugins → Reload"
