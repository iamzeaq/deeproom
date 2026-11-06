import { World } from '@iwsdk/core';
import projectOptions from 'virtual:iwsdk-project';
import { OrbPlacementSystem } from './orb-placement.js';

World.create(
  document.getElementById('scene-container') as HTMLDivElement,
  projectOptions,
).then((world) => {
  world.registerSystem(OrbPlacementSystem);
});
