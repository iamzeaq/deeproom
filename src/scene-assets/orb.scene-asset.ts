import {
  AdditiveBlending,
  BackSide,
  Color,
  Group,
  IcosahedronGeometry,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
} from '@iwsdk/core';

/** Radius of the solid orb core in meters (12 cm diameter). */
export const ORB_RADIUS = 0.06;

/**
 * Deeproom focus orb: a soft, warm emissive core wrapped in a faint additive
 * halo shell. Origin is the sphere center; +Y up. Around 1.3k triangles.
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
      emissiveIntensity: 1.4,
      roughness: 0.35,
      metalness: 0,
    }),
  );
  core.name = 'Core';
  core.castShadow = false;
  core.receiveShadow = false;
  root.add(core);

  const halo = new Mesh(
    new IcosahedronGeometry(ORB_RADIUS * 1.45, 2),
    new MeshBasicMaterial({
      color: new Color(0xffa860),
      transparent: true,
      opacity: 0.18,
      blending: AdditiveBlending,
      depthWrite: false,
      side: BackSide,
    }),
  );
  halo.name = 'Halo';
  halo.renderOrder = 1;
  halo.userData.iwsdkPreviewBounds = 'exclude';
  root.add(halo);

  return root;
}
