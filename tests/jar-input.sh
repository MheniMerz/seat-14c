#!/usr/bin/env bash
# Parking-lot jar: hidden until cruise; a quick pinch-flick toward the jar
# parks a thought, a flick away or a slow carry does not; look + pinch on the
# jar parks one too. After landing the thoughts wait on the check-in page,
# where one becomes a task and one is let go.
set -euo pipefail
shopt -s extglob
cd "$(dirname "$0")/.."

cli() { npx @iwsdk/cli "$@" 2>&1; }
xr() { cli xr "$1" --input-json "$2" >/dev/null; }
run() { cli browser run "tests/$1" | python3 -c "import json,sys;print(json.load(sys.stdin)['data']['result'])"; }
field() { python3 -c "import json,sys;d=json.loads(sys.argv[1]);print(eval(sys.argv[2], {}, d))" "$1" "$2"; }
at() { python3 -c "import json,sys;print(json.dumps(json.loads(sys.argv[1])[sys.argv[2]]))" "$POS" "$1"; }
check() { if [[ "$2" == $3 ]]; then echo "PASS $1 ($2)"; else echo "FAIL $1 (got $2, want $3)"; fi; }
jar() { run jar-state.mjs; }

cli xr exit >/dev/null || true
sleep 1
run thoughts-clear.mjs >/dev/null
run board.mjs >/dev/null
xr set-input-mode '{"mode":"hand"}'
xr set-connected '{"device":"gaze","connected":true}'
xr set-transform '{"device":"hand-left","position":{"x":-0.3,"y":1.0,"z":0}}'
xr set-transform '{"device":"hand-right","position":{"x":0.3,"y":1.0,"z":0}}'
xr look-at '{"device":"gaze","target":{"x":0,"y":2.5,"z":-1}}'

check "jar hidden in preflight" "$(field "$(jar)" "f\"{visible} {interactable}\"")" "False False"
run cruise-start.mjs >/dev/null
check "jar on the tray in cruise" "$(field "$(jar)" "f\"{visible} {interactable} {thoughts}\"")" "True True 0"

# 1. Flicks, driven at real speed inside the page.
F=$(run flick.mjs)
check "quick flick toward the jar parks a thought" "$(field "$F" "flickToward")" "1"
check "flick away from the jar does not" "$(field "$F" "flickAway")" "1"
check "slow pinch-and-carry does not" "$(field "$F" "slowCarry")" "1"
check "a slip lies in the jar" "$(field "$(jar)" "f\"{slips} {thoughts}\"")" "1 1"

# 2. Look at the jar and pinch.
POS=$(run positions.mjs)
xr look-at "{\"device\":\"gaze\",\"target\":$(at jar-hit)}"
sleep 0.4
xr select '{"device":"hand-right","duration":0.2}'
sleep 0.6
check "look + pinch on the jar parks another" "$(field "$(jar)" "f\"{parkedThisFlight} {slips} {thoughts}\"")" "2 2 2"
xr look-at '{"device":"gaze","target":{"x":0,"y":2.5,"z":-1}}'
check "focus clock kept running" "$(field "$(run state.mjs)" "phase")" "cruise"

# 3. Land, finish, and review the thoughts at check-in.
run land-now.mjs >/dev/null
check "jar put away on landing" "$(field "$(jar)" "visible")" "False"
C=$(run thoughts-review.mjs)
check "check-in lists both parked thoughts" "$(field "$C" "before")" "2"
check "no fourth task while three are open" "$(field "$C" "blockedWhenFull")" "True"
check "a parked thought becomes a task" "$(field "$C" "f\"{after} {stored} {sectionHidden} {'Email Sam about the venue' in tasks}\"")" "0 0 True True"
