#!/usr/bin/env bash
# Wrist menu: in cruise, turning the left palm up opens a small menu above
# it. Look + pinch Pause stops the focus clock; again (Resume) restarts it. The menu
# folds away after the palm turns down. Poking Land now ends the flight.
set -euo pipefail
shopt -s extglob
cd "$(dirname "$0")/.."

cli() { npx @iwsdk/cli "$@" 2>&1; }
xr() { cli xr "$1" --input-json "$2" >/dev/null; }
run() { cli browser run "tests/$1" | python3 -c "import json,sys;print(json.load(sys.stdin)['data']['result'])"; }
field() { python3 -c "import json,sys;d=json.loads(sys.argv[1]);print(eval(sys.argv[2], {}, d))" "$1" "$2"; }
at() { python3 -c "import json,sys;print(json.dumps(json.loads(sys.argv[1])[sys.argv[2]]))" "$POS" "$1"; }
check() { if [[ "$2" == $3 ]]; then echo "PASS $1 ($2)"; else echo "FAIL $1 (got $2, want $3)"; fi; }
look_pinch() {
  xr look-at "{\"device\":\"gaze\",\"target\":$(at "$1")}"
  sleep 0.7
  xr select '{"device":"hand-right","duration":0.2}'
  sleep 0.5
}
wrist() { run wrist-state.mjs; }
PALM_DOWN='{"pitch":0,"yaw":0,"roll":0}'
PALM_UP='{"pitch":0,"yaw":0,"roll":180}'

cli xr exit >/dev/null || true
sleep 1
run board.mjs >/dev/null
xr set-input-mode '{"mode":"hand"}'
xr set-connected '{"device":"gaze","connected":true}'
xr look-at '{"device":"gaze","target":{"x":0,"y":2.5,"z":-1}}'
xr set-transform '{"device":"hand-right","position":{"x":0.3,"y":1.0,"z":0}}'
xr set-transform "{\"device\":\"hand-left\",\"position\":{\"x\":-0.18,\"y\":1.3,\"z\":-0.3},\"orientation\":$PALM_DOWN}"
run cruise-start.mjs >/dev/null
sleep 0.8
check "palm down: no menu" "$(field "$(wrist)" "openOn")" "None"
xr set-transform "{\"device\":\"hand-left\",\"orientation\":$PALM_UP}"
sleep 0.8
W=$(wrist)
check "palm up opens the menu on that wrist" "$(field "$W" "openOn")" "left"
check "Pause and Land now offered" "$(field "$W" "' '.join(b['name'] for b in buttons if b['interactable'])")" "wrist-pause wrist-land"

POS=$(run positions.mjs)
look_pinch wrist-pause
A=$(wrist)
sleep 2
B=$(wrist)
check "look + pinch Pause stops the clock" "$(field "$A" "paused") $(field "$B" "elapsed - $(field "$A" "elapsed") < 0.05")" "True True"
POS=$(run positions.mjs)
look_pinch wrist-pause
sleep 1.5
C=$(wrist)
check "Resume starts it again" "$(field "$C" "paused") $(field "$C" "elapsed > $(field "$B" "elapsed")")" "False True"

xr look-at '{"device":"gaze","target":{"x":0,"y":2.5,"z":-1}}'
xr set-transform "{\"device\":\"hand-left\",\"orientation\":$PALM_DOWN}"
sleep 3.5
check "menu folds away after the palm turns down" "$(field "$(wrist)" "openOn")" "None"

# Poke Land now with the right index fingertip.
xr set-transform "{\"device\":\"hand-left\",\"orientation\":$PALM_UP}"
sleep 0.8
xr set-transform '{"device":"hand-right","position":{"x":0.3,"y":1.0,"z":0},"orientation":{"pitch":0,"yaw":0,"roll":0}}'
sleep 0.3
TIP=$(run fingertip.mjs)
POS=$(run positions.mjs)
hand_at() {
  python3 -c "
import json,sys
tip=json.loads(sys.argv[1])['tip']; b=json.loads(sys.argv[2])['wrist-land']; back=float(sys.argv[3])
off=[tip[0]-0.3, tip[1]-1.0, tip[2]-0.0]
print(json.dumps({'x':b['x']-off[0],'y':b['y']-off[1],'z':b['z']+back-off[2]}))" "$TIP" "$POS" "$1"
}
xr set-transform "{\"device\":\"hand-right\",\"position\":$(hand_at 0.08)}"
sleep 0.3
xr animate-to "{\"device\":\"hand-right\",\"position\":$(hand_at -0.005),\"duration\":0.4}"
sleep 0.6
xr set-transform '{"device":"hand-right","position":{"x":0.3,"y":1.0,"z":0}}'
sleep 0.5
check "poking Land now starts landing" "$(field "$(wrist)" "f\"{phase} {openOn}\"")" "landing None"
