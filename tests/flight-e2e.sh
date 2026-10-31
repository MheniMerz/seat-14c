#!/usr/bin/env bash
# One full flight with real emulated input: check-in, Board, calibration
# timeout, gaze + pinch a card, twist the dial to 5 min, gaze + pinch Take
# off, land, grab the card onto Done, Fly again, Finish. The only dev shortcut
# is a 120x flight clock.
set -euo pipefail
shopt -s extglob
cd "$(dirname "$0")/.."

cli() { npx @iwsdk/cli "$@" 2>&1; }
xr() { cli xr "$1" --input-json "$2" >/dev/null; }
run() { cli browser run "tests/$1" | python3 -c "import json,sys;print(json.load(sys.stdin)['data']['result'])"; }
field() { python3 -c "import json,sys;d=json.loads(sys.argv[1]);print(eval(sys.argv[2], {}, d))" "$1" "$2"; }
at() { python3 -c "import json,sys;print(json.dumps(json.loads(sys.argv[1])[sys.argv[2]]))" "$POS" "$1"; }
look_pinch() {
  xr look-at "{\"device\":\"gaze\",\"target\":$(at "$1")}"
  sleep 0.4
  xr select '{"device":"hand-right","duration":0.2}'
  sleep 0.5
}
check() { if [[ "$2" == $3 ]]; then echo "PASS $1 ($2)"; else echo "FAIL $1 (got $2, want $3)"; fi; }
phase() { field "$(run state.mjs)" "phase"; }

cli xr exit >/dev/null || true
sleep 1
echo "check-in: $(run checkin-fill.mjs)"
cli browser interact --input-json '{"steps":[{"action":"click","locator":{"role":"button","name":"Board"}}]}' >/dev/null
sleep 1
xr set-input-mode '{"mode":"hand"}'
xr set-connected '{"device":"gaze","connected":true}'
xr look-at '{"device":"gaze","target":{"x":0,"y":2.5,"z":-1}}'
# Hands left resting from an earlier run calibrate within a second, so the
# flight may already be past calibration here.
check "Board enters the cabin" "$(phase)" "@(calibrating|preflight)"
sleep 6
check "calibration ends in preflight" "$(phase)" "preflight"

POS=$(run positions.mjs)
look_pinch card-1
xr set-transform "{\"device\":\"hand-right\",\"position\":$(at dial-knob),\"orientation\":{\"pitch\":0,\"yaw\":0,\"roll\":0}}"
sleep 0.3
xr set-select-value '{"device":"hand-right","value":1}'
sleep 0.3
xr animate-to '{"device":"hand-right","orientation":{"pitch":0,"yaw":60,"roll":0},"duration":0.5}'
sleep 0.7
xr set-select-value '{"device":"hand-right","value":0}'
xr set-transform '{"device":"hand-right","position":{"x":0.3,"y":1.0,"z":0}}'
sleep 0.5
check "card chosen, dial at 5 min" "$(field "$(run state.mjs)" "f\"{plan['taskId'] is not None} {plan['minutes']}\"")" "True 5"

POS=$(run positions.mjs)
look_pinch takeoff-button
check "Take off starts cruise" "$(phase)" "cruise"
run fast-clock.mjs >/dev/null
sleep 3.5
check "lands when the clock runs out" "$(phase)" "landing"

# Grab the card off the Now stand and drop it on the Done stack.
POS=$(run positions.mjs)
xr look-at '{"device":"gaze","target":{"x":0,"y":2.5,"z":-1}}'
xr set-transform "{\"device\":\"hand-right\",\"position\":$(at card-1)}"
sleep 0.3
xr set-select-value '{"device":"hand-right","value":1}'
sleep 0.3
xr animate-to "{\"device\":\"hand-right\",\"position\":$(at done-stack),\"duration\":0.6}"
sleep 0.9
xr set-select-value '{"device":"hand-right","value":0}'
xr set-transform '{"device":"hand-right","position":{"x":0.3,"y":1.0,"z":0}}'
sleep 0.6
STATE=$(run state.mjs)
check "card dropped on Done -> summary" "$(field "$STATE" "phase")" "winddown"
check "card rests on Done stack" "$(field "$STATE" "cards[0]['place']")" "done"

POS=$(run positions.mjs)
look_pinch summary-again
check "Fly again returns to preflight" "$(phase)" "preflight"
check "one open task left on the tray" "$(field "$(run state.mjs)" "len(cards)")" "1"

# Land the second task early (dev), save it for later, then finish.
cli browser run tests/land-later.mjs >/dev/null
POS=$(run positions.mjs)
look_pinch summary-finish
sleep 1.5
CHECKIN=$(run checkin-state.mjs)
check "Finish exits to check-in" "$(field "$CHECKIN" "f\"{phase} {checkinVisible}\"")" "checkin True"
check "streak grew from yesterday" "$(field "$CHECKIN" "progress['streakDays']")" "3"
check "miles: 100 + 40 for 5 min" "$(field "$CHECKIN" "progress['totalMiles'] >= 140")" "True"
check "finished task saved as done" "$(field "$CHECKIN" "','.join(tasks)")" "Write Devpost description:done,Review flight dial design:open"
check "check-in shows only the open task" "$(field "$CHECKIN" "','.join(titles)")" "Review flight dial design"
check "stats line updated" "$(field "$CHECKIN" "stats")" "*miles flown · 3-day streak · next stop *"
