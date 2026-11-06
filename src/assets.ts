import { defineAssets } from '@iwsdk/core';
import { createFocusOrb } from './scene-assets/orb.scene-asset.js';

export default defineAssets({
  'focus-orb': createFocusOrb(),
});
