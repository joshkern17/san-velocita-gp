#!/bin/sh
# Rebuild models/characters.glb from the BitSoft pack + Mixamo clips (see README.md here).
#   tools/characters/build.sh ["<pack folder>"]      default: ~/Downloads/Male PSX Characters
set -e
PACK="${1:-$HOME/Downloads/Male PSX Characters}"
HERE="$(cd "$(dirname "$0")" && pwd)"; ROOT="$HERE/../.."
B="${BLENDER:-/Applications/Blender.app/Contents/MacOS/Blender}"
TMP="$(mktemp -d)"
"$B" -b "$PACK/Rigged Low-Poly Male Job NPCs - Blender/Rigged Male Jobs Low-Poly NPCs.blend" --python "$HERE/rebuild.py" -- \
  "$PACK/Males Jobs - t-shirt mod/Male Jobs - t-shirt mod.blend" "$TMP/clean.blend" | grep -E '^(MESHES|MISSING)' | cut -c1-200
"$B" -b "$TMP/clean.blend" --python "$HERE/mixamo.py" -- "${MIXAMO:-$PACK}" "$ROOT/models/characters.glb" | grep -E '^(ALIGN posed|CLIP|SKIP|WROTE)'
rm -rf "$TMP"
