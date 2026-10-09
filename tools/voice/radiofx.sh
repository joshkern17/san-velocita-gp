#!/bin/zsh
# Team-radio effect preview: radiofx.sh in.mp3 out.mp3
# Band-limited voice, light compression + drive, a faint static bed, and a squelch burst at key-up and key-down.
# (The game will do the same chain live in WebAudio; this is for listening to clips outside the game.)
in=$1; out=$2
d=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$in")
pre=0.18; post=0.22; total=$(echo "$d + $pre + $post" | bc)
ffmpeg -loglevel error -y -i "$in" \
  -f lavfi -t $total -i "anoisesrc=color=pink:amplitude=0.5:seed=7" \
  -f lavfi -t 0.07 -i "anoisesrc=color=white:amplitude=0.6:seed=3" \
  -f lavfi -t 0.11 -i "anoisesrc=color=white:amplitude=0.6:seed=5" \
  -filter_complex "
    [0:a]aresample=44100,adelay=${pre}s:all=1,apad=pad_dur=${post},
      highpass=f=380,highpass=f=380,lowpass=f=3300,lowpass=f=3300,
      equalizer=f=1800:t=q:w=1.2:g=4,
      acompressor=threshold=-22dB:ratio=4:attack=4:release=80:makeup=6dB,
      asoftclip=type=atan:param=1.2,volume=0.8[v];
    [1:a]highpass=f=500,lowpass=f=3500,volume=0.022[bed];
    [2:a]highpass=f=900,lowpass=f=4500,afade=t=out:st=0.03:d=0.04,volume=0.35[k1];
    [3:a]highpass=f=900,lowpass=f=4500,afade=t=out:st=0.05:d=0.06,volume=0.45,adelay=$(echo "($d + $pre + 0.05)*1000" | bc)|$(echo "($d + $pre + 0.05)*1000" | bc)[k2];
    [v][bed][k1][k2]amix=inputs=4:duration=first:normalize=0,volume=2.1,alimiter=limit=0.95[o]" \
  -map "[o]" -ac 1 -b:a 128k "$out"
