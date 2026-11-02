/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { defineComponents } from '@iwsdk/core';
import {
  CardBody,
  DialKnob,
  DialRoot,
  DoneStack,
  LandingButton,
  StepRow,
  TakeoffButton,
  TaskCard,
  TrayHeightButton,
  TutorialBody,
  TutorialTarget,
  WindDownSkip,
} from './cabin-components.js';

export default defineComponents([
  TaskCard,
  CardBody,
  DialRoot,
  DialKnob,
  TakeoffButton,
  TrayHeightButton,
  DoneStack,
  LandingButton,
  StepRow,
  TutorialTarget,
  TutorialBody,
  WindDownSkip,
]);
