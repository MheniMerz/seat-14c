# Seat 14C

A seated, hands-first focus workspace for Meta VR Glasses and Quest, built with
the Immersive Web SDK (IWSDK) 1.0. Board a "flight", finish one task before
landing, and grow a route map one session at a time.

Planning happens in 2D, focus happens in 3D: tasks are typed on the check-in
page, then **Board** starts the immersive passthrough session (XR).

```sh
npm install
npm run dev        # dev server + IWER emulator (Meta VR Glasses profile)
npm run typecheck
npm run build
```

`iwsdk.config.json` is the project authority (XR features, gaze, emulator
device). Systems are registered in `src/index.ts`.

## Layout

| File                    | What it does                                                              |
| ----------------------- | ------------------------------------------------------------------------- |
| `index.html`            | Check-in page markup over the 3D canvas                                   |
| `src/checkin.ts`        | Up to three tasks with optional steps: add, edit, reorder, Board          |
| `src/storage.ts`        | `Task` / `Progress` types and on-device storage, every call guarded       |
| `src/progress.ts`       | Miles (8 per focus minute), daily streak, task status after a landing     |
| `src/flight-state.ts`   | Flight phase signal, flight plan and clock, `FlightSystem`                |
| `src/input-tuning.ts`   | Shortens poke hover to 6 cm so resting hands don't switch gaze off        |
| `src/tray.ts`           | Tray table, its layout (Now stand, pocket, dial, Done), height            |
| `src/calibration.ts`    | Hands-at-rest calibration, 5 s timeout, Raise / Lower on the seat back    |
| `src/boarding.ts`       | First-launch boarding pass: tear stub, pocket the pass, twist the dial    |
| `src/cards.ts`          | Task cards: grab or look + pinch onto the Now stand; pocket; Done         |
| `src/dial.ts`           | Flight dial: pinch and twist, snaps to 5/10/25/45; look + pinch steps     |
| `src/flight-timer.ts`   | Take off button, focus clock, progress line under the active card         |
| `src/landing.ts`        | Chime, Done stack, Not yet, saving the flight, summary card               |
| `src/jar.ts`            | Parking-lot jar: flick toward it or look + pinch to park a thought   |
| `src/wind-down.ts`      | One-minute breathing guide after landing (4 s in, 6 s out), Skip      |
| `src/audio.ts`          | Synthesized cabin sounds (WebAudio): clicks, detents, seat-belt chime     |
| `src/feedback.ts`       | Click on every press, pick/drop sounds on every grab                      |
| `src/soundscape.ts`     | Engines spool up at takeoff, hum in cruise, spool down on landing         |
| `src/steps.ts`          | Active task's steps beside the Now card; look reveals, pinch/poke ticks   |
| `src/focus.ts`          | Cruise focus: dims the passthrough room, fades all but the active card    |
| `src/route.ts`          | Fictional destinations by cumulative miles; postcards when reached        |
| `src/seatback.ts`       | Seat-back screen: in-flight map of the planned and flown route            |
| `src/desktop-emulator.ts` | Live-site emulator for desktop visitors: hands + cursor gaze, `?demo` |
| `src/models.ts`         | Cabin palette and the rounded-slab model helper                           |
| `src/cabin-components.ts` | ECS components for all of the above                                     |
| `tests/`                | Scripted checks against the managed browser (see below)                   |

## Interaction notes

- IWSDK grab handles block ray and gaze pointers for their whole subtree. Each
  card and the dial is therefore two entities: a parent with a larger
  invisible hit area for gaze/rays, and a grabbable child that is the visible
  part.
- On VR Glasses, gaze replaces hand rays. Gaze turns off while a hand hovers
  anything, which is why the poke hover radius is cut from 20 cm to 6 cm.
