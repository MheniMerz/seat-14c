#!/usr/bin/env bash
# Real emulated input for task cards: gaze + pinch, then direct pinch-grab.
# Needs the dev server running with --allow-browser-automation.
set -euo pipefail
cd "$(dirname "$0")/.."

cli() { npx @iwsdk/cli "$@" 2>&1; }
xr() { cli xr "$1" --input-json "$2" >/dev/null; }
places() {
  cli browser run tests/state.mjs | python3 -c "
import json,sys
r=json.loads(json.load(sys.stdin)['data']['result'])
print(','.join(c['place'] for c in r['cards']))"
}
check() { if [ "$2" = "$3" ]; then echo "PASS $1 ($2)"; else echo "FAIL $1 (got $2, want $3)"; fi; }

cli browser run tests/board.mjs >/dev/null
xr set-input-mode '{"mode":"hand"}'

# Gaze at card 3 on the tray, pinch with the right hand.
xr look-at '{"device":"gaze","target":{"x":0.14,"y":1.368,"z":-0.355}}'
sleep 0.4
xr select '{"device":"hand-right","duration":0.2}'
sleep 0.5
check "gaze + pinch chooses card 3" "$(places)" "pocket,pocket,now"

# Look away, pinch-grab card 1 out of the pocket, carry it to the Now stand.
xr look-at '{"device":"gaze","target":{"x":0,"y":2.5,"z":-1}}'
xr set-transform '{"device":"hand-right","position":{"x":-0.15,"y":1.47,"z":-0.56}}'
sleep 0.3
xr set-select-value '{"device":"hand-right","value":1}'
sleep 0.3
xr animate-to '{"device":"hand-right","position":{"x":0,"y":1.46,"z":-0.47},"duration":0.5}'
sleep 0.8
xr set-select-value '{"device":"hand-right","value":0}'
sleep 0.8
check "grab card 1 onto stand swaps it in" "$(places)" "now,pocket,pocket"
