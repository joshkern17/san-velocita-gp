#!/bin/zsh
# dev: run one headless-browser test safely: .devtest/guard.sh [-m MB] [-t seconds] <command...>
# Waits while any other headless Chrome (playwright) is running (one browser at a time, across sessions), then runs
# the command; kills it and every browser it started if their memory passes -m (default 3000 MB) or it runs past -t
# (default 180 s). Exit code: the command's, or 124 when stopped.
MB=3000; T=180
while [[ $1 == -* ]]; do case $1 in -m) MB=$2; shift 2;; -t) T=$2; shift 2;; *) break;; esac; done
chromes() { pgrep -f playwright_chromiumdev_profile | tr '\n' ' '; }
for i in {1..120}; do [[ -z "$(chromes)" ]] && break; (( i == 1 )) && echo "guard: waiting for another browser run to finish"; sleep 2; done
before=" $(chromes) "
"$@" & P=$!
stop() { echo "guard: $1 - stopping"; kill -9 $P 2>/dev/null; for c in $(chromes); do [[ "$before" != *" $c "* ]] && kill -9 $c 2>/dev/null; done; }
for (( s = 0; s < T * 2; s++ )); do
  sleep 0.5; kill -0 $P 2>/dev/null || { wait $P; exit $?; }
  mem=$(ps -o rss= -p $P $(chromes) 2>/dev/null | awk '{s+=$1} END {print int(s/1024)}')
  (( mem > MB )) && { stop "${mem} MB over ${MB} MB"; exit 124; }
done
stop "over ${T} s"; exit 124
