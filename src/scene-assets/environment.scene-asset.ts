import { Mesh, MeshBasicMaterial, SphereGeometry } from '@iwsdk/core';

/** Radius of the 360 environment sphere in meters. */
export const ENV_SPHERE_RADIUS = 30;

/**
 * Inside-out sphere for an equirectangular environment texture. The geometry
 * is mirrored on X so the inward-facing side shows the image unflipped. It is
 * fully transparent until ImmersionSystem fades it in, and renders before
 * other transparent content so the orb and labels stay on top. 512 triangles.
 */
export function createEnvironmentSphere(): Mesh {
  const geometry = new SphereGeometry(ENV_SPHERE_RADIUS, 32, 16);
  geometry.scale(-1, 1, 1);
  const material = new MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    toneMapped: false,
    fog: false,
  });
  const sphere = new Mesh(geometry, material);
  sphere.name = 'EnvironmentSphere';
  sphere.renderOrder = -10;
  sphere.frustumCulled = false;
  sphere.userData.iwsdkPreviewBounds = 'exclude';
  return sphere;
}
