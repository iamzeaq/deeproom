import { defineComponents } from '@iwsdk/core';
import { FocusOrb } from './orb-components.js';
import {
  AmbientAudio,
  ChimeAudio,
  EnvChoice,
  EnvironmentSphere,
  FocusSession,
  MuteToggle,
  OrbAttachment,
} from './session-components.js';

export default defineComponents([
  FocusOrb,
  FocusSession,
  OrbAttachment,
  EnvChoice,
  MuteToggle,
  EnvironmentSphere,
  AmbientAudio,
  ChimeAudio,
]);
