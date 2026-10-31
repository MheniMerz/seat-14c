#!/usr/bin/env bash
# Gaze at the centre of each preflight target and report what is hovered:
# neighbouring hit areas must not steal gaze.
set -euo pipefail
cd "$(dirname "$0")/.."
cli() { npx @iwsdk/cli "$@" 2>&1; }
xr() { cli xr "$1" --input-json "$2" >/dev/null; }
cli xr exit >/dev/null || true
sleep 1
cli browser run tests/board.mjs >/dev/null
xr set-input-mode '{"mode":"hand"}'
xr set-connected '{"device":"gaze","connected":true}'
xr set-transform '{"device":"hand-left","position":{"x":-0.3,"y":1.0,"z":0}}'
xr set-transform '{"device":"hand-right","position":{"x":0.3,"y":1.0,"z":0}}'
POS=$(cli browser run tests/positions.mjs | python3 -c "import json,sys;print(json.load(sys.stdin)['data']['result'])")
# The Done stack is only interactive on landing, so it is not listed here.
for target in card-1 card-2 card-3 dial tray-raise tray-lower; do
  p=$(python3 -c "import json,sys;print(json.dumps(json.loads(sys.argv[1])[sys.argv[2]]))" "$POS" "$target")
  xr look-at "{\"device\":\"gaze\",\"target\":$p}"
  sleep 0.4
  hovered=$(cli ecs find --input-json '{"withComponents":["Hovered"]}' | python3 -c "import json,sys;print(','.join(e['name'] for e in json.load(sys.stdin)['data']['result']['entities']))")
  want=$target
  if [ "$hovered" = "$want" ]; then echo "PASS gaze on $target"; else echo "FAIL gaze on $target (hovered: $hovered)"; fi
done
