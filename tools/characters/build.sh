#!/bin/sh
# Rebuild models/characters.glb from the BitSoft pack + Mixamo clips + the racer (see README.md here).
#   tools/characters/build.sh ["<pack folder>"]      default: ~/Downloads/Male PSX Characters
set -e -o pipefail
PACK="${1:-$HOME/Downloads/Male PSX Characters}"
HERE="$(cd "$(dirname "$0")" && pwd)"; ROOT="$HERE/../.."
B="${BLENDER:-/Applications/Blender.app/Contents/MacOS/Blender}"
TMP="$(mktemp -d)"
"$B" -b --python-exit-code 1 "$PACK/Rigged Low-Poly Male Job NPCs - Blender/Rigged Male Jobs Low-Poly NPCs.blend" --python "$HERE/rebuild.py" -- \
  "$PACK/Males Jobs - t-shirt mod/Male Jobs - t-shirt mod.blend" "$TMP/clean.blend" | grep -E '^(MESHES|MISSING)' | cut -c1-200
"$B" -b --python-exit-code 1 "$TMP/clean.blend" --python "$HERE/racer.py" -- "${RACER:-$ROOT/models/helmet-paint.glb}" "$TMP/clean.blend" | grep -E '^(BBOX|PARTS|DETAIL|WROTE)' | cut -c1-200
"$B" -b --python-exit-code 1 "$TMP/clean.blend" --python "$HERE/mixamo.py" -- "${MIXAMO:-$PACK}" "$ROOT/models/characters.glb" ${CHECK:+check} | grep -E '^(ALIGN posed|CLIP|REST|IN PLACE|SKIP|MISSING|WROTE)'
rm -rf "$TMP"
