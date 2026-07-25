#!/usr/bin/env bash
# deploy.sh — install opencode-earsay to ~/.config/opencode/plugins/ and ~/.config/opencode/skills/
#
# Usage:
#   ./deploy.sh
#
# Prerequisites:
#   git clone https://github.com/AlastorMordrek/opencode-earsay.git
#   cd opencode-earsay
#   npm install && npm run build
#   ./deploy.sh
#
# Then add the skill line to ~/.config/opencode/opencode.jsonc "instructions":
#     "~/.config/opencode/skills/earsay/SKILL.md"
#
# Then restart opencode.

set -euo pipefail

CONFIG_DIR="${HOME}/.config/opencode"
PLUGIN_DIR="${CONFIG_DIR}/plugins"
SKILL_DIR="${CONFIG_DIR}/skills/earsay"
LIB_DIR="${PLUGIN_DIR}/opencode-earsay-lib"
ENTRY_POINT="${PLUGIN_DIR}/opencode-earsay.js"

echo "→ creating directories..."
mkdir -p "$LIB_DIR" "$SKILL_DIR"

echo "→ copying plugin library (dist/*) → ${LIB_DIR}/"
cp dist/*.js dist/*.d.ts "$LIB_DIR/"

echo "→ writing plugin entry point → ${ENTRY_POINT}"
cat > "$ENTRY_POINT" <<'EOF'
import { OpencodeEarsayPlugin } from "./opencode-earsay-lib/index.js"
export default OpencodeEarsayPlugin
export { OpencodeEarsayPlugin }
EOF

echo "→ copying skill → ${SKILL_DIR}/SKILL.md"
cp skills/earsay/SKILL.md "$SKILL_DIR/SKILL.md"

echo ""
echo "✅ Plugin deployed."
echo ""
echo "Next step: edit ~/.config/opencode/opencode.jsonc"
echo "Add this line to the \"instructions\" array:"
echo ""
echo '    "~/.config/opencode/skills/earsay/SKILL.md"'
echo ""
echo "Then restart opencode."
