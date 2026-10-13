#!/bin/zsh
# (dev) A real circuit rebuilt on a reference model and with it as its scenery, start to finish:
#   tools/tracks/ref/refbuild.sh <id> <model.glb>
# 1. refkit.py: the model's materials sorted, the model placed, the road / walls / ground measured off it
# 2. Blender: the model with its textures down to 512 px -> models/tracks/<id>_ref.glb (git-ignored: reference only)
# 3. build.mjs --ref: the track -> tools/tracks/cache/ref/<id>_ref.json (+ the dev list the picker reads)
# 4. .devtest/kerbfling.mjs: nowhere on the lap does running wide over a kerb launch the car
set -e
cd "$(dirname "$0")/../../.."
ID=$1; GLB=$2; OUT=tools/tracks/cache/ref/$ID.refline.json
BLENDER=${BLENDER:-/Applications/Blender.app/Contents/MacOS/Blender}
[ -f "tracks/real/$ID.json" ] || { echo "build the circuit first: node tools/tracks/build.mjs $ID"; exit 1; }
python3 tools/tracks/ref/refkit.py "$ID" "$GLB" "$OUT"
mkdir -p models/tracks
"$BLENDER" -b -P tools/tracks/ref/shrink.py -- "$GLB" "models/tracks/${ID}_ref.glb" 512 2>&1 | grep -E "shrank|Error" || true
node tools/tracks/build.mjs "$ID" --ref "$OUT" | grep -vE "Downloading|^\s*$"
node .devtest/kerbfling.mjs "${ID}_ref" | grep -E "PASS|FAIL|kerb runs|hardest"
