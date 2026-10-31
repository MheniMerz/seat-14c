#!/usr/bin/env bash
# Every look + pinch action with gaze disconnected, as on a Quest without eye
# tracking: hand rays aim, pinch selects. Also checks the sound feedback.
set -euo pipefail
shopt -s extglob
cd "$(dirname "$0")/.."

cli() { npx @iwsdk/cli "$@" 2>&1; }
xr() { cli xr "$1" --input-json "$2" >/dev/null; }
run() { cli browser run "tests/$1" | python3 -c "import json,sys;print(json.load(sys.stdin)['data']['result'])"; }
field() { python3 -c "import json,sys;d=json.loads(sys.argv[1]);print(eval(sys.argv[2], {}, d))" "$1" "$2"; }
at() { python3 -c "import json,sys;print(json.dumps(json.loads(sys.argv[1])[sys.argv[2]]))" "$POS" "$1"; }
ray_pinch() {
  xr look-at "{\"device\":\"hand-right\",\"target\":$(at "$1")}"
  sleep 0.3
  xr select '{"device":"hand-right","duration":0.2}'
  sleep 0.5
}
check() { if [[ "$2" == $3 ]]; then echo "PASS $1 ($2)"; else echo "FAIL $1 (got $2, want $3)"; fi; }
phase() { field "$(run state.mjs)" "phase"; }

cli xr exit >/dev/null || true
sleep 1
run board.mjs >/dev/null
xr set-input-mode '{"mode":"hand"}'
xr set-connected '{"device":"gaze","connected":false}'
xr set-transform '{"device":"hand-left","position":{"x":-0.3,"y":1.1,"z":-0.1}}'
xr set-transform '{"device":"hand-right","position":{"x":0.2,"y":1.25,"z":-0.15}}'
run sounds.mjs >/dev/null

POS=$(run positions.mjs)
ray_pinch card-2
check "hand ray chooses card 2" "$(field "$(run state.mjs)" "plan['taskId']")" "t-2"
ray_pinch dial
check "hand ray steps the dial" "$(field "$(run state.mjs)" "plan['minutes']")" "5"
ray_pinch tray-raise
check "hand ray presses Raise" "$(field "$(run state.mjs)" "tray['drop']")" "0.19"
POS=$(run positions.mjs)
ray_pinch takeoff-button
check "hand ray presses Take off" "$(phase)" "cruise"
check "click, slot, detent and engine sounds" "$(run sounds.mjs)" "*click*slot*detent*click*click*takeoff*"
run fast-clock.mjs >/dev/null
sleep 3.5
check "landing: engines down, seat-belt chime" "$(run sounds.mjs)" "@(*engines-down*seatbeltChime*|*seatbeltChime*engines-down*)"
POS=$(run positions.mjs)
ray_pinch done-stack
check "hand ray on Done stack finishes" "$(field "$(run state.mjs)" "f\"{phase} {cards[1]['place']}\"")" "winddown done"
POS=$(run positions.mjs)
ray_pinch summary-again
check "hand ray presses Fly again" "$(phase)" "preflight"

POS=$(run positions.mjs)
ray_pinch card-1
ray_pinch dial
ray_pinch takeoff-button
run fast-clock.mjs >/dev/null
sleep 3.5
POS=$(run positions.mjs)
ray_pinch landing-later
check "hand ray presses Not yet" "$(field "$(run state.mjs)" "f\"{phase} {cards[0]['place']}\"")" "winddown pocket"
POS=$(run positions.mjs)
ray_pinch summary-finish
# Leaving XR can take a moment; wait up to 5 s for the check-in page.
for _ in 1 2 3 4 5; do
  [ "$(field "$(run checkin-state.mjs)" "phase")" = checkin ] && break
  sleep 1
done
check "hand ray presses Finish" "$(field "$(run checkin-state.mjs)" "f\"{phase} {checkinVisible}\"")" "checkin True"
