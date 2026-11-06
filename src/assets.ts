import { AssetType, defineAssets } from '@iwsdk/core';
import { createFocusOrb } from './scene-assets/orb.scene-asset.js';

const publicAssetUrl = (filePath: string): string =>
  `${import.meta.env.BASE_URL}${filePath.replace(/^\/+/u, '')}`;

const uikitml = (fileName: string, name: string) => ({
  url: publicAssetUrl(`ui/${fileName}`),
  type: AssetType.UIKitML,
  name,
});

export default defineAssets({
  'focus-orb': createFocusOrb(),
  'ui-time-label': uikitml('time-label.uikitml', 'Time Label'),
});
