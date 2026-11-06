import {
  AdditiveBlending,
  Color,
  CylinderGeometry,
  Group,
  IcosahedronGeometry,
  Mesh,
  MeshStandardMaterial,
  Sprite,
  SpriteMaterial,
} from '@iwsdk/core';
import { createGlowTexture } from './orb.scene-asset.js';

/** Radius of an environment-picker orb in meters (4 cm diameter). */
export const ENV_ORB_RADIUS = 0.02;

/**
 * Small glowing picker orb for one environment. Origin at the center. The
 * selected orb is shown at full scale, the other one smaller. ~320 triangles.
 */
export function createEnvOrb(name: string, core: number, glow: number): Group {
  const root = new Group();
  root.name = name;
  const sphere = new Mesh(
    new IcosahedronGeometry(ENV_ORB_RADIUS, 2),
    new MeshStandardMaterial({
      color: new Color(core),
      emissive: new Color(core),
      emissiveIntensity: 0.9,
      roughness: 0.4,
      metalness: 0,
    }),
  );
  sphere.name = 'Core';
  root.add(sphere);
  const halo = new Sprite(
    new SpriteMaterial({
      map: createGlowTexture(),
      color: new Color(glow),
      transparent: true,
      opacity: 0.6,
      blending: AdditiveBlending,
      depthWrite: false,
    }),
  );
  halo.name = 'Halo';
  halo.scale.setScalar(ENV_ORB_RADIUS * 4);
  halo.renderOrder = 1;
  halo.userData.iwsdkPreviewBounds = 'exclude';
  root.add(halo);
  return root;
}

/**
 * Pinchable mute token: a 3.6 cm dark disc facing +Z (toward the user). The
 * speaker icon is a separate UIKitML panel placed just in front of it.
 */
export function createMuteToken(): Group {
  const root = new Group();
  root.name = 'MuteToken';
  const geometry = new CylinderGeometry(0.018, 0.018, 0.006, 24);
  geometry.rotateX(Math.PI / 2);
  const disc = new Mesh(
    geometry,
    new MeshStandardMaterial({ color: 0x1b1c20, roughness: 0.6, metalness: 0 }),
  );
  disc.name = 'Disc';
  root.add(disc);
  return root;
}
