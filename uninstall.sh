#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "=== opencode-earsay Uninstaller ==="
echo ""

CONFIG_DIR="${HOME}/.config/opencode"
PLUGIN_DIR="${CONFIG_DIR}/plugins"
SKILL_DIR="${CONFIG_DIR}/skills/earsay"
LIB_DIR="${PLUGIN_DIR}/opencode-earsay-lib"
ENTRY_POINT="${PLUGIN_DIR}/opencode-earsay.js"

REMOVED=0

if [ -f "$ENTRY_POINT" ]; then
    echo "Removing plugin entry point ($ENTRY_POINT)..."
    rm -f "$ENTRY_POINT"
    REMOVED=1
fi

if [ -d "$LIB_DIR" ]; then
    echo "Removing plugin library ($LIB_DIR)..."
    rm -rf "$LIB_DIR"
    REMOVED=1
fi

if [ -d "$SKILL_DIR" ]; then
    echo "Removing skill ($SKILL_DIR)..."
    rm -rf "$SKILL_DIR"
    REMOVED=1
fi

if [ -f /tmp/earsay-plugin.log ]; then
    echo "Removing plugin log (/tmp/earsay-plugin.log)..."
    rm -f /tmp/earsay-plugin.log
    REMOVED=1
fi

if [ "$REMOVED" -eq 0 ]; then
    echo "Nothing to uninstall. opencode-earsay is not deployed."
else
    echo ""
    echo "opencode-earsay has been removed from OpenCode."
    echo ""
    echo "To also remove the EarSay STT daemon if it was installed:"
    echo "  uv tool uninstall earsay"
    echo "  rm -rf ~/.local/share/uv/tools/earsay*"
fi
