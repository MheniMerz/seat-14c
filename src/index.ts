/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { World } from '@iwsdk/core';
import projectOptions from 'virtual:iwsdk-project';
import { CalibrationSystem } from './calibration.js';
import { CardSystem } from './cards.js';
import { mountCheckIn } from './checkin.js';
import { DialSystem } from './dial.js';
import { FlightSystem } from './flight-state.js';
import { FlightTimerSystem } from './flight-timer.js';
import { InputTuningSystem } from './input-tuning.js';
import { LandingSystem } from './landing.js';
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
  world.registerSystem(LandingSystem);
  mountCheckIn(world);
});
