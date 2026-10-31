#!/usr/bin/env bash
# Rough capture of one flight: five key moments into docs/greybox-flight.png.
set -euo pipefail
cd "$(dirname "$0")/.."
OUT=$(mktemp -d)
cli() { npx @iwsdk/cli "$@" >/dev/null 2>&1; }
shot() {
  cli xr look-at --input-json "{\"device\":\"headset\",\"target\":$2}"
  sleep 0.4
  cli browser screenshot --output-file "$OUT/cap-$1.png"
}
cli xr exit || true
sleep 1
cli browser run tests/board.mjs
cli xr set-input-mode --input-json '{"mode":"hand"}'
cli xr set-transform --input-json '{"device":"hand-left","position":{"x":-0.3,"y":1.0,"z":0}}'
cli xr set-transform --input-json '{"device":"hand-right","position":{"x":0.3,"y":1.0,"z":0}}'
cli xr look-at --input-json '{"device":"gaze","target":{"x":0,"y":2.5,"z":-1}}'
T='{"x":0.03,"y":1.42,"z":-0.45}'
shot 1-preflight "$T"
cli browser run tests/capture-step.mjs; shot 2-ready "$T"
cli browser run tests/capture-step.mjs; shot 3-cruise "$T"
cli browser run tests/capture-step.mjs; shot 4-landing '{"x":0,"y":1.5,"z":-0.5}'
cli browser run tests/capture-step.mjs; shot 5-summary '{"x":0,"y":1.56,"z":-0.55}'
mkdir -p docs
python3 - "$OUT" <<'PY'
import sys
from PIL import Image, ImageDraw, ImageFont
src = sys.argv[1]
shots = [('1-preflight', '1. Preflight: three task cards'),
         ('2-ready', '2. Card on Now stand, dial at 25 min'),
         ('3-cruise', '3. Cruise: progress line, time to go'),
         ('4-landing', '4. Landing: drop on Done or Not yet'),
         ('5-summary', '5. Summary card')]
tiles = []
for name, _ in shots:
    im = Image.open(f'{src}/cap-{name}.png').convert('RGB')
    w, h = im.size
    im = im.crop((int(w * 0.22), int(h * 0.18), int(w * 0.78), int(h * 0.98)))
    tiles.append(im.resize((480, int(480 * im.height / im.width))))
tw, th = tiles[0].size
pad = 40
sheet = Image.new('RGB', (tw * 3 + 20, (th + pad) * 2 + 10), (20, 24, 42))
try:
    font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 18)
except OSError:
    font = ImageFont.load_default()
draw = ImageDraw.Draw(sheet)
for i, (tile, (_, label)) in enumerate(zip(tiles, shots)):
    x, y = (i % 3) * (tw + 10), (i // 3) * (th + pad)
    draw.text((x + 8, y + 10), label, fill=(238, 241, 251), font=font)
    sheet.paste(tile, (x, y + pad - 4))
sheet.save('docs/greybox-flight.png')
PY
echo "wrote docs/greybox-flight.png"
