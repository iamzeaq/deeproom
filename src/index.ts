import { World } from '@iwsdk/core';
import projectOptions from 'virtual:iwsdk-project';
import { DemoSystem } from './demo-system.js';
import { ImmersionSystem } from './immersion.js';
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
  world.registerSystem(ImmersionSystem);
  world.registerSystem(DemoSystem);
});
