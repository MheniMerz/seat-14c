/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { World } from '@iwsdk/core';
import projectOptions from 'virtual:iwsdk-project';
import { BoardingSystem } from './boarding.js';
import { CalibrationSystem } from './calibration.js';
import { CardSystem } from './cards.js';
import { mountCheckIn } from './checkin.js';
import { DialSystem } from './dial.js';
import { FlightSystem } from './flight-state.js';
import { FeedbackSystem } from './feedback.js';
import { FlightTimerSystem } from './flight-timer.js';
import { FocusSystem } from './focus.js';
import { InputTuningSystem } from './input-tuning.js';
import { LandingSystem } from './landing.js';
import { SeatbackSystem } from './seatback.js';
import { SoundscapeSystem } from './soundscape.js';
import { StepsSystem } from './steps.js';
import { TraySystem } from './tray.js';

World.create(
  document.getElementById('scene-container') as HTMLDivElement,
  projectOptions,
).then((world) => {
  // Order matters: later systems look up the tray in init().
  world.registerSystem(InputTuningSystem);
  world.registerSystem(FlightSystem);
  world.registerSystem(TraySystem);
  world.registerSystem(CalibrationSystem);
  world.registerSystem(CardSystem);
  world.registerSystem(DialSystem);
  world.registerSystem(FlightTimerSystem);
  world.registerSystem(BoardingSystem);
  world.registerSystem(LandingSystem);
  world.registerSystem(SeatbackSystem);
  world.registerSystem(StepsSystem);
  world.registerSystem(FocusSystem);
  world.registerSystem(FeedbackSystem);
  world.registerSystem(SoundscapeSystem);
  mountCheckIn(world);
});
