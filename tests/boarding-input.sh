#!/usr/bin/env bash
# First-launch boarding pass: tear the stub, pocket the pass, twist the dial.
# Run 1 uses hand gestures, run 2 uses look + pinch only. Then a second
# boarding skips the tutorial.
set -euo pipefail
shopt -s extglob
cd "$(dirname "$0")/.."

cli() { npx @iwsdk/cli "$@" 2>&1; }
xr() { cli xr "$1" --input-json "$2" >/dev/null; }
run() { cli browser run "tests/$1" | python3 -c "import json,sys;print(json.load(sys.stdin)['data']['result'])"; }
at() { python3 -c "import json,sys;print(json.dumps(json.loads(sys.argv[1])[sys.argv[2]]))" "$POS" "$1"; }
offset() { python3 -c "import json,sys;p=json.loads(sys.argv[1]);p['x']+=float(sys.argv[2]);p['y']+=float(sys.argv[3]);p['z']+=float(sys.argv[4]);print(json.dumps(p))" "$1" "$2" "$3" "$4"; }
check() { if [[ "$2" == $3 ]]; then echo "PASS $1 ($2)"; else echo "FAIL $1 (got $2, want $3)"; fi; }
look_pinch() {
  xr look-at "{\"device\":\"gaze\",\"target\":$(at "$1")}"
  sleep 0.4
  xr select '{"device":"hand-right","duration":0.2}'
  sleep 0.6
}
away() {
  xr look-at '{"device":"gaze","target":{"x":0,"y":2.5,"z":-1}}'
  xr set-transform '{"device":"hand-right","position":{"x":0.3,"y":1.0,"z":0},"orientation":{"pitch":0,"yaw":0,"roll":0}}'
}
first_board() {
  cli xr exit >/dev/null || true
  sleep 1
  run board-first.mjs >/dev/null
  xr set-input-mode '{"mode":"hand"}'
  xr set-connected '{"device":"gaze","connected":true}'
  xr set-transform '{"device":"hand-left","position":{"x":-0.3,"y":1.4,"z":-0.1}}'
  away
  sleep 5.5
}
twist_dial() {
  xr set-transform "{\"device\":\"hand-right\",\"position\":$(at dial-knob),\"orientation\":{\"pitch\":0,\"yaw\":0,\"roll\":0}}"
  sleep 0.3
  xr set-select-value '{"device":"hand-right","value":1}'
  sleep 0.3
  xr animate-to '{"device":"hand-right","orientation":{"pitch":0,"yaw":-25,"roll":0},"duration":0.5}'
  sleep 0.7
  xr set-select-value '{"device":"hand-right","value":0}'
  sleep 0.3
  away
}

# The grab point sits a few cm from where the emulator places the hand, so
# aim the hand's grip at the target.
grip_at() {
  python3 -c "
import json,sys
g=json.loads(sys.argv[1])['grip']; t=json.loads(sys.argv[2])
print(json.dumps({'x':t['x']-(g[0]-0.3),'y':t['y']-(g[1]-1.0),'z':t['z']-(g[2]-0.0)}))" "$GRIP" "$1"
}

# Run 1: hand gestures.
first_board
GRIP=$(run fingertip.mjs)
check "first launch goes to the tutorial" "$(run boarding-state.mjs)" "boarding stub false"
POS=$(run positions.mjs)
xr set-transform "{\"device\":\"hand-right\",\"position\":$(grip_at "$(at boarding-stub-body)")}"
sleep 0.3
xr set-select-value '{"device":"hand-right","value":1}'
sleep 0.3
xr animate-to "{\"device\":\"hand-right\",\"position\":$(grip_at "$(offset "$(at boarding-stub-body)" 0.06 0.02 0)"),\"duration\":0.4}"
sleep 0.6
xr set-select-value '{"device":"hand-right","value":0}'
sleep 0.4
away
check "pinch and pull tears the stub" "$(run boarding-state.mjs)" "boarding pocket false"

POS=$(run positions.mjs)
xr set-transform "{\"device\":\"hand-right\",\"position\":$(grip_at "$(at boarding-pass-body)")}"
sleep 0.3
xr set-select-value '{"device":"hand-right","value":1}'
sleep 0.3
xr animate-to "{\"device\":\"hand-right\",\"position\":$(grip_at "$(offset "$(at seat-pocket)" 0 0.04 0)"),\"duration\":0.6}"
sleep 0.9
xr set-select-value '{"device":"hand-right","value":0}'
sleep 0.4
away
check "dropping the pass in the pocket" "$(run boarding-state.mjs)" "boarding dial false"

twist_dial
check "twisting the dial finishes the tutorial" "$(run boarding-state.mjs)" "@(boarding done*|preflight done true)"
sleep 1.5
check "tutorial hands over to preflight, saved" "$(run boarding-state.mjs)" "preflight done true"
check "dial setting carries over" "$(python3 -c "import json,sys;print(json.loads(sys.argv[1])['plan']['minutes'])" "$(run state.mjs)")" "25"

# Run 2: look + pinch only.
first_board
POS=$(run positions.mjs)
look_pinch boarding-stub
check "look + pinch tears the stub" "$(run boarding-state.mjs)" "boarding pocket false"
look_pinch boarding-pass
check "look + pinch pockets the pass" "$(run boarding-state.mjs)" "boarding dial false"
look_pinch dial
sleep 1.5
check "look + pinch on dial finishes" "$(run boarding-state.mjs)" "preflight done true"

# A second boarding skips the tutorial.
cli xr exit >/dev/null
sleep 1
cli browser interact --input-json '{"steps":[{"action":"click","locator":{"role":"button","name":"Board"}}]}' >/dev/null
sleep 1
xr set-input-mode '{"mode":"hand"}'
away
sleep 5.5
check "returning user skips the tutorial" "$(run boarding-state.mjs)" "preflight done true"
