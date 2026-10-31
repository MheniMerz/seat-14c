import { createComponent, Types } from '@iwsdk/core';

/** Where a task card currently belongs. */
export const CardPlace = {
  Tray: 'tray',
  Now: 'now',
  Pocket: 'pocket',
  Done: 'done',
} as const;

export type CardPlace = (typeof CardPlace)[keyof typeof CardPlace];

/**
 * A task card on the tray. `target*` is the resting pose (in tray space) the
 * card eases toward whenever it is not held.
 */
export const TaskCard = createComponent('TaskCard', {
  taskId: { type: Types.String, default: '' },
  order: { type: Types.Int8, default: 0 },
  place: { type: Types.Enum, default: CardPlace.Tray, enum: CardPlace },
  targetPosition: { type: Types.Vec3, default: [0, 0, 0] },
  targetRotation: { type: Types.Vec4, default: [0, 0, 0, 1] },
  targetScale: { type: Types.Float32, default: 1 },
  /** True while the card's grabbable body is held. */
  held: { type: Types.Boolean, default: false },
});

/**
 * The grabbable, visible part of a task card. Grab handles block ray and
 * gaze pointers for their whole subtree, so the ray hit area lives on the
 * parent {@link TaskCard} entity and the grab lives on this child.
 */
export const CardBody = createComponent('CardBody', {
  card: { type: Types.Entity, default: null },
});

/** The flight dial's ray/gaze hit area; look + pinch steps to the next length. */
export const DialRoot = createComponent('DialRoot', {});

/** The flight dial's grabbable knob; rotates about the tray normal only. */
export const DialKnob = createComponent('DialKnob', {
  /** Resting angle in radians (about tray-space +Y) for the chosen stop. */
  targetAngle: { type: Types.Float32, default: 0 },
});

/** The Take off button: poke it, or look at it and pinch. */
export const TakeoffButton = createComponent('TakeoffButton', {});

/** Raise (+1) or lower (-1) the tray by one step; shown before takeoff. */
export const TrayHeightButton = createComponent('TrayHeightButton', {
  direction: { type: Types.Int8, default: 1 },
});

/** The Done stack on the tray; look + pinch it on landing to finish the task. */
export const DoneStack = createComponent('DoneStack', {});

export const LandingAction = {
  Later: 'later',
  Again: 'again',
  Finish: 'finish',
} as const;

/** Buttons shown on landing and on the summary card. */
export const LandingButton = createComponent('LandingButton', {
  action: { type: Types.Enum, default: LandingAction.Later, enum: LandingAction },
});
