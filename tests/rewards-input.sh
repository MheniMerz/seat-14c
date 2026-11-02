#!/usr/bin/env bash
# Postcards and the cabin upgrade: a flight that reaches Harbor Point stands
# its postcard on the Now stand at the summary, and the 3-day streak unlocks
# the Night flight cabin. The check-in page shows the postcard collection
# and lets the user pick the new cabin, which the tray wears on boarding.
set -euo pipefail
shopt -s extglob
cd "$(dirname "$0")/.."

cli() { npx @iwsdk/cli "$@" 2>&1; }
run() { cli browser run "tests/$1" | python3 -c "import json,sys;print(json.load(sys.stdin)['data']['result'])"; }
field() { python3 -c "import json,sys;d=json.loads(sys.argv[1]);print(eval(sys.argv[2], {}, d))" "$1" "$2"; }
check() { if [[ "$2" == $3 ]]; then echo "PASS $1 ($2)"; else echo "FAIL $1 (got $2, want $3)"; fi; }

cli xr exit >/dev/null || true
sleep 1
F=$(run rewards-flight.mjs)
check "flight reaches Harbor Point" "$(field "$F" "','.join(d['name'] for d in record['reached'])")" "Harbor Point"
check "3-day streak unlocks the Night cabin" "$(field "$F" "f\"{record['progress']['streakDays']} {' '.join(record['progress']['themes'])} {' '.join(record['unlocked'])}\"")" "3 night night"
check "its postcard stands on the tray" "$(field "$F" "f\"{postcardVisible} {postcardName}\"")" "True Harbor Point"
FOV=$(run fov-check.mjs)
check "postcard and summary fit the view" "$(field "$FOV" "f\"{[e['name'] for e in elements]} {all(e['ok'] for e in elements)}\"")" "*summary-postcard* True"
C=$(run rewards-checkin.mjs)
check "check-in shows the collection" "$(field "$C" "f\"{postcards[0]} {postcards[1]} {len(postcards)}\"")" "Harbor Point:collected Juniper Falls:locked 11"
check "postcard count in the heading" "$(field "$C" "heading")" "*1 of 11*"
check "Night cabin can be chosen and is saved" "$(field "$C" "f\"{nightEnabled} {saved}\"")" "True night"
check "the tray wears the Night cabin" "$(field "$C" "trayTop")" "#6b4a32"
cli xr exit >/dev/null || true
