#!/bin/zsh
# Booth preview: booth.sh main.mp3 color.mp3 out.mp3 [gap]  — the color line starts <gap> seconds after the main
# commentator stops talking (negative = jumps in over the end of it). The game does the same timing live.
main=$1; color=$2; out=$3; gap=${4:-0.45}
# where the main line's speech actually ends (clips carry a little silence at the tail)
end=$(ffmpeg -hide_banner -i "$main" -af silencedetect=n=-40dB:d=0.15 -f null - 2>&1 | grep silence_start | tail -1 | sed 's/.*silence_start: //')
dur=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$main")
[ -z "$end" ] && end=$dur
[ $(echo "$dur - $end > 0.8" | bc) = 1 ] && end=$dur   # (the last silence wasn't the tail)
at=$(echo "($end + $gap) * 1000" | bc | cut -d. -f1)
ffmpeg -loglevel error -y -i "$main" -i "$color" -filter_complex "[1:a]adelay=${at}|${at}[c];[0:a][c]amix=inputs=2:duration=longest:normalize=0,alimiter=limit=0.95[o]" -map "[o]" -ac 1 -b:a 128k "$out"