- `tests/fov-check.sh` holds every screen to the VR Glasses' 70° x 66° view:
  the active card, its progress line, the dial's time to go and floating
  panels must be visible looking straight ahead; the rest within a 15° glance
  down. Raise / Lower moved to the seat back because the tray's sides were
  outside that width and the dial's hit area stole gaze from them.
- A flick is a pinch released within 0.8 s after moving at least 8 cm within
  50° of the jar's direction; letting go of a grabbed card never counts.
  `tests/flick.mjs` drives the emulated hand inside the page so the gesture
  runs at real speed.
- Every action works by direct hands and by look + pinch. The dial steps
  through lengths on look + pinch rather than using four chips, because chips
  around a 7 cm dial would sit closer than gaze can separate (about 9 cm).

## Dev controls (dev builds only)

- Keys `1`–`6` jump between the XR phases: calibrating, boarding, preflight,
  cruise, landing, wind-down. A strip in the bottom-left shows the current one.
- `window.seat14c` exposes the phase, flight plan and per-system test hooks
  (`cards()`, `chooseCard()`, `dialState()`, `setTimeScale()`, `land()`, …).

## Scripted tests

Start the dev server with automation enabled, then run `./tests/run-all.sh`
for one line per suite, or any single suite:

```sh
npx @iwsdk/cli dev up --allow-browser-automation

npx @iwsdk/cli browser run tests/checkin-smoke.mjs   # check-in page
npx @iwsdk/cli browser run tests/cards-smoke.mjs     # card rules
npx @iwsdk/cli browser run tests/dial-smoke.mjs      # dial, take off, clock
npx @iwsdk/cli browser run tests/route-unit.mjs      # miles, streak, postcards
npx @iwsdk/cli browser run tests/desktop-click.mjs   # live-site emulator: click = look + pinch
./tests/cards-input.sh        # gaze + pinch and pinch-grab on cards
./tests/dial-input.sh         # pinch-and-twist, gaze + pinch dial / Take off
./tests/calibration-input.sh  # timeout, resting hands, Raise / Lower, poke
./tests/boarding-input.sh     # tutorial by hand gestures, then by look + pinch
./tests/steps-input.sh        # steps reveal, tick by gaze and poke; cabin dims
./tests/jar-input.sh          # flick vs. not-a-flick, look + pinch, review at check-in
./tests/wind-down-input.sh    # breathing pace, Skip by poke, summary after a minute
./tests/gaze-off.sh           # every look + pinch action by hand ray, gaze off
./tests/gaze-targets.sh       # gaze on each target hovers that target only
./tests/fov-check.sh          # every screen against the 70° x 66° glasses view
./tests/flight-e2e.sh         # one full flight with real emulated input
./tests/capture-sheet.sh      # writes docs/greybox-flight.png
```

The `.sh` tests drive emulated hands and gaze through `npx @iwsdk/cli xr`; the
only dev shortcut in `flight-e2e.sh` is a faster flight clock.

## Deploy

Every push to `main` builds and publishes to GitHub Pages
(`.github/workflows/deploy.yml`). One-time setup: repository Settings → Pages
→ Source: **GitHub Actions**. Production builds hide the gaze debug reticle,
turn off gaze console diagnostics and leave out the dev controls.

### Trying the live site without a headset

The production build carries IWER, so a desktop browser can fly the whole
thing (`dev.emulator.injectOnBuild` + `activation: "always"` in
`iwsdk.config.json`). It stays off in headset and phone browsers: the
`userAgentException` pattern matches Quest/Oculus Browser, Pico, Wolvic,
Android and iOS, so those keep their native WebXR. On desktop the emulator
starts as Meta VR Glasses in hand mode with cursor gaze: **left click** an
object to look at it and pinch, **right drag** to turn your head. Add `?demo`
to the URL to run flights ten times faster.

The emulator loads its virtual room from unpkg.com; if that is blocked the
session still works against a plain background.

- IWER emulator controls: https://iwsdk.dev/guides/02-testing-experience.html#iwer-controls
