import {
  AdditiveBlending,
  Color,
  DataTexture,
  Group,
  IcosahedronGeometry,
  LinearFilter,
  Mesh,
  MeshStandardMaterial,
  Sprite,
  SpriteMaterial,
} from '@iwsdk/core';

/** Radius of the solid orb core in meters (12 cm diameter). */
export const ORB_RADIUS = 0.06;

/** Deterministic 64x64 radial falloff used for the soft halo (no DOM). */
export function createGlowTexture(): DataTexture {
  const size = 64;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x + 0.5) / size - 0.5;
      const dy = (y + 0.5) / size - 0.5;
      const r = Math.min(1, Math.sqrt(dx * dx + dy * dy) * 2);
      const a = Math.pow(1 - r, 2.2);
      const i = (y * size + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = 255;
      data[i + 3] = Math.round(a * 255);
    }
  }
  const texture = new DataTexture(data, size, size);
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

/**
 * Deeproom focus orb: a soft, warm emissive core wrapped in a faint additive
 * halo sprite. Origin is the sphere center; +Y up. About 500 triangles.
 * Runtime systems clone the materials per instance before animating them.
 */
export function createFocusOrb(): Group {
  const root = new Group();
  root.name = 'FocusOrb';

  const core = new Mesh(
    new IcosahedronGeometry(ORB_RADIUS, 4),
    new MeshStandardMaterial({
      color: new Color(0xffe2b8),
      emissive: new Color(0xffb46a),
      emissiveIntensity: 1.1,
      roughness: 0.35,
      metalness: 0,
    }),
  );
  core.name = 'Core';
  core.castShadow = false;
  core.receiveShadow = false;
  root.add(core);

  const halo = new Sprite(
    new SpriteMaterial({
      map: createGlowTexture(),
      color: new Color(0xffa860),
      transparent: true,
      opacity: 0.7,
      blending: AdditiveBlending,
      depthWrite: false,
    }),
  );
  halo.name = 'Halo';
  halo.scale.setScalar(ORB_RADIUS * 4.2);
  halo.renderOrder = 1;
  halo.userData.iwsdkPreviewBounds = 'exclude';
  root.add(halo);

  return root;
}
