#!/usr/bin/env bash
# Walks one first-launch flight and checks every screen against the
# Meta VR Glasses field of view. Head looks straight ahead at seat height.
set -euo pipefail
cd "$(dirname "$0")/.."
cli() { npx @iwsdk/cli "$@" 2>&1; }
run() { cli browser run "tests/$1" | python3 -c "import json,sys;print(json.load(sys.stdin)['data']['result'])"; }
report() {
  python3 -c "
import json,sys
r=json.loads(sys.argv[1])
for e in r['elements']:
    flag='PASS' if e['ok'] else 'FAIL'
    print(f\"{flag} {r['phase']:<11} {e['name']:<20} yaw {e['yaw'][0]:>4}..{e['yaw'][1]:<4} pitch {e['pitch'][0]:>4}..{e['pitch'][1]:<4} {e['view']}\")" "$1"
}
cli xr exit >/dev/null || true
sleep 1
run board-first.mjs >/dev/null
cli xr set-transform --input-json '{"device":"headset","position":{"x":0,"y":1.2,"z":0},"orientation":{"pitch":0,"yaw":0,"roll":0}}' >/dev/null
cli xr set-input-mode --input-json '{"mode":"hand"}' >/dev/null
cli xr set-transform --input-json '{"device":"hand-left","position":{"x":-0.3,"y":0.9,"z":0}}' >/dev/null
cli xr set-transform --input-json '{"device":"hand-right","position":{"x":0.3,"y":0.9,"z":0}}' >/dev/null
cli browser run tests/recenter.mjs >/dev/null
report "$(run fov-check.mjs)"
for _ in 1 2 3 4 5 6; do
  run fov-walk.mjs >/dev/null
  report "$(run fov-check.mjs)"
done
