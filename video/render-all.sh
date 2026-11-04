#!/usr/bin/env bash
# Renders the whole film in parallel segments, joins them, and adds the score.
#   ./video/render-all.sh [workers=4]
set -euo pipefail
cd "$(dirname "$0")/.."
N=${1:-4}
FPS=24
DUR=165
OUT=video/out
mkdir -p "$OUT"
./node_modules/.bin/esbuild video/film.ts --bundle --format=iife --target=chrome120 --outfile=video/dist/film.js --log-level=warning
python3 video/score.py "$OUT/score.wav"
rm -f "$OUT"/part-*.mp4 "$OUT/parts.txt"
STEP=$(python3 -c "print($DUR / $N)")
for i in $(seq 0 $((N - 1))); do
  FROM=$(python3 -c "print($i * $STEP)")
  TO=$(python3 -c "print(($i + 1) * $STEP)")
  node video/render.mjs --fps $FPS --from "$FROM" --to "$TO" --out "$OUT/part-$i.mp4" > "$OUT/part-$i.log" 2>&1 &
  echo "file 'part-$i.mp4'" >> "$OUT/parts.txt"
done
wait
ffmpeg -y -loglevel error -f concat -safe 0 -i "$OUT/parts.txt" -c copy "$OUT/film-silent.mp4"
ffmpeg -y -loglevel error -i "$OUT/film-silent.mp4" -i "$OUT/score.wav" -c:v copy -c:a aac -b:a 192k -shortest -movflags +faststart "$OUT/seat-14c-demo.mp4"
echo "wrote $OUT/seat-14c-demo.mp4"
