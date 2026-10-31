#!/usr/bin/env bash
# Runs every scripted suite and prints one line per suite. Needs the dev
# server running with --allow-browser-automation.
cd "$(dirname "$0")/.."
summary() {
  python3 -c "
import sys
lines = sys.stdin.read().splitlines()
fails = [l for l in lines if l.startswith('FAIL')]
print(f'{sys.argv[1]:<20} {sum(l.startswith(\"PASS\") for l in lines):>3} pass  {len(fails)} fail')
for f in fails: print('   ', f)" "$1"
}
for t in checkin-smoke cards-smoke dial-smoke route-unit; do
  npx @iwsdk/cli xr exit >/dev/null 2>&1
  sleep 1
  npx @iwsdk/cli browser run "tests/$t.mjs" 2>&1 \
    | python3 -c "import json,sys;d=json.load(sys.stdin);print(d.get('data',{}).get('result') or 'FAIL could not run')" \
    | summary "$t"
done
for t in cards-input dial-input calibration-input boarding-input steps-input gaze-off gaze-targets fov-check flight-e2e; do
  "./tests/$t.sh" 2>&1 | summary "$t"
done
