#!/usr/bin/env bash
# Cruise focus: steps reveal on looking at the card, tick by gaze + pinch and
# by poke, fade back after looking away; the cabin dims and comes back up.
set -euo pipefail
shopt -s extglob
cd "$(dirname "$0")/.."

cli() { npx @iwsdk/cli "$@" 2>&1; }
xr() { cli xr "$1" --input-json "$2" >/dev/null; }
run() { cli browser run "tests/$1" | python3 -c "import json,sys;print(json.load(sys.stdin)['data']['result'])"; }
field() { python3 -c "import json,sys;d=json.loads(sys.argv[1]);print(eval(sys.argv[2], {}, d))" "$1" "$2"; }
at() { python3 -c "import json,sys;print(json.dumps(json.loads(sys.argv[1])[sys.argv[2]]))" "$POS" "$1"; }
check() { if [[ "$2" == $3 ]]; then echo "PASS $1 ($2)"; else echo "FAIL $1 (got $2, want $3)"; fi; }
state() { run focus-state.mjs; }

cli xr exit >/dev/null || true
sleep 1
run board.mjs >/dev/null
xr set-input-mode '{"mode":"hand"}'
xr set-connected '{"device":"gaze","connected":true}'
xr set-transform '{"device":"hand-left","position":{"x":-0.3,"y":1.0,"z":0}}'
xr set-transform '{"device":"hand-right","position":{"x":0.3,"y":1.0,"z":0}}'
xr look-at '{"device":"gaze","target":{"x":0,"y":2.5,"z":-1}}'
run cruise-start.mjs >/dev/null
S=$(state)
check "three steps listed in cruise" "$(field "$S" "len(steps['steps'])")" "3"
check "steps start faded" "$(field "$S" "steps['opacity']")" "0.45"
sleep 2.5
S=$(state)
check "cabin fully dimmed" "$(field "$S" "f'{float(focus):.1f} {dome}'")" "1.0 0.45"

POS=$(run positions.mjs)
xr look-at "{\"device\":\"gaze\",\"target\":$(at card-1)}"
sleep 1.2
check "looking at the card reveals steps" "$(field "$(state)" "steps['opacity'] > 0.9")" "True"

FACE=$(run card-face.mjs)
xr look-at "{\"device\":\"gaze\",\"target\":$(at step-2)}"
sleep 0.4
xr select '{"device":"hand-right","duration":0.2}'
sleep 0.4
check "gaze + pinch ticks step 2, saved" "$(field "$(state)" "','.join(map(str, stored))")" "False,True,False"
check "card face repainted" "$([ "$(run card-face.mjs)" != "$FACE" ] && echo yes || echo no)" "yes"

# Poke step 1 with the right index fingertip.
xr look-at '{"device":"gaze","target":{"x":0,"y":2.5,"z":-1}}'
xr set-transform '{"device":"hand-right","position":{"x":0.3,"y":1.0,"z":0},"orientation":{"pitch":0,"yaw":0,"roll":0}}'
sleep 0.3
TIP=$(run fingertip.mjs)
POS=$(run positions.mjs)
hand_at() {
  python3 -c "
import json,sys
tip=json.loads(sys.argv[1])['tip']; b=json.loads(sys.argv[2])['step-1']; back=float(sys.argv[3])
off=[tip[0]-0.3, tip[1]-1.0, tip[2]-0.0]
print(json.dumps({'x':b['x']-off[0],'y':b['y']-off[1],'z':b['z']-off[2]+back}))" "$TIP" "$POS" "$1"
}
xr set-transform "{\"device\":\"hand-right\",\"position\":$(hand_at 0.08)}"
sleep 0.3
xr animate-to "{\"device\":\"hand-right\",\"position\":$(hand_at -0.005),\"duration\":0.4}"
sleep 0.6
xr animate-to "{\"device\":\"hand-right\",\"position\":$(hand_at 0.08),\"duration\":0.3}"
sleep 0.5
check "poke ticks step 1" "$(field "$(state)" "','.join(map(str, stored))")" "True,True,False"
xr set-transform '{"device":"hand-right","position":{"x":0.3,"y":1.0,"z":0}}'

sleep 5
check "steps fade back after looking away" "$(field "$(state)" "steps['opacity'] < 0.5")" "True"

run land-now.mjs >/dev/null
sleep 1.5
S=$(state)
check "landing brings the cabin lights up" "$(field "$S" "f'{phase} {float(focus):.1f} {dome}'")" "landing 0.0 0.00"
check "steps cleared after cruise" "$(field "$S" "len(steps['steps'])")" "0"
