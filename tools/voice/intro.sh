#!/bin/zsh
# Track intro preview: intro.sh <track> <conditions> out.mp3 [pause]   e.g. intro.sh spa rain spa-rain.mp3
# The track exchange, then the conditions exchange <pause> seconds after it (default 0.6), as the game plays them.
here=${0:A:h}; V=$here/../../assets/voice
a=$V/booth/track.$1.welcome.mp3; b=$V/booth/cond.$2.mp3
for f in $a $b; do [ -f $f ] || { echo "missing: $f"; exit 1; }; done
$here/booth.sh $a $b "$3" ${4:-0.6}
