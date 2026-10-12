#!/usr/bin/env bash
# ==============================================================================
# Claude Pulse - macOS / Linux One-Click Installer
# Universal Multi-Protocol StatusLine & Dinotty Plugin for Claude Code
# ==============================================================================

set -e

GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${CYAN}"
echo "  ____ _                 _         ____        _          "
echo " / ___| | __ _ _   _  __| | ___   |  _ \ _   _| |___  ___ "
echo "| |   | |/ _\` | | | |/ _\` |/ _ \  | |_) | | | | / __|/ _ \\"
echo "| |___| | (_| | |_| | (_| |  __/  |  __/| |_| | \__ \  __/"
echo " \____|_|\__,_|\__,_|\__,_|\___|  |_|    \__,_|_|___/\___|"
echo "                                                          "
echo " Universal Multi-Protocol Statusline & Telemetry System"
echo -e "${NC}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo -e "${YELLOW}==> [1/4] Checking prerequisites...${NC}"
if ! command -v node >/dev/null 2>&1; then
    echo -e "${RED}  ✗ Node.js is required but was not found in PATH.${NC}"
    echo "    Please install Node.js from https://nodejs.org first."
    exit 1
fi
echo -e "${GREEN}  ✓ Node.js detected: $(node -v)${NC}"

CLAUDE_DIR="$HOME/.claude"
mkdir -p "$CLAUDE_DIR"

echo -e "${YELLOW}==> [2/4] Installing statusline engine...${NC}"
cp "$SCRIPT_DIR/scripts/statusline.cjs" "$CLAUDE_DIR/statusline.cjs"
chmod +x "$CLAUDE_DIR/statusline.cjs"
echo -e "${GREEN}  ✓ Statusline engine deployed to: $CLAUDE_DIR/statusline.cjs${NC}"

# Update settings.json safely via node inline script
SETTINGS_PATH="$CLAUDE_DIR/settings.json"
node -e "
const fs = require('fs');
const file = '$SETTINGS_PATH';
let data = {};
try {
    if (fs.existsSync(file)) {
        data = JSON.parse(fs.readFileSync(file, 'utf8'));
    }
} catch (e) {}
data.statusLine = {
    type: 'command',
    command: 'node ' + '$CLAUDE_DIR/statusline.cjs',
    padding: 0
};
fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
"
echo -e "${GREEN}  ✓ Claude Code settings updated: $SETTINGS_PATH${NC}"

# Dinotty Integration
echo -e "${YELLOW}==> [3/4] Checking Dinotty integration...${NC}"
DINOTTY_DIR="$HOME/.dinotty"
if [ -d "$DINOTTY_DIR" ] || [ -d "/Applications/Dinotty.app" ]; then
    PLUGIN_TARGET="$DINOTTY_DIR/plugins/agent-cache"
    mkdir -p "$PLUGIN_TARGET"
    cp -r "$SCRIPT_DIR/dinotty-plugin/agent-cache/"* "$PLUGIN_TARGET/"
    echo -e "${GREEN}  ✓ Dinotty plugin installed: $PLUGIN_TARGET${NC}"
else
    echo "  - Dinotty directory not detected, skipped Dinotty plugin install."
fi

# CC Switch Integration
echo -e "${YELLOW}==> [4/4] Checking CC Switch configuration...${NC}"
CC_SWITCH_DB="$HOME/.cc-switch/cc-switch.db"
if [ -f "$CC_SWITCH_DB" ]; then
    if command -v python3 >/dev/null 2>&1; then
        python3 "$SCRIPT_DIR/scripts/patch-ccswitch.py" || true
    else
        echo "  - Python3 not found; skipping CC Switch DB patch."
    fi
else
    echo "  - CC Switch not detected, skipped."
fi

echo -e "${GREEN}"
echo "======================================================="
echo " 🎉 Installation Completed Successfully!"
echo "======================================================="
echo " 1. Launch or restart Claude Code in your terminal."
echo " 2. Enjoy the universal, multi-protocol statusline!"
echo "======================================================="
echo -e "${NC}"
