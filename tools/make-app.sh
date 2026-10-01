#!/bin/bash
# Builds "San Velocita GP.app" next to the game files. Re-run if you move the game folder.
set -e
GAME="$(cd "$(dirname "$0")/.." && pwd)"
APP="$GAME/San Velocita GP.app"
rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"

# icon
ICONSET="$(mktemp -d)/AppIcon.iconset"; mkdir -p "$ICONSET"
for s in 16 32 128 256 512; do
  sips -z $s $s "$GAME/tools/icon-1024.png" --out "$ICONSET/icon_${s}x${s}.png" >/dev/null
  sips -z $((s*2)) $((s*2)) "$GAME/tools/icon-1024.png" --out "$ICONSET/icon_${s}x${s}@2x.png" >/dev/null
done
iconutil -c icns "$ICONSET" -o "$APP/Contents/Resources/AppIcon.icns"

cat > "$APP/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>CFBundleName</key><string>San Velocita GP</string>
  <key>CFBundleDisplayName</key><string>San Velocita GP</string>
  <key>CFBundleIdentifier</key><string>local.sanvelocita.gp</string>
  <key>CFBundleVersion</key><string>1.0</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleExecutable</key><string>launch</string>
  <key>CFBundleIconFile</key><string>AppIcon</string>
  <key>LSUIElement</key><true/>
</dict></plist>
PLIST

cat > "$APP/Contents/MacOS/launch" <<LAUNCH
#!/bin/bash
# Find the game: next to this app, or where it was when the app was built.
HERE="\$(cd "\$(dirname "\$0")/../../.." && pwd)"
GAME="\$HERE"; [ -f "\$GAME/serve.py" ] || GAME="$GAME"
PORT=8000
URL="http://localhost:\$PORT/"
PY=""
for p in /opt/homebrew/bin/python3 /usr/local/bin/python3 /usr/bin/python3; do [ -x "\$p" ] && { PY="\$p"; break; }; done
if [ -z "\$PY" ]; then osascript -e 'display alert "San Velocita GP" message "Python 3 is needed to run the game."'; exit 1; fi
if ! curl -s -m 1 "\${URL}__ping" | grep -q svgp; then
  "\$PY" "\$GAME/serve.py" \$PORT --no-browser --auto-exit >/tmp/svgp-server.log 2>&1 &
  for i in \$(seq 1 50); do curl -s -m 1 -o /dev/null "\$URL" && break; sleep 0.1; done
fi
# open in its own window (app mode) when a Chromium browser is installed
for b in "Google Chrome" "Microsoft Edge" "Brave Browser" "Chromium"; do
  if [ -d "/Applications/\$b.app" ] || [ -d "\$HOME/Applications/\$b.app" ]; then
    open -na "\$b" --args --app="\$URL" --window-size=1600,900 --autoplay-policy=no-user-gesture-required
    exit 0
  fi
done
open "\$URL"
LAUNCH
chmod +x "$APP/Contents/MacOS/launch"
touch "$APP"
echo "Built: $APP"
