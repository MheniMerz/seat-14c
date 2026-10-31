#!/usr/bin/env bash
# Seat calibration: timeout to default height, calibrate from resting hands,
# and Raise / Lower by look + pinch.
set -euo pipefail
cd "$(dirname "$0")/.."

cli() { npx @iwsdk/cli "$@" 2>&1; }
xr() { cli xr "$1" --input-json "$2" >/dev/null; }
state() {
  cli browser run tests/state.mjs | python3 -c "
import json,sys
r=json.loads(json.load(sys.stdin)['data']['result'])
print(r['phase'], r['calibration']['result'], r['tray']['drop'])"
}
check() { if [[ "$2" == $3 ]]; then echo "PASS $1 ($2)"; else echo "FAIL $1 (got $2, want $3)"; fi; }

# The emulator's default hands sit only 10 cm below the eyes, which never
# counts as resting, so each case boards first and then places the hands.
# Hands go in place straight after boarding: calibration only waits 5 s.
board() {
  cli browser run tests/board-only.mjs >/dev/null
  xr set-transform "{\"device\":\"hand-left\",\"position\":{\"x\":-0.2,\"y\":$1,\"z\":-0.35}}"
  xr set-transform "{\"device\":\"hand-right\",\"position\":{\"x\":0.2,\"y\":$1,\"z\":-0.35}}"
  xr set-input-mode '{"mode":"hand"}'
  xr set-connected '{"device":"gaze","connected":true}'
  xr look-at '{"device":"gaze","target":{"x":0,"y":2.5,"z":-1}}'
}

# 1. Hands raised near eye height never count: times out to the default.
board 1.52
sleep 5
check "times out to default height" "$(state)" "preflight timeout 0.22"

# 2. Hands resting low and still: tray moves just above them.
board 1.3
sleep 1
check "calibrates from resting hands" "$(state)" "preflight hands 0.2*"

# 3. Hands that never settle do not calibrate; the timeout wins.
board 1.52
xr set-transform '{"device":"hand-left","position":{"x":-0.2,"y":1.3,"z":-0.35}}'
xr animate-to '{"device":"hand-right","position":{"x":0.2,"y":1.1,"z":-0.35},"duration":7}' &
sleep 6
check "moving hands never calibrate" "$(state)" "preflight timeout *"
wait

# 4. Raise and Lower by look + pinch.
before=$(state | awk '{print $3}')
# Hands off the tray: a hovering hand switches gaze off.
xr set-transform '{"device":"hand-left","position":{"x":-0.3,"y":1.0,"z":0}}'
xr set-transform '{"device":"hand-right","position":{"x":0.3,"y":1.0,"z":0}}'
pos=$(cli browser run tests/positions.mjs | python3 -c "import json,sys;print(json.dumps(json.loads(json.load(sys.stdin)['data']['result'])['tray-raise']))")
xr look-at "{\"device\":\"gaze\",\"target\":$pos}"
sleep 0.4
xr select '{"device":"hand-right","duration":0.2}'
sleep 0.3
after=$(state | awk '{print $3}')
check "Raise lifts the tray 3 cm" "$(python3 -c "print(round($before-$after,3))")" "0.03"

# 5. Poke Lower directly with the right index finger (no gaze). The emulator
# places the hand by its wrist, so measure the fingertip offset first.
xr look-at '{"device":"gaze","target":{"x":0,"y":2.5,"z":-1}}'
before=$after
xr set-transform '{"device":"hand-right","position":{"x":0.3,"y":1.0,"z":0},"orientation":{"pitch":-80,"yaw":0,"roll":0}}'
sleep 0.3
tip=$(cli browser run tests/fingertip.mjs | python3 -c "import json,sys;print(json.load(sys.stdin)['data']['result'])")
lower=$(cli browser run tests/positions.mjs | python3 -c "import json,sys;print(json.dumps(json.loads(json.load(sys.stdin)['data']['result'])['tray-lower']))")
hand_at() {
  python3 -c "
import json,sys
tip=json.loads(sys.argv[1])['tip']; b=json.loads(sys.argv[2]); up=float(sys.argv[3])
off=[tip[0]-0.3, tip[1]-1.0, tip[2]-0.0]
print(json.dumps({'x':b['x']-off[0],'y':b['y']+up-off[1],'z':b['z']-off[2]}))" "$tip" "$lower" "$1"
}
xr set-transform "{\"device\":\"hand-right\",\"position\":$(hand_at 0.08)}"
sleep 0.3
xr animate-to "{\"device\":\"hand-right\",\"position\":$(hand_at 0.0),\"duration\":0.4}"
sleep 0.6
xr animate-to "{\"device\":\"hand-right\",\"position\":$(hand_at 0.08),\"duration\":0.3}"
sleep 0.5
after=$(state | awk '{print $3}')
check "poking Lower drops the tray 3 cm" "$(python3 -c "print(round($after-$before,3))")" "0.03"
