#!/usr/bin/env bash
# Breathing wind-down: it follows landing, the ring swells on the in-breath
# and shrinks on the out-breath, Skip works by poke and by look + pinch, and
# the summary follows by itself after the minute.
set -euo pipefail
shopt -s extglob
cd "$(dirname "$0")/.."

cli() { npx @iwsdk/cli "$@" 2>&1; }
xr() { cli xr "$1" --input-json "$2" >/dev/null; }
run() { cli browser run "tests/$1" | python3 -c "import json,sys;print(json.load(sys.stdin)['data']['result'])"; }
field() { python3 -c "import json,sys;d=json.loads(sys.argv[1]);print(eval(sys.argv[2], {}, d))" "$1" "$2"; }
at() { python3 -c "import json,sys;print(json.dumps(json.loads(sys.argv[1])[sys.argv[2]]))" "$POS" "$1"; }
check() { if [[ "$2" == $3 ]]; then echo "PASS $1 ($2)"; else echo "FAIL $1 (got $2, want $3)"; fi; }
wd() { run wind-down-state.mjs; }

cli xr exit >/dev/null || true
sleep 1
run board.mjs >/dev/null
xr set-input-mode '{"mode":"hand"}'
xr set-connected '{"device":"gaze","connected":true}'
xr set-transform '{"device":"hand-left","position":{"x":-0.3,"y":1.0,"z":0}}'
xr set-transform '{"device":"hand-right","position":{"x":0.3,"y":1.0,"z":0}}'
xr look-at '{"device":"gaze","target":{"x":0,"y":2.5,"z":-1}}'

# 1. Landing leads into the breathing guide, not the summary.
run land-later.mjs >/dev/null
S=$(wd)
check "wind-down starts with breathing" "$(field "$S" "f\"{step} {panelVisible} {summaryVisible}\"")" "breathe True False"
SAMPLES=$(run wind-down-sample.mjs)
breath() { python3 -c "
import json,sys
s=json.loads(sys.argv[1])
ins=[x for x in s if x[1] and x[0] < 4]; outs=[x for x in s if not x[1] and x[0] < 10]
grow=all(b[2] >= a[2] for a, b in zip(ins, ins[1:]))
shrink=all(b[2] <= a[2] for a, b in zip(outs, outs[1:]))
cycle=all(x[1] == ((x[0] % 10) < 4) for x in s) and len(ins) > 3 and len(outs) > 5
print(sys.argv[2].format(cycle=cycle, ins=len(ins), outs=len(outs), grow=grow, shrink=shrink,
  peak=round(max(x[2] for x in s), 2), low=round(min(x[2] for x in outs), 2)))" "$SAMPLES" "$1"; }
check "4 s in, then 6 s out" "$(breath '{cycle}')" "True"
check "ring grows on the in-breath" "$(breath '{grow} {peak}')" "True @(0.9*|1.0)"
check "and shrinks on the out-breath" "$(breath '{shrink} {low}')" "True 0.@(4|5)*"

# 2. Poke Skip with the right index finger, moving away from the user. The
# emulator places the hand by its wrist, so measure the fingertip offset.
xr set-transform '{"device":"hand-right","position":{"x":0.3,"y":1.0,"z":0},"orientation":{"pitch":0,"yaw":0,"roll":0}}'
sleep 0.3
TIP=$(run fingertip.mjs)
POS=$(run positions.mjs)
hand_at() {
  python3 -c "
import json,sys
tip=json.loads(sys.argv[1])['tip']; b=json.loads(sys.argv[2])['wind-down-skip']; back=float(sys.argv[3])
off=[tip[0]-0.3, tip[1]-1.0, tip[2]-0.0]
print(json.dumps({'x':b['x']-off[0],'y':b['y']-off[1],'z':b['z']+back-off[2]}))" "$TIP" "$POS" "$1"
}
xr set-transform "{\"device\":\"hand-right\",\"position\":$(hand_at 0.08)}"
sleep 0.3
xr animate-to "{\"device\":\"hand-right\",\"position\":$(hand_at -0.005),\"duration\":0.4}"
sleep 0.6
xr animate-to "{\"device\":\"hand-right\",\"position\":$(hand_at 0.08),\"duration\":0.3}"
sleep 0.5
xr set-transform '{"device":"hand-right","position":{"x":0.3,"y":1.0,"z":0}}'
sleep 0.3
check "poke Skip shows the summary" "$(field "$(wd)" "f\"{step} {panelVisible} {summaryVisible}\"")" "summary False True"

# 3. Second flight: let the minute run out (jumped to its last half second).
cli browser run tests/land-later-again.mjs >/dev/null
check "next landing breathes again" "$(field "$(wd)" "step")" "breathe"
cli browser run tests/wind-down-near-end.mjs >/dev/null
sleep 1
check "summary follows after the minute" "$(field "$(wd)" "f\"{step} {summaryVisible}\"")" "summary True"
