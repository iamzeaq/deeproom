import { World } from '@iwsdk/core';
import projectOptions from 'virtual:iwsdk-project';
import { OrbPlacementSystem } from './orb-placement.js';
import { SessionSystem } from './session-system.js';
import { SessionUISystem } from './session-ui.js';

World.create(
  document.getElementById('scene-container') as HTMLDivElement,
  projectOptions,
).then((world) => {
  world.registerSystem(OrbPlacementSystem);
  world.registerSystem(SessionSystem);
  world.registerSystem(SessionUISystem);
});
