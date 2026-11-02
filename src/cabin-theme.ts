import { Color, createSystem, DirectionalLight, Material, Mesh } from '@iwsdk/core';
import { flightPhase, FlightPhase } from './flight-state.js';
import { PALETTE } from './models.js';
import { loadProgress } from './storage.js';

export type CabinTheme = 'day' | 'night';

type Look = {
  /** Mesh name → colour. */
  meshes: Record<string, number>;
  light: { color: number; intensity: number };
  /** Seat-back map background. */
  sky: string;
};

const LOOKS: Record<CabinTheme, Look> = {
  day: {
    meshes: {
      'tray-top': PALETTE.trayTop,
      'tray-rim': PALETTE.trayRim,
      'seat-pocket': PALETTE.fabric,
      'seat-pocket-band': PALETTE.fabricBand,
    },
    light: { color: 0xfff1dd, intensity: 0.9 },
    sky: '#101a33',
  },
  night: {
    // Walnut tray, deep-blue pocket, warm amber reading light.
    meshes: {
      'tray-top': 0x6b4a32,
      'tray-rim': 0x3e2a1c,
      'seat-pocket': 0x161a2e,
      'seat-pocket-band': 0x8a6a2f,
    },
    light: { color: 0xffc98a, intensity: 1.1 },
    sky: '#060a1a',
  },
};

/** What the seat-back screen paints its sky with; follows the cabin. */
export const THEME_LOOK = { sky: LOOKS.day.sky };

type Colored = Material & { color: Color; userData: { focusBase?: Color } };

/**
 * Dresses the cabin in the theme chosen on the check-in page, on every
 * boarding. Themes are earned (a 3-day streak unlocks Night); a theme
 * that is not unlocked falls back to the day cabin.
 */
export class CabinThemeSystem extends createSystem({}) {
  theme: CabinTheme = 'day';

  init(): void {
    this.cleanupFuncs.push(
      flightPhase.subscribe((phase) => {
        if (phase === FlightPhase.Calibrating) this.apply(chosenTheme());
      }),
    );
    if (import.meta.env.DEV) {
      const debug = window as unknown as { seat14c?: Record<string, unknown> };
      debug.seat14c = Object.assign(debug.seat14c ?? {}, {
        cabinTheme: () => this.theme,
        applyCabinTheme: (theme: CabinTheme) => this.apply(theme),
      });
    }
  }

  apply(theme: CabinTheme): void {
    this.theme = theme;
    const look = LOOKS[theme];
    THEME_LOOK.sky = look.sky;
    const scene = this.world.scene;
    for (const [name, color] of Object.entries(look.meshes)) {
      const mesh = scene.getObjectByName(name) as Mesh | undefined;
      if (mesh == null) continue;
      for (const material of ([] as Material[]).concat(mesh.material)) {
        const colored = material as Colored;
        colored.color.setHex(color);
        // Focus mode dims from this base; keep it in step.
        colored.userData.focusBase?.setHex(color);
      }
    }
    const light = scene.getObjectByName('reading-light') as DirectionalLight | undefined;
    if (light != null) {
      light.color.setHex(look.light.color);
      light.intensity = look.light.intensity;
    }
  }
}

/** The theme to fly with: the saved choice if it has been unlocked. */
export function chosenTheme(): CabinTheme {
  const progress = loadProgress();
  return progress.cabinTheme === 'night' && progress.themes.includes('night') ? 'night' : 'day';
}
