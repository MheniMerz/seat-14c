#!/usr/bin/env bash
# Real emulated input for the dial and Take off: pinch-and-twist the knob,
# look + pinch the dial, choose a card, look + pinch Take off.
set -euo pipefail
cd "$(dirname "$0")/.."

cli() { npx @iwsdk/cli "$@" 2>&1; }
xr() { cli xr "$1" --input-json "$2" >/dev/null; }
state() {
  cli browser run tests/state.mjs | python3 -c "
import json,sys
r=json.loads(json.load(sys.stdin)['data']['result'])
print(r['phase'], r['plan']['minutes'], r['plan']['taskId'])"
}
check() { if [ "$2" = "$3" ]; then echo "PASS $1 ($2)"; else echo "FAIL $1 (got $2, want $3)"; fi; }

cli browser run tests/board.mjs >/dev/null
xr set-input-mode '{"mode":"hand"}'
xr set-connected '{"device":"gaze","connected":true}'
xr look-at '{"device":"gaze","target":{"x":0,"y":2.5,"z":-1}}'

# Pinch the knob and twist the wrist 25 degrees clockwise (seen from above).
xr set-transform '{"device":"hand-right","position":{"x":0.155,"y":1.425,"z":-0.485},"orientation":{"pitch":0,"yaw":0,"roll":0}}'
sleep 0.3
xr set-select-value '{"device":"hand-right","value":1}'
sleep 0.3
xr animate-to '{"device":"hand-right","orientation":{"pitch":0,"yaw":-25,"roll":0},"duration":0.5}'
sleep 0.7
xr set-select-value '{"device":"hand-right","value":0}'
sleep 0.5
check "pinch + twist sets 25 min" "$(state)" "preflight 25 None"
xr set-transform '{"device":"hand-right","position":{"x":0.25,"y":1.2,"z":-0.2}}'

# Look at the dial and pinch: steps to 45.
xr look-at '{"device":"gaze","target":{"x":0.155,"y":1.42,"z":-0.485}}'
sleep 0.4
xr select '{"device":"hand-right","duration":0.2}'
sleep 0.4
check "look + pinch on dial steps to 45" "$(state)" "preflight 45 None"

# Choose card 1 by look + pinch, then look + pinch Take off.
xr look-at '{"device":"gaze","target":{"x":-0.14,"y":1.368,"z":-0.355}}'
sleep 0.4
xr select '{"device":"hand-right","duration":0.2}'
sleep 0.6
xr look-at '{"device":"gaze","target":{"x":0,"y":1.372,"z":-0.355}}'
sleep 0.4
xr select '{"device":"hand-right","duration":0.2}'
sleep 0.4
check "look + pinch Take off starts cruise" "$(state)" "cruise 45 t-1"
