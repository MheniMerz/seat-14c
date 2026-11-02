#!/usr/bin/env bash
# Accessibility: settings chosen on the check-in page reach the cabin. With
# Look only on, a whole flight runs on gaze alone (no pinch anywhere): dwell
# chooses a card, steps the dial once per look, takes off, parks a thought,
# finishes on the Done stack, skips the wind-down and finishes. One hand
# calibrates with a single resting hand; large text panels still fit the
# glasses' view; high contrast and reduced motion apply.
set -euo pipefail
shopt -s extglob
cd "$(dirname "$0")/.."

cli() { npx @iwsdk/cli "$@" 2>&1; }
xr() { cli xr "$1" --input-json "$2" >/dev/null; }
run() { cli browser run "tests/$1" | python3 -c "import json,sys;print(json.load(sys.stdin)['data']['result'])"; }
field() { python3 -c "import json,sys;d=json.loads(sys.argv[1]);print(eval(sys.argv[2], {}, d))" "$1" "$2"; }
at() { python3 -c "import json,sys;print(json.dumps(json.loads(sys.argv[1])[sys.argv[2]]))" "$POS" "$1"; }
check() { if [[ "$2" == $3 ]]; then echo "PASS $1 ($2)"; else echo "FAIL $1 (got $2, want $3)"; fi; }
away() { xr look-at '{"device":"gaze","target":{"x":0,"y":2.5,"z":-1}}'; }
# Look at a target and rest there: no select is ever sent in this suite.
dwell() { xr look-at "{\"device\":\"gaze\",\"target\":$(at "$1")}"; sleep "${2:-1.6}"; }
state() { run state.mjs; }

cli xr exit >/dev/null || true
sleep 1
B=$(run a11y-board.mjs)
check "check-in saves the settings" "$(field "$B" "f\"{saved['gazeOnly']} {saved['oneHand']} {saved['highContrast']} {saved['reduceMotion']} {saved['textSize']}\"")" "True True True True L"
check "cabin applies them" "$(field "$B" "f\"{applied['ink']['panel']} {applied['cabin']['textScale']} {applied['cabin']['reducedMotion']} {applied['cabin']['focusDim']}\"")" "#000000 1.3 True 0.7"
xr set-input-mode '{"mode":"hand"}'
xr set-connected '{"device":"gaze","connected":true}'
away
# One hand: only the right hand rests below the eyes; the left is raised.
# Calibration restarts once they are placed (CLI moves take a while).
xr set-transform '{"device":"hand-left","position":{"x":-0.3,"y":1.75,"z":-0.2}}'
xr set-transform '{"device":"hand-right","position":{"x":0.2,"y":0.95,"z":-0.25}}'
check "one resting hand calibrates the tray" "$(field "$(run calibrate-again.mjs)" "f\"{phase} {result}\"")" "preflight hands"
xr set-transform '{"device":"hand-left","position":{"x":-0.3,"y":0.9,"z":0.1}}'
xr set-transform '{"device":"hand-right","position":{"x":0.3,"y":0.9,"z":0.1}}'

# Gaze-only flight.
POS=$(run positions.mjs)
dwell card-2
check "dwell on a card chooses it" "$(field "$(state)" "plan['taskId']")" "t-2"
dwell dial 1.5
sleep 2
check "dwell steps the dial once, not repeatedly" "$(field "$(state)" "plan['minutes']")" "5"
away; sleep 0.3
dwell dial 1.5
check "look away and back steps it again" "$(field "$(state)" "plan['minutes']")" "10"
POS=$(run positions.mjs)
dwell takeoff-button
check "dwell on Take off starts cruise" "$(field "$(state)" "phase")" "cruise"
check "reduced motion: the cabin dims at once" "$(field "$(run focus-state.mjs)" "focus")" "1"
POS=$(run positions.mjs)
dwell jar-hit
check "dwell on the jar parks a thought" "$(field "$(run jar-state.mjs)" "parkedThisFlight")" "1"
away
run land-now.mjs >/dev/null
POS=$(run positions.mjs)
dwell done-stack
check "dwell on Done finishes the task" "$(field "$(state)" "phase")" "winddown"
FOV=$(run fov-check.mjs)
check "large wind-down panel fits the view" "$(field "$FOV" "all(e['ok'] for e in elements)")" "True"
POS=$(run positions.mjs)
dwell wind-down-skip
check "dwell on Skip shows the summary" "$(field "$(run wind-down-state.mjs)" "f\"{step} {summaryVisible}\"")" "summary True"
FOV=$(run fov-check.mjs)
check "large summary, buttons and postcard fit the view" "$(field "$FOV" "f\"{len(elements)} {all(e['ok'] for e in elements)}\"")" "4 True"
POS=$(run positions.mjs)
dwell summary-finish 2
check "dwell on Finish ends the session" "$(field "$(run checkin-state.mjs)" "phase")" "checkin"
run a11y-reset.mjs >/dev/null
