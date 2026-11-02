/**
 * Desktop visitors (no headset) get IWER, IWSDK's browser-based headset
 * emulator, injected by the production build (see `dev.emulator` in
 * iwsdk.config.json). Headset and phone browsers are excluded by user agent
 * there, so this module only does anything when the emulator is running.
 *
 * It starts the emulator in the easiest mode for a mouse: hand tracking, with
 * gaze following the cursor, so a left click means "look at this and pinch"
 * and a right drag turns the head.
 */

interface EmulationProfile {
  active: boolean;
}

interface EmulatedDevice {
  primaryInputMode: 'hand' | 'controller';
}

interface DevUI {
  setGazeMode(mode: 'off' | 'cursor' | 'head-locked'): void;
}

export function isDesktopEmulator(): boolean {
  const profile = (window as unknown as { __IWSDK_EMULATION_PROFILE?: EmulationProfile })
    .__IWSDK_EMULATION_PROFILE;
  return profile?.active === true;
}

/**
 * `?demo` in the URL runs the flight clock ten times faster, so a 5 minute
 * flight lands in 30 seconds. Meant for judges and demos.
 */
export function demoTimeScale(): number {
  return new URLSearchParams(location.search).has('demo') ? 10 : 1;
}

/** Hands plus cursor gaze. Production only: scripted tests drive gaze themselves. */
export function setUpDesktopEmulator(): void {
  if (import.meta.env.DEV || !isDesktopEmulator()) return;
  const device = (window as unknown as { IWER_DEVICE?: EmulatedDevice }).IWER_DEVICE;
  if (device == null) return;
  try {
    device.primaryInputMode = 'hand';
    // The emulator keeps its dev UI behind a private symbol; find it rather
    // than depend on the symbol's name.
    const holder = device as unknown as Record<symbol, { devui?: DevUI }>;
    for (const key of Object.getOwnPropertySymbols(device)) {
      const devui = holder[key]?.devui;
      if (devui != null && typeof devui.setGazeMode === 'function') {
        devui.setGazeMode('cursor');
        break;
      }
    }
  } catch {
    // The emulator still works with its own defaults.
  }
}
