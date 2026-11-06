import { AssetType, defineAssets } from '@iwsdk/core';
import { createEnvironmentSphere } from './scene-assets/environment.scene-asset.js';
import { createFocusOrb } from './scene-assets/orb.scene-asset.js';

const publicAssetUrl = (filePath: string): string =>
  `${import.meta.env.BASE_URL}${filePath.replace(/^\/+/u, '')}`;

const uikitml = (fileName: string, name: string) => ({
  url: publicAssetUrl(`ui/${fileName}`),
  type: AssetType.UIKitML,
  name,
});

const texture = (fileName: string, name: string) => ({
  url: publicAssetUrl(`environments/${fileName}`),
  type: AssetType.Texture,
  name,
});

export default defineAssets({
  'focus-orb': createFocusOrb(),
  'env-sphere': createEnvironmentSphere(),
  env1: texture('env1.jpg', 'Environment 1'),
  env2: texture('env2.jpg', 'Environment 2'),
  'ui-time-label': uikitml('time-label.uikitml', 'Time Label'),
  'ui-remaining-label': uikitml('remaining-label.uikitml', 'Remaining Label'),
  'ui-finish-card': uikitml('finish-card.uikitml', 'Finish Card'),
});
